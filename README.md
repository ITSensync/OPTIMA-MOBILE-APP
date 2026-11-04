# OPTIMA RFID

Aplikasi Android (React Native 0.88) untuk membaca tag RFID UHF, menyimpan identitas tag,
dan mencatat setiap pembacaan beserta waktu baca. Data disimpan lokal di perangkat
(AsyncStorage) — belum ada backend.

Tujuan tahap ini: **mencatat barang dan pergerakannya menggunakan tag RFID UHF**
(inbound, outbound, dan perpindahan lokasi). Data saat ini disimpan lokal di perangkat.

---

## 1. Status integrasi hardware

Target reader: **Electron EL-UHF-RH02** (handheld UHF).

Mode default aplikasi adalah **UHF internal (SDK)**, termasuk kontrol start/stop melalui
tombol fisik handheld. Mode simulasi tersedia untuk pengujian tanpa hardware; keyboard-wedge
tidak digunakan oleh aplikasi ini.

➡️ Sebelum produksi, ikuti checklist di [`DEVICE-NOTES.md`](DEVICE-NOTES.md) untuk memastikan
mode yang aktif pada unit Anda.

---

## 2. Fitur

- **Inventory** — proses inbound, outbound, dan relocation dengan scan melalui tombol fisik handheld.
- **Penempatan** — inbound dan relocation menyimpan ruangan serta rak; tag inbound yang belum ditempatkan disimpan lokal, dicek kembali saat aplikasi dibuka, dan muncul di notifikasi setelah 1 menit.
- **Master tag** — tag baru tampil setelah inbound dikonfirmasi; tersedia pencarian EPC, status stok, dan lokasi barang.
- **Riwayat** — tag baru terdaftar, inbound, relocation, dan outbound; dapat difilter berdasarkan tanggal dan EPC.
- **Pengaturan** — operator, getar, sumber reader, hapus data.
- **Diagnostics** — informasi perangkat dan statistik penyimpanan.
- **Simulasi** — untuk uji coba tanpa reader.
- **Feedback haptic** — getar saat handheld membaca tag.

---

## 3. Prasyarat

| Tool           | Versi                               | Keterangan                                         |
| -------------- | ----------------------------------- | -------------------------------------------------- |
| Docker Desktop | 24+                                 | Wajib untuk jalur utama                            |
| Android device | Handheld ARM64, Android 7+ (API 24) | USB debugging aktif                                |
| `adb` di host  | platform-tools                      | Untuk install APK (container tidak bisa akses USB) |

Node, JDK, dan Android SDK **tidak perlu** di-install di host — semuanya ada di image Docker.

---

## 4. Mulai cepat (Docker)

> **Sudah ada APK siap pakai?** Lihat folder `artifacts/`:
>
> - `optima-rfid-release.apk` — mandiri (JS dibundel, tanpa Metro), untuk uji di perangkat.
> - `optima-rfid-debug.apk` — butuh Metro, untuk development.
>
> Install langsung: `adb install -r artifacts/optima-rfid-release.apk`

```bash
# 1) Build image + install dependency (sekali saja)
docker compose build
docker compose run --rm toolchain npm ci

# 2) Build + install APK debug
docker compose run --rm builder
adb install -r artifacts/optima-rfid-debug.apk

# 3) Jalankan Metro (biarkan terminal terbuka)
docker compose up metro
adb reverse tcp:8081 tcp:8081
```

Lalu buka aplikasi **OPTIMA RFID** di perangkat.

Di Windows bisa langsung:

```powershell
.\scripts\setup.ps1
.\scripts\build-apk.ps1         # debug (butuh Metro)
.\scripts\build-apk-release.ps1 # release mandiri
.\scripts\dev.ps1               # Metro + adb reverse
```

> Build APK debug sekali dulu, karena `run-android` di dalam container
> tidak bisa mengakses USB device.

### Cara pakai di lapangan

1. Buka tab **Inventory** dan pilih inbound, outbound, atau relocation.
2. Tekan tombol fisik handheld untuk membaca tag. EPC yang terbaca akan tampil pada transaksi.
3. Untuk inbound, lengkapi detail barang dan penempatan, lalu konfirmasi.
4. Tag baru masuk ke tab **Tag** setelah inbound dikonfirmasi.
5. Lihat tab **Riwayat** untuk tag baru terdaftar dan transaksi inventory; gunakan filter tanggal, kategori, atau EPC.
6. Jika tombol fisik tidak merespons, periksa panduan reader di **Diagnostics**.

### Build APK

```bash
docker compose run --rm builder        # hasil: artifacts/optima-rfid-debug.apk
adb install -r artifacts/optima-rfid-debug.apk
```

