# Build APK release (mandiri, tanpa Metro) di container, lalu install ke device.
# Cocok untuk uji lapangan / dibagikan ke petugas.
# Jangan pakai $ErrorActionPreference = 'Stop': Docker menulis progres ke stderr
# dan PowerShell 5.1 menganggapnya error sehingga skrip berhenti di tengah jalan.
# Kegagalan tetap terdeteksi lewat $LASTEXITCODE di bawah.
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '==> Build APK release (container)' -ForegroundColor Cyan
docker compose run --rm builder-release
if ($LASTEXITCODE -ne 0) { throw 'Build APK release gagal' }

$apk = Join-Path (Get-Location) 'artifacts\optima-rfid-release.apk'
if (-not (Test-Path $apk)) { throw "APK tidak ditemukan: $apk" }

Write-Host '==> Install ke device (adb host)' -ForegroundColor Cyan
adb install -r $apk
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Install gagal. Cek: adb devices' -ForegroundColor Yellow
  exit 1
}

Write-Host 'Selesai. Aplikasi berjalan tanpa Metro.' -ForegroundColor Green
