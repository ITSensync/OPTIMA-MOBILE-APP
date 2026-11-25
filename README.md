# OPTIMA RFID

Aplikasi Android React Native untuk site employee pada handheld UHF. Flow P0 saat ini
mencakup **placement barang hasil repacking** dan **relocation barang placed ke rak active lain** melalui API backend utama.
Backend menjadi source of truth; mobile hanya menyimpan pending submission sementara agar
retry timeout tetap menggunakan payload dan `client_request_id` yang sama.

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

- **Placement** — scan satu atau banyak RFID, deduplikasi, preview eligibility, pilih rak active, review, dan submit.
- **Relocation** — pilih rak tujuan terlebih dahulu, gabungkan RFID dari beberapa rak asal, preview detail dan summary, lalu submit atomic.
- **History** — ringkasan placement dan relocation dari API backend.
- **Reader UHF** — scan melalui tombol fisik handheld dengan feedback haptic.

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

### Konfigurasi API placement

Development default untuk handheld pada jaringan yang sama dengan backend:

```env
# .env.development
API_BASE_URL=http://192.168.18.16:3000
```

Android debug mengizinkan HTTP cleartext untuk development. Production wajib menyediakan
`API_BASE_URL` HTTPS saat build dan tidak menggunakan fallback lokal. Untuk release,
salin `.env.production.example` menjadi `.env.production`, atau build dengan:

```bash
cd android && ENVFILE=.env.production ./gradlew assembleRelease
```

### Cara pakai di lapangan

1. Buka tab **Placement** dan tekan tombol fisik handheld untuk membaca RFID.
2. Hapus RFID yang salah bila diperlukan, lalu tekan **Validasi RFID**.
3. Pilih rak active yang tersedia dari backend.
4. Periksa jumlah dan daftar barang, lalu tekan **Submit placement**.
5. Jika request timeout, aplikasi otomatis retry sekali dan mempertahankan ID yang sama.
6. Lihat tab **History** untuk ringkasan placement dari backend.

### Cara pakai relocation

1. Buka tab **Relocation** dan pilih satu rak tujuan active.
2. Scan RFID dari satu atau beberapa rak asal. RFID duplicate diabaikan.
3. Periksa preview detail, rak asal, summary per rak dan per produk.
4. Tekan **Konfirmasi & submit relocation** hanya jika semua item eligible.
5. Jika request timeout, aplikasi retry dengan `client_request_id` yang sama.

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

## 6. Struktur dan alur placement

```
src/
├─ api/placementApi.ts              # racks, preview, placement, relocation, history
├─ screens/PlacementScreen.tsx      # scan → preview → rak → submit
├─ screens/RelocationScreen.tsx     # rak tujuan → scan → preview → submit
├─ screens/PlacementHistoryScreen.tsx
├─ storage/placementSubmissionRepo.ts # pending idempotent request
├─ storage/relocationSubmissionRepo.ts # pending relocation request
├─ domain/placement.ts              # grouping history dan label UI
├─ reader/                           # bridge UHF handheld
└─ navigation/                       # tab Placement dan History
```

Alur placement:

```
Reader UHF
  → dedupe RFID
  → POST /api/mobile/placements/preview
  → GET /api/mobile/racks?status=active
  → review
  → POST /api/mobile/placements
  → GET /api/mobile/placements/history
```

Alur relocation:

```
Pilih rak tujuan
  → Reader UHF / input manual
  → dedupe RFID
  → POST /api/mobile/placements/relocation/preview
  → review detail dan summary
  → POST /api/mobile/placements/relocation
  → GET /api/mobile/placements/history
```

Mobile tidak mengakses database dan tidak mengubah status lokal menjadi `placed`.
Submission disimpan sebelum request dikirim. Timeout melakukan satu retry otomatis dengan
payload serta `client_request_id` yang sama; pending request dipulihkan setelah restart.

### Penyimpanan lokal yang diizinkan

AsyncStorage hanya digunakan untuk preferensi reader dan pending placement submission.
Data rack, status barang, dan history tetap berasal dari backend.

---

## 7. Reader device EL-UHF-RH02

Mode UHF internal memakai bridge native dan SDK UHF-G yang dibundel dalam aplikasi.
Jika tombol fisik tidak merespons, periksa status reader pada layar **Placement**.
Catat hasil tes perangkat di [`DEVICE-NOTES.md`](DEVICE-NOTES.md).

---

## 8. Pindah device / developer baru

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

## 9. Kualitas kode

```bash
npm run typecheck   # TypeScript strict, no emit
npm run lint        # ESLint @react-native
npm run test        # Jest — logika domain + integrasi storage
```

Semua pengujian berjalan tanpa device dan tanpa AsyncStorage asli.

---

## 10. Troubleshooting

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

**Reader tidak menghasilkan RFID**
Pastikan status UHF internal siap dan reader berada dalam jangkauan tag.

**API tidak dapat dihubungi**
Pastikan handheld dan komputer backend berada pada jaringan yang sama, API berjalan di
port 3000, firewall mengizinkan koneksi, dan `API_BASE_URL` sesuai environment build.

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

## 11. Roadmap

1. Scaffold + Docker + APK ✅
2. Native bridge UHF-G + kontrol trigger fisik ✅
3. Placement terintegrasi dengan backend ✅
4. Auth site employee dan HTTPS production.
5. Relocation, reuse RFID, opname, dan operasi lain sesuai roadmap backend.

---

## Lisensi

Internal — PT Optima. Belum untuk distribusi publik.
