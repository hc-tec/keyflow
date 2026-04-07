#!/usr/bin/env bash
set -eux

cd /work

# Toolchain required by this repo (see README)
yes | /opt/android-sdk-linux/cmdline-tools/latest/bin/sdkmanager 'cmake;3.31.6'

if [[ -f /etc/apt/sources.list.d/ubuntu.sources ]]; then
  sed -i \
    -e 's|http://archive.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' \
    -e 's|http://security.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' \
    /etc/apt/sources.list.d/ubuntu.sources
elif [[ -f /etc/apt/sources.list ]]; then
  sed -i \
    -e 's|http://archive.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' \
    -e 's|http://security.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' \
    /etc/apt/sources.list
fi

apt-get -o Acquire::Retries=3 update
apt-get install -y curl extra-cmake-modules gettext unzip

# Windows clones often cannot checkout symlinks; some prebuilt deps store "include" as a symlink.
# When symlinks are not supported, git creates a plain file containing "../include", which breaks builds.
# Some ABI-specific Boost include trees are also incomplete on Windows clones, so we always overlay the
# generic header tree onto each ABI include directory before building.
BOOST_DIR=/work/lib/fcitx5/src/main/cpp/prebuilt/boost

# If BUILD_ABI is set (comma-separated), only fix those ABIs to save time.
if [[ -n "${BUILD_ABI:-}" ]]; then
  IFS=',' read -r -a ABIS <<< "${BUILD_ABI}"
else
  ABIS=(arm64-v8a armeabi-v7a x86 x86_64)
fi

for abi in "${ABIS[@]}"; do
  inc="$BOOST_DIR/$abi/include"
  if [[ -L "$inc" ]]; then
    resolved_inc=$(realpath "$inc")
    resolved_generic=$(realpath "$BOOST_DIR/include")
    if [[ "$resolved_inc" == "$resolved_generic" ]]; then
      continue
    fi
    rm -f "$inc"
  fi
  if [[ -f "$inc" ]]; then
    rm -f "$inc"
  fi
  mkdir -p "$inc"
  cp -a "$BOOST_DIR/include/." "$inc/"
done

export PATH=/opt/android-sdk-linux/cmake/3.31.6/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export GRADLE_OPTS="${GRADLE_OPTS:-} -Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false -Dorg.gradle.internal.http.connectionTimeout=60000 -Dorg.gradle.internal.http.socketTimeout=60000"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false"

GRADLE_DIST_URL=$(
  awk -F= '/^distributionUrl=/{gsub(/\r/, "", $2); print $2}' ./gradle/wrapper/gradle-wrapper.properties |
    sed 's#\\:#:#g'
)
GRADLE_DIST_ARCHIVE=$(basename "$GRADLE_DIST_URL")
GRADLE_DIST_DIRNAME=$(printf '%s' "$GRADLE_DIST_ARCHIVE" | sed -E 's/-(bin|all)\.zip$//')
GRADLE_DIST_ROOT=/gradle-cache/manual-gradle-dist
GRADLE_DIST_ZIP="$GRADLE_DIST_ROOT/$GRADLE_DIST_ARCHIVE"
GRADLE_BIN="$GRADLE_DIST_ROOT/$GRADLE_DIST_DIRNAME/bin/gradle"
GRADLE_VERSION="${GRADLE_DIST_DIRNAME#gradle-}"

mkdir -p "$GRADLE_DIST_ROOT"

if [[ ! -f "$GRADLE_DIST_ZIP" ]]; then
  GRADLE_DIST_URL_CANDIDATES=(
    "https://mirrors.cloud.tencent.com/gradle/$GRADLE_DIST_ARCHIVE"
    "https://mirrors.huaweicloud.com/gradle/$GRADLE_DIST_ARCHIVE"
    "https://mirrors.aliyun.com/gradle/distributions/v$GRADLE_VERSION/$GRADLE_DIST_ARCHIVE"
    "$GRADLE_DIST_URL"
  )

  download_succeeded=false
  for candidate_url in "${GRADLE_DIST_URL_CANDIDATES[@]}"; do
    rm -f "$GRADLE_DIST_ZIP.part"
    echo "Attempting Gradle distribution download from: $candidate_url"
    if curl \
      --ipv4 \
      --fail \
      --location \
      --retry 5 \
      --retry-all-errors \
      --retry-delay 5 \
      --connect-timeout 20 \
      --speed-limit 50000 \
      --speed-time 20 \
      --output "$GRADLE_DIST_ZIP.part" \
      "$candidate_url"; then
      mv "$GRADLE_DIST_ZIP.part" "$GRADLE_DIST_ZIP"
      download_succeeded=true
      break
    fi
  done

  if [[ "$download_succeeded" != true ]]; then
    echo "Failed to download Gradle distribution: $GRADLE_DIST_ARCHIVE" >&2
    exit 1
  fi
fi

if [[ ! -x "$GRADLE_BIN" ]]; then
  rm -rf "$GRADLE_DIST_ROOT/$GRADLE_DIST_DIRNAME"
  unzip -q "$GRADLE_DIST_ZIP" -d "$GRADLE_DIST_ROOT"
fi

GRADLE_TASKS_VALUE="${GRADLE_TASKS:-:app:assembleDebug}"
read -r -a GRADLE_TASK_ARRAY <<< "$GRADLE_TASKS_VALUE"

"$GRADLE_BIN" -p /work "${GRADLE_TASK_ARRAY[@]}" --console=plain --stacktrace
