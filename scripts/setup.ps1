# Setup awal OPTIMA RFID (Windows / PowerShell).
# Sekali saja: build image Docker + install dependency di container.
# Jangan pakai $ErrorActionPreference = 'Stop': Docker menulis progres ke stderr
# dan PowerShell 5.1 menganggapnya error sehingga skrip berhenti di tengah jalan.
# Kegagalan tetap terdeteksi lewat $LASTEXITCODE di bawah.
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host '==> Build image toolchain' -ForegroundColor Cyan
docker compose build
if ($LASTEXITCODE -ne 0) { throw 'docker compose build gagal' }

Write-Host '==> npm ci di dalam container' -ForegroundColor Cyan
docker compose run --rm toolchain npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci gagal' }

Write-Host ''
Write-Host 'Selesai. Langkah berikutnya:' -ForegroundColor Green
Write-Host '  .\scripts\dev.ps1        # jalankan Metro'
Write-Host '  .\scripts\build-apk.ps1  # build + install APK ke device'
