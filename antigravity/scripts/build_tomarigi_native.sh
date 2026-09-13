#!/bin/sh
set -eu

usage() {
  echo "usage: $0 SOURCE_DIR INSTALL_DIR" >&2
  exit 64
}

[ "$#" -eq 2 ] || usage
SOURCE_DIR=$1
INSTALL_DIR=$2

[ -n "$SOURCE_DIR" ] || usage
[ -n "$INSTALL_DIR" ] || usage
case "$SOURCE_DIR" in
  /*) ;;
  *) echo "error: source directory must be an absolute path" >&2; exit 64 ;;
esac
case "$INSTALL_DIR" in
  /*) ;;
  *) echo "error: install directory must be an absolute path" >&2; exit 64 ;;
esac
case "$INSTALL_DIR" in
  /|"${HOME:?}") echo "error: unsafe install directory: $INSTALL_DIR" >&2; exit 64 ;;
esac
[ -d "$SOURCE_DIR" ] || { echo "error: source directory does not exist: $SOURCE_DIR" >&2; exit 66; }
[ ! -e "$INSTALL_DIR" ] || { echo "error: install directory must not already exist: $INSTALL_DIR" >&2; exit 73; }

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
node "$SCRIPT_DIR/verify_tomarigi_native_sources.mjs" "$SOURCE_DIR"

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/nexus-tomarigi-native.XXXXXX")
installed=0
cleanup() {
  status=$?
  rm -rf "$WORK_DIR"
  if [ "$status" -ne 0 ] && [ "$installed" -eq 1 ]; then
    rm -rf "$INSTALL_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$INSTALL_DIR"
installed=1

tar -xzf "$SOURCE_DIR/mecab-0.996.tar.gz" -C "$WORK_DIR"
tar -xzf "$SOURCE_DIR/mecab-ipadic-2.7.0-20070610.tar.gz" -C "$WORK_DIR"
tar -xzf "$SOURCE_DIR/CRF++-0.58.tar.gz" -C "$WORK_DIR"
tar -xjf "$SOURCE_DIR/cabocha-0.69.tar.bz2" -C "$WORK_DIR"

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
./configure \
  --prefix="$INSTALL_DIR" \
  --enable-utf8-only \
  --with-charset=UTF8 \
  --with-posset=IPA \
  --with-mecab-config="$INSTALL_DIR/bin/mecab-config"
make -j "$JOBS"
make install

"$SCRIPT_DIR/diagnose_tomarigi_native.sh" "$INSTALL_DIR"
installed=0
