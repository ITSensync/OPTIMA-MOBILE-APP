# Build APK debug di container, lalu install ke device lewat adb di HOST.
# Container tidak bisa melihat kabel USB, jadi langkah install harus di host.
# Jangan pakai $ErrorActionPreference = 'Stop': Docker menulis progres ke stderr
# dan PowerShell 5.1 menganggapnya error sehingga skrip berhenti di tengah jalan.
# Kegagalan tetap terdeteksi lewat $LASTEXITCODE di bawah.
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '==> Build APK (container)' -ForegroundColor Cyan
docker compose run --rm builder
if ($LASTEXITCODE -ne 0) { throw 'Build APK gagal' }

$apk = Join-Path (Get-Location) 'artifacts\optima-rfid-debug.apk'
if (-not (Test-Path $apk)) { throw "APK tidak ditemukan: $apk" }

Write-Host '==> Install ke device (adb host)' -ForegroundColor Cyan
adb install -r $apk
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Install gagal. Cek: adb devices' -ForegroundColor Yellow
  exit 1
}

Write-Host 'Selesai. Buka aplikasi "OPTIMA RFID" di perangkat.' -ForegroundColor Green
