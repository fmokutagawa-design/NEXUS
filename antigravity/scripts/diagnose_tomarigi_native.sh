#!/bin/sh
set -eu

[ "$#" -eq 1 ] || { echo "usage: $0 INSTALL_DIR" >&2; exit 64; }
INSTALL_DIR=$1
[ -n "$INSTALL_DIR" ] || { echo "error: install directory is required" >&2; exit 64; }
case "$INSTALL_DIR" in
  /*) ;;
  *) echo "error: install directory must be an absolute path" >&2; exit 64 ;;
esac

for name in mecab crf_test cabocha; do
  [ -x "$INSTALL_DIR/bin/$name" ] || {
    echo "error: missing executable: $INSTALL_DIR/bin/$name" >&2
    exit 69
  }
done

DIC_DIR="$INSTALL_DIR/lib/mecab/dic/ipadic"
[ -f "$DIC_DIR/dicrc" ] || { echo "error: missing IPA dictionary: $DIC_DIR" >&2; exit 69; }

mecab_raw=$("$INSTALL_DIR/bin/mecab" --version)
crf_raw=$("$INSTALL_DIR/bin/crf_test" --version 2>&1 || true)
cabocha_raw=$("$INSTALL_DIR/bin/cabocha" --version)

case "$mecab_raw" in *0.996*) ;; *) echo "error: unexpected MeCab version: $mecab_raw" >&2; exit 65;; esac
case "$crf_raw" in *0.58*) ;; *) echo "error: unexpected CRF++ version: $crf_raw" >&2; exit 65;; esac
case "$cabocha_raw" in *0.69*) ;; *) echo "error: unexpected CaboCha version: $cabocha_raw" >&2; exit 65;; esac

dictionary_info=$("$INSTALL_DIR/bin/mecab" -D -d "$DIC_DIR" 2>&1 || true)
case "$dictionary_info" in
  *charset:*UTF-8*|*charset:*utf-8*) ;;
  *) echo "error: IPA dictionary is not UTF-8" >&2; exit 65 ;;
esac

sample='太郎は花子が読んでいる本を次郎に渡した。'
parse=$(printf '%s\n' "$sample" | "$INSTALL_DIR/bin/cabocha" -f1 -d "$DIC_DIR")
case "$parse" in *"* 0 "*D*EOS*) ;; *) echo "error: Japanese dependency parse failed" >&2; exit 65;; esac

echo "mecab 0.996"
echo "CRF++ 0.58"
echo "cabocha 0.69"
echo "charset: UTF-8"
printf '%s\n' "$parse"