> Build pertama lambat (download Gradle + dependency + kompilasi native).
> Service `builder` membuat APK **ARM64**, sesuai target EL-UHF-RH02 dan aset
> SDK UHF internal. Mode UHF internal tidak didukung untuk ABI selain ARM64.
>
> ```bash
> docker compose run --rm toolchain bash -c \
>   "cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a && \
>    cp app/build/outputs/apk/debug/app-debug.apk ../artifacts/optima-rfid-debug.apk"
> ```

Di Windows:

```powershell
.\scripts\build-apk.ps1     # build + install sekaligus
```

Release build (JS sudah dibundel di dalam APK, tidak butuh Metro — cocok untuk uji lapangan):

```bash
docker compose run --rm builder-release
# artifacts/optima-rfid-release.apk
adb install -r artifacts/optima-rfid-release.apk
```

> Release di template ini memakai **debug keystore** (bawaan React Native) supaya
> langsung bisa di-install. Untuk distribusi produksi, buat keystore sendiri dan
> ganti `signingConfig` di `android/app/build.gradle`.

### Pintasan `make`

```bash
make setup      # build image + npm ci
make metro      # Metro di :8081
make apk        # build APK debug
make install    # build + adb install
make test       # jest
make doctor     # cek versi node/java/sdkmanager di container
```

---

## 5. Tanpa Docker (opsional)

Butuh Node 22.11+, JDK 17, Android SDK Platform **37.0** (`platforms;android-37.0`) +
Build-Tools 37.0.0, dan NDK 27.1.

```bash
npm ci
npm start                     # Metro
npx react-native run-android  # build + install (USB langsung)
```

`ANDROID_HOME` harus mengarah ke SDK. Build manual:

```bash
cd android && ./gradlew assembleDebug
```

> Build di Docker dan build di host **tidak saling mengganggu**: folder output
> (`android/build`, `android/app/build`, `.cxx`, `.gradle`) di container memakai
> Docker volume terpisah. Jadi kalau kamu pernah build di Windows lalu pindah ke
> Docker (atau sebaliknya), tidak akan muncul error path seperti
> `C:/.../node_modules/... does not exist`. Artefak hasil build container selalu
> disalin ke `artifacts/` di host.

---

## 6. Struktur proyek

```
src/
├─ domain/            # logika murni, mudah diuji
│  ├─ epc.ts          # normalisasi & validasi EPC
│  ├─ reading.ts      # utilitas pembacaan lama
│  ├─ datetime.ts     # format tanggal Indonesia & kunci harian
│  └─ types.ts
├─ reader/            # sumber data reader
│  ├─ nativeUhf.ts         # bridge TypeScript ke modul UHF Android
│  ├─ useUhfReader.ts      # kontrol reader UHF internal
├─ storage/           # AsyncStorage, satu tanggung jawab per file
│  ├─ tagRepo.ts      # master tag + recordReading()
│  ├─ logRepo.ts      # riwayat per hari + flush tertunda
│  ├─ settingsRepo.ts
│  ├─ export.ts       # CSV + share sheet
│  └─ json.ts         # wrapper aman JSON + antrian tulis
├─ screens/           # Inventory, Tags, History, Settings, Diagnostics, TagDetail
├─ navigation/        # bottom tabs + native stack
├─ state/             # SettingsProvider
├─ components/        # komponen UI reusable
└─ theme.ts
```

---

## 7. Cara kerja

### Alur satu pembacaan

```
Reader UHF ──SDK inventory event──► normalizeEpc() ── gagal ──► banner error
                                          │ valid
                                          ▼
                              recordReading()  (antrian tulis, atomik)
                                          │
                     ┌────────────────────┼─────────────────────┐
                     ▼                    ▼                     ▼
              upsert master tag     dedupe check         append log harian
              (tag:<EPC>)      (lastSeenAt + window)     (log:YYYY-MM-DD)
```

### Model data (minimal)

```ts
Tag     { epc, firstSeenAt, lastSeenAt, readCount }
Reading { id, epc, at, atMs, status, readCount }
```

- Pembacaan pada Inventory dipakai untuk menyiapkan transaksi, bukan membuat master tag.
- Master tag baru dibuat saat inbound dikonfirmasi.
- Riwayat pengguna berisi tag baru terdaftar dan transaksi inventory.

### Key AsyncStorage

| Key                        | Isi                         |
| -------------------------- | --------------------------- |
| `optima:v1:tag:<EPC>`      | satu record tag             |
| `optima:v1:tagIndex`       | array EPC untuk listing     |
| `optima:v1:log:YYYY-MM-DD` | array pembacaan per hari    |
| `optima:v1:logIndex`       | daftar hari yang punya data |
| `optima:v1:settings`       | preferensi                  |
| `optima:v1:schemaVersion`  | versi skema                 |

