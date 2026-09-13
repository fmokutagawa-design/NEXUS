#!/bin/sh
set -eu

usage() { echo "usage: $0 SOURCE_DIR INSTALL_DIR" >&2; exit 64; }

[ "$#" -eq 2 ] || usage
SOURCE_DIR=$1
INSTALL_INPUT=$2
[ -n "$SOURCE_DIR" ] || usage
[ -n "$INSTALL_INPUT" ] || usage
case "$SOURCE_DIR" in /*) ;; *) echo "error: source directory must be an absolute path" >&2; exit 64;; esac
case "$INSTALL_INPUT" in /*) ;; *) echo "error: install directory must be an absolute path" >&2; exit 64;; esac
case "/$INSTALL_INPUT/" in
  *'/./'*|*'/../'*) echo "error: install directory must not contain dot segments: $INSTALL_INPUT" >&2; exit 64;;
esac

[ -d "$SOURCE_DIR" ] || { echo "error: source directory does not exist: $SOURCE_DIR" >&2; exit 66; }
SOURCE_DIR=$(CDPATH= cd -- "$SOURCE_DIR" && pwd -P)
INSTALL_PARENT=$(dirname -- "$INSTALL_INPUT")
INSTALL_NAME=$(basename -- "$INSTALL_INPUT")
[ "$INSTALL_NAME" != / ] && [ "$INSTALL_NAME" != . ] && [ "$INSTALL_NAME" != .. ] || {
  echo "error: unsafe install directory: $INSTALL_INPUT" >&2; exit 64;
}

ancestor=$INSTALL_PARENT
while [ "$ancestor" != / ]; do
  [ ! -L "$ancestor" ] || {
    echo "error: install directory has symlink ancestry: $ancestor" >&2
    exit 64
  }
  ancestor=$(dirname -- "$ancestor")
done

[ -d "$INSTALL_PARENT" ] || { echo "error: install parent does not exist: $INSTALL_PARENT" >&2; exit 73; }
INSTALL_PARENT=$(CDPATH= cd -- "$INSTALL_PARENT" && pwd -P)
INSTALL_DIR=$INSTALL_PARENT/$INSTALL_NAME
HOME_DIR=$(CDPATH= cd -- "${HOME:?}" && pwd -P)
case "$INSTALL_DIR" in /|"$HOME_DIR") echo "error: unsafe install directory: $INSTALL_INPUT" >&2; exit 64;; esac
case "$INSTALL_DIR/" in "$SOURCE_DIR/"|"$SOURCE_DIR/"*) echo "error: source and install directories overlap" >&2; exit 64;; esac
case "$SOURCE_DIR/" in "$INSTALL_DIR/"*) echo "error: source and install directories overlap" >&2; exit 64;; esac
[ ! -e "$INSTALL_DIR" ] && [ ! -L "$INSTALL_DIR" ] || {
  echo "error: install directory must not already exist: $INSTALL_DIR" >&2; exit 73;
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nexus-tomarigi-native.XXXXXX")
STAGE_DIR=$WORK_DIR/archives
MARKER=$INSTALL_DIR/.nexus-native-build-owner
OWNER_TOKEN=$(basename -- "$WORK_DIR")
installed=0
install_identity=
cleanup() {
  status=$?
  rm -rf "$WORK_DIR"
  if [ "$status" -ne 0 ] && [ "$installed" -eq 1 ] \
    && [ "$(ls -di "$INSTALL_DIR" 2>/dev/null || :)" = "$install_identity" ] \
    && [ -f "$MARKER" ] && [ ! -L "$MARKER" ] \
    && [ "$(cat "$MARKER" 2>/dev/null || :)" = "$OWNER_TOKEN" ]; then
    rm -rf "$INSTALL_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$STAGE_DIR"
cp "$SOURCE_DIR/mecab-0.996.tar.gz" "$STAGE_DIR/mecab-0.996.tar.gz"
cp "$SOURCE_DIR/mecab-ipadic-2.7.0-20070610.tar.gz" "$STAGE_DIR/mecab-ipadic-2.7.0-20070610.tar.gz"
cp "$SOURCE_DIR/CRF++-0.58.tar.gz" "$STAGE_DIR/CRF++-0.58.tar.gz"
cp "$SOURCE_DIR/cabocha-0.69.tar.bz2" "$STAGE_DIR/cabocha-0.69.tar.bz2"
node "$SCRIPT_DIR/verify_tomarigi_native_sources.mjs" "$STAGE_DIR"

mkdir "$INSTALL_DIR"
installed=1
install_identity=$(ls -di "$INSTALL_DIR")
printf '%s\n' "$OWNER_TOKEN" > "$MARKER"

tar -xzf "$STAGE_DIR/mecab-0.996.tar.gz" -C "$WORK_DIR"
tar -xzf "$STAGE_DIR/mecab-ipadic-2.7.0-20070610.tar.gz" -C "$WORK_DIR"
tar -xzf "$STAGE_DIR/CRF++-0.58.tar.gz" -C "$WORK_DIR"
tar -xjf "$STAGE_DIR/cabocha-0.69.tar.bz2" -C "$WORK_DIR"

JOBS=${NEXUS_NATIVE_BUILD_JOBS:-2}
cd "$WORK_DIR/mecab-0.996"
./configure --prefix="$INSTALL_DIR" --with-charset=utf8
make -j "$JOBS"
make install
cd "$WORK_DIR/mecab-ipadic-2.7.0-20070610"
./configure --prefix="$INSTALL_DIR" --with-mecab-config="$INSTALL_DIR/bin/mecab-config" --with-charset=utf-8
make -j "$JOBS"
make install
cd "$WORK_DIR/CRF++-0.58"
./configure --prefix="$INSTALL_DIR"
make -j "$JOBS"
make install
cd "$WORK_DIR/cabocha-0.69"
CPPFLAGS="-I$INSTALL_DIR/include" \
LDFLAGS="-L$INSTALL_DIR/lib" \
PKG_CONFIG_PATH="$INSTALL_DIR/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}" \
./configure --prefix="$INSTALL_DIR" --enable-utf8-only --with-charset=UTF8 --with-posset=IPA \
  --with-mecab-config="$INSTALL_DIR/bin/mecab-config"
make -j "$JOBS"
make install

sh "$SCRIPT_DIR/diagnose_tomarigi_native.sh" "$INSTALL_DIR"
rm -f "$MARKER"
installed=0
