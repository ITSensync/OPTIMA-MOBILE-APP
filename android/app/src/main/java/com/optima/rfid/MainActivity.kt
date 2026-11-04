package com.optima.rfid

import android.os.Bundle
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "OptimaRfid"

  /**
   * react-native-screens: mencegah crash saat activity dipulihkan oleh sistem
   * (mis. proses aplikasi dibunuh saat di background lalu dibuka lagi).
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Sebagian firmware handheld meneruskan tombol trigger sebagai KeyEvent,
   * bukan BroadcastReceiver. Teruskan event tersebut ke bridge UHF; event
   * selain trigger tetap diproses Android/React Native seperti biasa.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (UhfReaderModule.onHardwareKeyEvent(event)) {
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