Log scan lama dipertahankan untuk kompatibilitas data, tetapi tidak ditampilkan
sebagai riwayat pengguna. Riwayat baru hanya berisi kejadian bisnis inventory.

---

## 8. Recon device EL-UHF-RH02

Mode UHF internal memakai bridge native dan SDK UHF-G yang dibundel dalam aplikasi.
Jika tombol fisik tidak merespons, periksa panduan reader di **Diagnostics**.
Catat hasil tes perangkat di [`DEVICE-NOTES.md`](DEVICE-NOTES.md).

---

## 9. Pindah device / developer baru

Yang perlu dilakukan di komputer baru **hanya**:

1. Install Docker Desktop + platform-tools (`adb`).
2. Clone repo.
3. `docker compose build && docker compose run --rm toolchain npm ci` (atau `.\scripts\setup.ps1`).
4. `.\scripts\build-apk.ps1`.

Tidak perlu install Node, JDK, Android Studio, atau NDK — semuanya ada di image.
`package-lock.json` dipakai (`npm ci`) sehingga versi dependency identik.

Yang **tidak** ikut pindah: data di perangkat (AsyncStorage bersifat lokal per HP),
serta cache di Docker volume. Untuk reset total environment:

```bash
docker compose down -v
```

> Catatan: karena container tidak bisa akses USB, langkah `adb install` selalu
> dijalankan dari host. Build-nya tetap di container.

---

## 10. Export CSV

Kolom berisi jenis kejadian bisnis, waktu, EPC, lokasi asal, dan lokasi tujuan.
Export tersedia melalui **Setelan → Export semua (CSV)**.

File dibagikan lewat share sheet Android (WhatsApp, Drive, email, dll), tanpa library tambahan.

---

## 11. Kualitas kode

```bash
npm run typecheck   # TypeScript strict, no emit
npm run lint        # ESLint @react-native
npm run test        # Jest — logika domain + integrasi storage
```

Semua pengujian berjalan tanpa device dan tanpa AsyncStorage asli.

---

## 12. Troubleshooting

**`docker compose run builder` gagal di `sdkmanager`**
Sejak Android 37, nama paket platform memakai versi minor: `platforms;android-37.0`
(bukan `platforms;android-37`). Jika SDK baru dirilis, sesuaikan
`ARG CMDLINE_TOOLS_VERSION`, `ARG ANDROID_PLATFORM`, dan `ARG ANDROID_BUILD_TOOLS`
di `Dockerfile`, lalu samakan `compileSdkVersion` di `android/build.gradle`.

**Gradle mencoba mengunduh paket SDK saat build**
Image sudah memuat platform 37.0, Build-Tools 37.0.0 + 36.0.0, NDK 27.1, dan CMake
3.22.1. Jika kamu menambah library yang butuh paket lain, tambahkan ke perintah
`sdkmanager --install` di `Dockerfile` lalu rebuild image — unduhan yang terjadi
di dalam container hilang saat container dihapus.

**APK tidak bisa connect ke Metro**
Jalankan `adb reverse tcp:8081 tcp:8081`, pastikan container `metro` hidup dan port 8081 bebas.

**`adb devices` kosong**
Aktifkan Opsi Pengembang → USB debugging, lalu izinkan komputer di dialog RSA.
Untuk wireless: `adb tcpip 5555` lalu `adb connect <ip-hp>:5555`.

**Reader tidak menghasilkan apa pun di Inventory**
Pastikan status UHF internal siap, lalu periksa panduan reader di Diagnostics.

**Data terasa lambat setelah ribuan baris**
Hapus riwayat lama (Setelan → Hapus riwayat) atau export lalu bersihkan. Struktur
repository sengaja dipisah agar migrasi ke SQLite nanti hanya mengganti `src/storage`.

**Build gagal di `configureCMakeDebug[x86_64]` (Windows, file lock)**
Build default sudah dibatasi ke ARM64. Bila lock tetap terjadi, tutup Android Studio/Explorer
yang membuka folder `.cxx`, lalu ulangi. Untuk memaksa ABI target:

```bash
npm run android:apk:arm64
# atau di Docker:
docker compose run --rm toolchain bash -c \
  "cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a && \
   cp app/build/outputs/apk/debug/app-debug.apk ../artifacts/optima-rfid-debug.apk"
```

---

## 13. Roadmap

1. Scaffold + Docker + APK ✅
2. Native bridge UHF-G + kontrol trigger fisik ✅
3. Dedupe + master tag + riwayat + export ✅
4. Migrasi storage ke SQLite bila volume log sudah besar.
5. Sinkronisasi ke backend (opsional) + autentikasi operator.

---

## Lisensi

Internal — PT Optima. Belum untuk distribusi publik.
