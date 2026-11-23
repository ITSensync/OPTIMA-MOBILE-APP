package com.optima.rfid

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.SoundPool
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import dalvik.system.DexClassLoader
import java.io.File
import java.io.FileOutputStream
import java.io.BufferedInputStream
import java.lang.reflect.Field
import java.lang.reflect.Method
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Bridge untuk modul UHF internal EL-UHF-RH02.
 *
 * UHF-G 3.6 tidak mengeluarkan EPC sebagai keyboard/Broadcast. APK vendor
 * menyimpan wrapper Java dan library serial di dalam APK-nya sendiri. Wrapper
 * vendor disimpan sebagai asset lokal hasil ekstraksi APK UHF-G yang diberikan
 * pemilik device, lalu dipanggil melalui DexClassLoader agar package vendor
 * tidak bercampur dengan package aplikasi OPTIMA.
 */
class UhfReaderModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  companion object {
    private const val NAME = "UhfReader"
    private const val TAG_EVENT = "UhfReaderTag"
    private const val STATUS_EVENT = "UhfReaderStatus"
    private const val TRIGGER_EVENT = "UhfReaderTrigger"
    // UHF-G Power 5 matches the close-range read distance configured on the
    // handheld. Apply it before every inventory start because the vendor SDK
    // can restore its default power when a new inventory is opened.
    private const val READER_POWER = 5
    private const val VENDOR_DEX_ASSET = "uhf-g/classes.dex"
    private const val VENDOR_CLASS = "com.handheld.uhfr.UHFRManager"
    private val TRIGGER_ACTIONS = arrayOf("android.rfid.FUN_KEY", "android.intent.action.FUN_KEY")
    // Handheld Android umumnya memetakan trigger fisik menjadi salah satu F1–F12.
    // Unit lama mengirim F3/F4/F7 (0x85/0x86/0x89), tetapi firmware lain dapat
    // memakai fungsi-key berbeda.
    private val TRIGGER_KEYS = (KeyEvent.KEYCODE_F1..KeyEvent.KEYCODE_F12).toSet()

    @Volatile
    private var activeModule: UhfReaderModule? = null

