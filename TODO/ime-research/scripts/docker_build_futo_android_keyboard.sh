#!/usr/bin/env bash
set -eux

cd /work

# Fix Windows CRLF
tr -d '\r' < ./gradlew > ./gradlew.tmp && mv ./gradlew.tmp ./gradlew
chmod +x ./gradlew

# Toolchain required by this repo (ndkVersion is pinned in build.gradle)
yes | /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'cmake;3.31.6' 'ndk;28.2.13676358'

export PATH=/opt/android-sdk-linux/cmake/3.31.6/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"

./gradlew assembleUnstableDebug --console=plain --stacktrace
