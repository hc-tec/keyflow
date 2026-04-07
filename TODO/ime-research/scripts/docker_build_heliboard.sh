#!/usr/bin/env bash
set -eux

cd /work

# Fix Windows CRLF
tr -d '\r' < ./gradlew > ./gradlew.tmp && mv ./gradlew.tmp ./gradlew
chmod +x ./gradlew

export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"

./gradlew :app:assembleDebug --console=plain --stacktrace