    /** Dipanggil Activity ketika firmware mengirim trigger sebagai KeyEvent. */
    fun onHardwareKeyEvent(event: KeyEvent): Boolean {
      val module = activeModule ?: return false
      return module.handleHardwareKeyEvent(event)
    }
  }

  private val worker = Executors.newSingleThreadExecutor()
  private val pollWorker = Executors.newSingleThreadExecutor()
  private val feedbackHandler = Handler(Looper.getMainLooper())
  @Volatile private var scanSoundPool: SoundPool? = null
  @Volatile private var scanSoundId = 0
  @Volatile private var scanSoundLoaded = false
  @Volatile private var fallbackToneGenerator: ToneGenerator? = null
  private val reading = AtomicBoolean(false)
  private val triggerPressed = AtomicBoolean(false)
  private val lastTriggerAtMs = AtomicLong(0)
  private var pollTask: Future<*>? = null
  private val lastEmittedTags = mutableMapOf<String, Long>()
  private var vendorLoader: DexClassLoader? = null
  private var managerClass: Class<*>? = null
  private var manager: Any? = null
  private var receiverRegistered = false

  init {
    activeModule = this
  }

  private val triggerReceiver = object : BroadcastReceiver() {
    override fun onReceive(receiverContext: Context?, intent: Intent?) {
      if (intent == null) return
      var keyCode = intent.getIntExtra("keyCode", 0)
      if (keyCode == 0) keyCode = intent.getIntExtra("keycode", 0)

      val hasKeyDown = intent.hasExtra("keydown") || intent.hasExtra("keyDown")
      val keyDown = when {
        intent.hasExtra("keydown") -> intent.getBooleanExtra("keydown", false)
        intent.hasExtra("keyDown") -> intent.getBooleanExtra("keyDown", false)
        else -> false
      }
      val recognized = keyCode in TRIGGER_KEYS
      if (!recognized) {
        emitTriggerDiagnostic(
          source = "broadcast",
          action = intent.action.orEmpty(),
          keyCode = keyCode,
          recognized = false,
          detail = "Broadcast diterima, tetapi keyCode tidak dikenali",
        )
        return
      }

      if (hasKeyDown && keyDown) {
        triggerPressed.set(true)
        emitTriggerDiagnostic(
          source = "broadcast",
          action = intent.action.orEmpty(),
          keyCode = keyCode,
          recognized = true,
          detail = "KEY_DOWN broadcast diterima; menunggu KEY_UP",
        )
        return
      }

      // Bila Activity sudah menerima KEY_DOWN, tunggu KEY_UP dari Activity.
      // Ini menghindari satu tekanan diproses dua kali pada firmware yang
      // mengirim KeyEvent sekaligus broadcast tanpa informasi tekan/lepas.
      if (!hasKeyDown && triggerPressed.get()) {
        emitTriggerDiagnostic(
          source = "broadcast",
          action = intent.action.orEmpty(),
          keyCode = keyCode,
          recognized = true,
          detail = "Broadcast duplikat diabaikan; KeyEvent sedang diproses",
        )
        return
      }

      triggerPressed.set(false)
      emitTriggerDiagnostic(
        source = "broadcast",
        action = intent.action.orEmpty(),
        keyCode = keyCode,
        recognized = true,
        detail = "Broadcast trigger diterima; toggle diminta",
      )
      requestTriggerToggle("trigger")
    }
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun initialize(promise: Promise) {
    worker.execute {
      try {
        // Register first so a transient getInstance() failure can be recovered
        // by pressing the handheld trigger without restarting the app.
        registerTriggerReceiver()
        ensureManager()
        prepareScanSound()
        emitStatus("ready", "Reader UHF siap")
        promise.resolve(statusMap("ready", "Reader UHF siap"))
      } catch (error: Throwable) {
        val message = readableError(error)
        emitStatus("error", message)
        promise.reject("UHF_INIT_FAILED", message, error)
      }
    }
  }

  @ReactMethod
  fun startReading(promise: Promise) {
    worker.execute {
      try {
        val status = startReadingInternal("ui")
        promise.resolve(statusMap(status.first, status.second))
      } catch (error: Throwable) {
        val message = readableError(error)
        emitStatus("error", message)
        promise.reject("UHF_START_FAILED", message, error)
      }
    }
  }

  @ReactMethod
  fun stopReading(promise: Promise) {
    worker.execute {
      try {
        val status = stopReadingInternal("ui")
        promise.resolve(statusMap(status.first, status.second))
      } catch (error: Throwable) {
        val message = readableError(error)
        emitStatus("error", message)
        promise.reject("UHF_STOP_FAILED", message, error)
      }
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    promise.resolve(
      statusMap(
        if (reading.get()) "reading" else if (manager != null) "ready" else "idle",
        if (reading.get()) "Sedang membaca tag" else "Reader siap",
      ),
    )
  }

  @ReactMethod
  fun playScanFeedback() {
    feedbackHandler.post {
      try {
        val pool = scanSoundPool
        if (pool != null && scanSoundLoaded) {
          val streamId = pool.play(scanSoundId, 1f, 1f, 1, 0, 1f)
          if (streamId != 0) return@post
        }

        // Fallback while the WAV is loading or if the audio device rejects it.
        val tone = fallbackToneGenerator ?: ToneGenerator(AudioManager.STREAM_MUSIC, 100)
          .also { fallbackToneGenerator = it }
        tone.startTone(ToneGenerator.TONE_PROP_BEEP, 80)
      } catch (_: RuntimeException) {
        // Audio feedback must not interfere with tag reading.
      }
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter. The polling worker is lifecycle-managed
    // by initialize/start/stop rather than by listener count.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by NativeEventEmitter.
  }

  override fun invalidate() {
    feedbackHandler.removeCallbacksAndMessages(null)
    scanSoundPool?.release()
    scanSoundPool = null
    scanSoundId = 0
    scanSoundLoaded = false
    fallbackToneGenerator?.release()
    fallbackToneGenerator = null
    stopReadingInternal("invalidate")
    manager?.let {
      try {
        invokeManager("close")
      } catch (_: Throwable) {
        // The vendor manager may already be closed when the process is torn down.
      }
    }
    unregisterTriggerReceiver()
    if (activeModule === this) {
      activeModule = null
    }
    pollWorker.shutdownNow()
    worker.shutdownNow()
    super.invalidate()
  }

  /** Loads a real short beep so feedback does not depend on notification tones. */
  private fun prepareScanSound() {
    if (scanSoundPool != null) return
    try {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      val pool = SoundPool.Builder()
        .setAudioAttributes(attributes)
        .setMaxStreams(2)
        .build()
      pool.setOnLoadCompleteListener { _, sampleId, status ->
        if (status == 0 && sampleId == scanSoundId) {
          scanSoundLoaded = true
        }
      }
      scanSoundPool = pool
      scanSoundId = pool.load(context, R.raw.scanner_beep, 1)
    } catch (_: RuntimeException) {
      // The ToneGenerator fallback remains available if SoundPool is unsupported.
      scanSoundPool?.release()
      scanSoundPool = null
      scanSoundId = 0
      scanSoundLoaded = false
    }
  }

  private fun ensureManager() {
    if (manager != null) return

    val dexFile = copyVendorDex()
    val nativeDir = copyVendorLibraries()
    val optimizedDir = File(context.codeCacheDir, "uhf-g-opt").apply { mkdirs() }
    val loader = DexClassLoader(
      dexFile.absolutePath,
      optimizedDir.absolutePath,
      nativeDir.absolutePath,
      context.classLoader,
    )
    val clazz = loader.loadClass(VENDOR_CLASS)
    val instance = clazz.getMethod("getInstance").invoke(null)
      ?: error("UHF-G tidak dapat membuka modul reader")

    vendorLoader = loader
    managerClass = clazz
    manager = instance
  }

  private fun copyVendorDex(): File {
    val out = File(context.filesDir, "uhf-g/classes.dex")
    if (!out.exists() || out.length() < 1_000_000L) {
      out.parentFile?.mkdirs()
      context.assets.open(VENDOR_DEX_ASSET).use { input ->
        FileOutputStream(out).use { output -> input.copyTo(output) }
      }
    }
    return out
  }

  private fun copyVendorLibraries(): File {
    val nativeDir = File(context.filesDir, "uhf-g/lib/arm64-v8a").apply { mkdirs() }
    val libraries = listOf(
      "libdevapi.so",
      "libirdaSerialPort.so",
      "libjni_rfid_driver.so",
      "libModuleAPIJni.so",
      "libSerialPort.so",
      "libserial_port.so",
    )

    for (library in libraries) {
      val out = File(nativeDir, library)
      if (!out.exists() || out.length() == 0L) {
        context.assets.open("uhf-g/arm64-v8a/$library").use { input ->
          BufferedInputStream(input).use { bufferedInput ->
            FileOutputStream(out).use { output -> bufferedInput.copyTo(output) }
          }
        }
        out.setReadable(true, false)
        out.setExecutable(true, false)
      }
    }
    return nativeDir
  }

  private fun startReadingInternal(source: String): Pair<String, String> {
    ensureManager()
    if (reading.get()) return "reading" to "Reader sudah sedang membaca"

    // UHF-G stores its own settings separately from this application. Set the
    // power here as well so OPTIMA cannot fall back to the reader default
    // (33) after UHF-G has been closed.
    setReaderPower(READER_POWER)
    reading.set(true)

    val result = try {
      invokeManager("asyncStartReading")
    } catch (error: Throwable) {
      reading.set(false)
      throw error
    }
    lastEmittedTags.clear()
    emitStatus("reading", "Sedang membaca tag ($source): $result")
    pollTask = pollWorker.submit { pollTags() }
    return "reading" to "Pembacaan dimulai"
  }

  private fun stopReadingInternal(source: String): Pair<String, String> {
    if (!reading.getAndSet(false)) {
      return "ready" to "Reader siap"
    }
    pollTask?.cancel(true)
    pollTask = null
    manager?.let { invokeManager("asyncStopReading") }
    emitStatus("ready", "Pembacaan dihentikan ($source)")
    return "ready" to "Pembacaan dihentikan"
  }

  /** Menangani trigger yang langsung dikirim Android ke Activity sebagai KeyEvent. */
  private fun handleHardwareKeyEvent(event: KeyEvent): Boolean {
    val recognized = event.keyCode in TRIGGER_KEYS
    val keyDescription = "${KeyEvent.keyCodeToString(event.keyCode)} ${event.actionLabel()}"
    if (!recognized) {
      emitTriggerDiagnostic(
        source = "key_event",
        action = keyDescription,
        keyCode = event.keyCode,
        recognized = false,
        detail = "KeyEvent diterima Activity, tetapi bukan F1–F12",
      )
      return false
    }

    when (event.action) {
      KeyEvent.ACTION_DOWN -> {
        if (event.repeatCount == 0) {
          triggerPressed.set(true)
        }
        emitTriggerDiagnostic(
          source = "key_event",
          action = keyDescription,
          keyCode = event.keyCode,
          recognized = true,
          detail = if (event.repeatCount == 0) "KEY_DOWN dikenali" else "KEY_DOWN repeat diabaikan",
        )
      }
      KeyEvent.ACTION_UP -> {
        triggerPressed.set(false)
        emitTriggerDiagnostic(
          source = "key_event",
          action = keyDescription,
          keyCode = event.keyCode,
          recognized = true,
          detail = "KEY_UP dikenali; toggle diminta",
        )
        requestTriggerToggle("tombol fisik")
      }
      else -> emitTriggerDiagnostic(
        source = "key_event",
        action = keyDescription,
        keyCode = event.keyCode,
        recognized = true,
        detail = "Aksi KeyEvent tidak didukung",
      )
    }
    return true
  }

  private fun KeyEvent.actionLabel(): String = when (action) {
    KeyEvent.ACTION_DOWN -> "ACTION_DOWN"
    KeyEvent.ACTION_UP -> "ACTION_UP"
    else -> "ACTION_$action"
  }

  /**
   * Broadcast dan KeyEvent dapat diterima bersamaan pada beberapa firmware.
   * Jeda singkat ini membuat satu tekan/lepas hanya mengubah status satu kali.
   */
  private fun requestTriggerToggle(source: String) {
    val now = SystemClock.elapsedRealtime()
    while (true) {
      val previous = lastTriggerAtMs.get()
      if (now - previous < 350L) {
        emitTriggerDiagnostic(
          source = source,
          action = "debounce",
          keyCode = null,
          recognized = false,
          detail = "Event trigger diabaikan karena duplikat dalam 350 ms",
        )
        return
      }
      if (lastTriggerAtMs.compareAndSet(previous, now)) break
    }

    worker.execute {
      try {
        val result = if (reading.get()) {
          stopReadingInternal(source)
        } else {
          startReadingInternal(source)
        }
        emitTriggerDiagnostic(
          source = source,
          action = if (result.first == "reading") "start" else "stop",
          keyCode = null,
          recognized = true,
          detail = "Toggle berhasil: ${result.second}",
        )
      } catch (error: Throwable) {
        val message = readableError(error)
        emitStatus("error", message)
        emitTriggerDiagnostic(
          source = source,
          action = "toggle",
          keyCode = null,
          recognized = true,
          detail = "Toggle gagal: $message",
        )
      }
    }
  }

  private fun pollTags() {
    while (reading.get() && !Thread.currentThread().isInterrupted) {
      try {
        val result = invokeManager("tagInventoryRealTime")
        if (result is Iterable<*>) {
          for (tag in result) {
            val epc = extractEpc(tag)
            val now = System.currentTimeMillis()
            val lastSeen = lastEmittedTags[epc] ?: 0L
            if (epc.isNotEmpty() && now - lastSeen >= 300L) {
              lastEmittedTags[epc] = now
              emitTag(epc)
            }
          }
        }
        Thread.sleep(80L)
      } catch (error: InterruptedException) {
        Thread.currentThread().interrupt()
        return
      } catch (error: Throwable) {
        emitStatus("error", readableError(error))
        reading.set(false)
        return
      }
    }
  }

  private fun extractEpc(tag: Any?): String {
    if (tag == null) return ""
    val field: Field = tag.javaClass.getField("EpcId")
    val bytes = field.get(tag) as? ByteArray ?: return ""
    return bytes.joinToString("") { byte -> "%02X".format(byte.toInt() and 0xff) }
  }

  private fun invokeManager(methodName: String): Any? {
    val clazz = managerClass ?: error("Reader belum diinisialisasi")
    val instance = manager ?: error("Reader belum terhubung")
    val method: Method = clazz.getMethod(methodName)
    return method.invoke(instance)
  }

  /**
   * Applies the reader output power through the vendor SDK. UHF-G exposes
   * this as setPower(readPower, writePower), not setPower(power).
   */
  private fun setReaderPower(power: Int) {
    val clazz = managerClass ?: error("Reader belum diinisialisasi")
    val instance = manager ?: error("Reader belum terhubung")
    val method = clazz.methods.firstOrNull { candidate ->
      candidate.name == "setPower" && candidate.parameterTypes.size == 2 &&
        candidate.parameterTypes.all(::isNumericType)
    } ?: error("SDK UHF-G tidak menyediakan setPower(readPower, writePower)")

    val readPower = numericArgument(method.parameterTypes[0], power)
    val writePower = numericArgument(method.parameterTypes[1], power)
    method.invoke(instance, readPower, writePower)
  }

  private fun numericArgument(type: Class<*>, value: Int): Any = when (type) {
    java.lang.Byte.TYPE, java.lang.Byte::class.java -> value.toByte()
    java.lang.Short.TYPE, java.lang.Short::class.java -> value.toShort()
    java.lang.Integer.TYPE, java.lang.Integer::class.java -> value
    java.lang.Long.TYPE, java.lang.Long::class.java -> value.toLong()
    java.lang.Float.TYPE, java.lang.Float::class.java -> value.toFloat()
    java.lang.Double.TYPE, java.lang.Double::class.java -> value.toDouble()
    else -> error("Tipe parameter setPower tidak didukung: ${type.name}")
  }

  private fun isNumericType(type: Class<*>): Boolean =
    type == java.lang.Byte.TYPE || type == java.lang.Byte::class.java ||
      type == java.lang.Short.TYPE || type == java.lang.Short::class.java ||
      type == java.lang.Integer.TYPE || type == java.lang.Integer::class.java ||
      type == java.lang.Long.TYPE || type == java.lang.Long::class.java ||
      type == java.lang.Float.TYPE || type == java.lang.Float::class.java ||
      type == java.lang.Double.TYPE || type == java.lang.Double::class.java

  private fun registerTriggerReceiver() {
    if (receiverRegistered) return
    val filter = IntentFilter().apply { TRIGGER_ACTIONS.forEach(::addAction) }
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(triggerReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      context.registerReceiver(triggerReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterTriggerReceiver() {
    if (!receiverRegistered) return
    try {
      context.unregisterReceiver(triggerReceiver)
    } catch (_: IllegalArgumentException) {
      // Receiver was already unregistered by the Android lifecycle.
    }
    receiverRegistered = false
  }

  private fun emitTag(epc: String) {
    val event = Arguments.createMap().apply {
      putString("epc", epc)
      putDouble("at", System.currentTimeMillis().toDouble())
      putString("source", "uhf-g")
    }
    emit(TAG_EVENT, event)
  }

  private fun emitStatus(status: String, message: String) {
    emit(STATUS_EVENT, statusMap(status, message))
  }

  private fun emitTriggerDiagnostic(
    source: String,
    action: String,
    keyCode: Int?,
    recognized: Boolean,
    detail: String,
  ) {
    val event = Arguments.createMap().apply {
      putDouble("at", System.currentTimeMillis().toDouble())
      putString("source", source)
      putString("action", action)
      if (keyCode != null) putInt("keyCode", keyCode)
      putBoolean("recognized", recognized)
      putString("detail", detail)
    }
    emit(TRIGGER_EVENT, event)
  }

  private fun statusMap(status: String, message: String): WritableMap =
    Arguments.createMap().apply {
      putString("status", status)
      putString("message", message)
    }

  private fun emit(eventName: String, payload: WritableMap) {
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun readableError(error: Throwable): String {
    val cause = error.cause ?: error
    return cause.message?.takeIf { it.isNotBlank() } ?: cause.javaClass.simpleName
  }
}
