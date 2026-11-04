# ---------- OPTIMA RFID toolchain ----------
# Satu image untuk: Metro bundler, build APK, dan dipakai devcontainer.
# Tujuan: developer baru tidak perlu install Node/JDK/Android SDK manual.

FROM node:22-bookworm-slim

ARG ANDROID_SDK_ROOT=/opt/android-sdk
ARG CMDLINE_TOOLS_VERSION=13114758
# Android 37 memakai penamaan minor (android-37.0), bukan "android-37".
ARG ANDROID_PLATFORM=android-37.0
ARG ANDROID_BUILD_TOOLS=37.0.0
# AGP 9 masih meminta Build-Tools 36 untuk sebagian task internal. Tanpa ini,
# Gradle akan mengunduh saat build (hilang lagi setelah container dihapus).
ARG ANDROID_BUILD_TOOLS_LEGACY=36.0.0

ENV ANDROID_HOME=${ANDROID_SDK_ROOT} \
    ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT} \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    PATH=${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless \
      unzip \
      wget \
      ca-certificates \
      git \
      procps \
 && rm -rf /var/lib/apt/lists/*

# Android command-line tools (tanpa Android Studio)
RUN mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools" \
 && wget -q "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip" -O /tmp/cmdline-tools.zip \
 && unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools \
 && mv /tmp/cmdline-tools/cmdline-tools "${ANDROID_SDK_ROOT}/cmdline-tools/latest" \
 && rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-tools

# Terima lisensi + pasang platform yang dipakai React Native 0.88
RUN yes | sdkmanager --licenses > /dev/null \
 && sdkmanager --install \
      "platform-tools" \
      "platforms;${ANDROID_PLATFORM}" \
      "build-tools;${ANDROID_BUILD_TOOLS}" \
      "build-tools;${ANDROID_BUILD_TOOLS_LEGACY}" \
      "ndk;27.1.12297006" \
      "cmake;3.22.1"

WORKDIR /app

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]
