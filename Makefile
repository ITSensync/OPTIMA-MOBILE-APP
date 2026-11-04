# OPTIMA RFID - pintasan perintah harian (butuh GNU Make)
# Windows: jalankan lewat Git Bash / WSL, atau pakai scripts/*.ps1

.PHONY: help setup shell metro apk apk-release install test lint typecheck doctor clean

help:
	@echo "setup       Build image Docker + npm ci (sekali saja)"
	@echo "shell       Masuk ke container toolchain"
	@echo "metro       Jalankan Metro bundler di :8081"
	@echo "apk         Build APK debug (butuh Metro saat dipakai)"
	@echo "apk-release Build APK release mandiri (debug keystore)"
	@echo "install     Install APK debug ke device (adb dari host)"
	@echo "test        Jest"
	@echo "lint        ESLint"
	@echo "typecheck   tsc --noEmit"
	@echo "doctor      Cek versi tool di dalam container"

setup:
	docker compose build
	docker compose run --rm toolchain npm ci

shell:
	docker compose run --rm toolchain bash

metro:
	docker compose up metro

apk:
	docker compose run --rm builder

apk-release:
	docker compose run --rm builder-release

install: apk
	adb install -r artifacts/optima-rfid-debug.apk

test:
	docker compose run --rm toolchain npm run test:ci

lint:
	docker compose run --rm toolchain npm run lint

typecheck:
	docker compose run --rm toolchain npm run typecheck

doctor:
	docker compose run --rm toolchain bash -c "node -v && npm -v && java -version && sdkmanager --version"

clean:
	docker compose down -v
