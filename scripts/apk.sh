#!/usr/bin/env bash
# Build APK debug lalu install ke device yang terhubung ke HOST (bukan container).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose run --rm builder
adb install -r artifacts/optima-rfid-debug.apk
