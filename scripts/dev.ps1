# Jalankan Metro bundler (container) + adb reverse dari host.
# Pastikan device sudah terhubung dan `adb devices` menampilkan device.
# Jangan pakai $ErrorActionPreference = 'Stop': Docker menulis progres ke stderr
# dan PowerShell 5.1 menganggapnya error sehingga skrip berhenti di tengah jalan.
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

adb reverse tcp:8081 tcp:8081 | Out-Null
Write-Host '==> Metro: http://localhost:8081' -ForegroundColor Cyan
Write-Host '    Biarkan terminal ini terbuka. Jalankan aplikasi lewat Android Studio'
Write-Host '    atau build APK debug dengan .\scripts\build-apk.ps1'
docker compose up metro
