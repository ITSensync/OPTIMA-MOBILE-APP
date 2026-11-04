#!/usr/bin/env bash
# Setup sekali jalan: build image + install dependency di dalam container.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose build
docker compose run --rm toolchain npm ci
echo "Selesai. Lanjutkan dengan: make metro  (atau)  make apk"
