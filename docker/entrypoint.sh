#!/usr/bin/env bash
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${PATH}"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"

# Bind mount dari Windows bisa kehilangan executable bit. Pastikan gradlew
# tetap bisa dijalankan lewat "./gradlew" di dalam container.
if [ -f /app/android/gradlew ]; then
  chmod +x /app/android/gradlew 2>/dev/null || true
fi

if [ -d /app ] && [ ! -d /app/node_modules/react-native ]; then
  echo "[optima] node_modules belum terpasang."
  echo "[optima] Jalankan sekali: docker compose run --rm toolchain npm ci"
fi

exec "$@"
