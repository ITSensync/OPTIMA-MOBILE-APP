# DEVICE NOTES — Electron EL-UHF-RH02

Isi file ini setelah melakukan recon. Tujuannya supaya developer berikutnya (atau Anda
sendiri 3 bulan lagi) tidak mengulang tes hardware dari nol.

## Identitas unit

| Item | Nilai |
|---|---|
| Merek / model | Electron EL-UHF-RH02 |
| Serial number | _(isi)_ |
| Android version | _(isi — Setelan → Tentang perangkat)_ |
| Frekuensi | _(860–960 MHz? cek stiker)_ |
| Jumlah antena | _(isi)_ |

## Hasil tes mode output

| Tes | Hasil | Catatan |
|---|---|---|
| Scan ke app Catatan, muncul teks EPC? | ☐ Ya ☐ Tidak | |
| Ada Enter/CRLF di akhir? | ☐ Ya ☐ Tidak | |
| Panjang EPC yang dikirim | _(mis. 24 hex)_ | |
| Prefix/suffix aneh? | _(mis. "EPC:" atau spasi)_ | |
| Ada aplikasi bawaan pabrik? | ☐ Ya ☐ Tidak | nama: ______ |
| Menu setting mode (HID/SPP/Broadcast)? | _(isi lokasinya)_ | |
| Bisa membaca banyak tag sekaligus? | ☐ Ya ☐ Tidak | |
| Getar/beep dari device sendiri? | ☐ Ya ☐ Tidak | |

## Keputusan integrasi

- [ ] **Keyboard-wedge** — mode ini tidak digunakan oleh aplikasi OPTIMA.
- [ ] **Broadcast intent** — perlu native receiver kecil; catat action & extra-nya:
      `action = ______________`, `extra EPC = ______________`
- [ ] **Serial / SPP** — perlu bridge Bluetooth; catat nama service UUID & baudrate.
- [ ] **Vendor SDK** — minta AAR + dokumentasi ke penjual. Nama file SDK: ______________

## Catatan lain

_(tempel foto stiker, link manual, kontak penjual, dsb.)_
