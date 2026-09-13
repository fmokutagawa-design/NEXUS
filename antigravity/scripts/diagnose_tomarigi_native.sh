#!/bin/sh
set -eu

[ "$#" -eq 1 ] || { echo "usage: $0 INSTALL_DIR" >&2; exit 64; }
INSTALL_DIR=$1
[ -n "$INSTALL_DIR" ] || { echo "error: install directory is required" >&2; exit 64; }
case "$INSTALL_DIR" in /*) ;; *) echo "error: install directory must be an absolute path" >&2; exit 64;; esac

for name in mecab crf_test cabocha; do
  [ -x "$INSTALL_DIR/bin/$name" ] || { echo "error: missing executable: $INSTALL_DIR/bin/$name" >&2; exit 69; }
done
DIC_DIR="$INSTALL_DIR/lib/mecab/dic/ipadic"
[ -f "$DIC_DIR/dicrc" ] || { echo "error: missing IPA dictionary: $DIC_DIR" >&2; exit 69; }

set +e
mecab_raw=$("$INSTALL_DIR/bin/mecab" --version 2>&1); mecab_status=$?
crf_raw=$("$INSTALL_DIR/bin/crf_test" --version 2>&1); crf_status=$?
cabocha_raw=$("$INSTALL_DIR/bin/cabocha" --version 2>&1); cabocha_status=$?
set -e
[ "$mecab_status" -eq 0 ] || { echo "error: MeCab version command failed with status $mecab_status" >&2; exit "$mecab_status"; }
[ "$mecab_raw" = 'mecab of 0.996' ] || { echo "error: unexpected MeCab version: $mecab_raw" >&2; exit 65; }
case "$crf_status" in 0|255) ;; *) echo "error: CRF++ version command failed with status $crf_status" >&2; exit "$crf_status";; esac
[ "$crf_raw" = 'CRF++ of 0.58' ] || { echo "error: unexpected CRF++ version: $crf_raw" >&2; exit 65; }
[ "$cabocha_status" -eq 0 ] || { echo "error: CaboCha version command failed with status $cabocha_status" >&2; exit "$cabocha_status"; }
[ "$cabocha_raw" = 'cabocha of 0.69' ] || { echo "error: unexpected CaboCha version: $cabocha_raw" >&2; exit 65; }

set +e
dictionary_info=$("$INSTALL_DIR/bin/mecab" -D -d "$DIC_DIR" 2>&1); dictionary_status=$?
set -e
case "$dictionary_status" in
  0|1) ;;
  *) echo "error: MeCab dictionary probe failed with status $dictionary_status" >&2; exit "$dictionary_status";;
esac
expected_filename=$(printf 'filename:\t%s' "$DIC_DIR/sys.dic")
expected_version=$(printf 'version:\t102')
expected_type=$(printf 'type:\t0')
printf '%s\n' "$dictionary_info" | grep -Fqx "$expected_filename" || { echo "error: MeCab dictionary probe returned the wrong dictionary" >&2; exit 65; }
printf '%s\n' "$dictionary_info" | grep -Fqx "$expected_version" || { echo "error: unexpected IPA dictionary version" >&2; exit 65; }
printf '%s\n' "$dictionary_info" | grep -Fqx "$expected_type" || { echo "error: unexpected IPA dictionary type" >&2; exit 65; }
printf '%s\n' "$dictionary_info" | grep -Eq '^charset:[[:space:]]+(UTF-8|utf-8)$' || { echo "error: IPA dictionary is not UTF-8" >&2; exit 65; }
for field in size 'left size' 'right size'; do
  printf '%s\n' "$dictionary_info" | grep -Eq "^$field:[[:space:]]+[0-9]+$" || { echo "error: incomplete IPA dictionary metadata" >&2; exit 65; }
done

sample='太郎は花子が読んでいる本を次郎に渡した。'
set +e
parse=$(printf '%s\n' "$sample" | "$INSTALL_DIR/bin/cabocha" -f1 -d "$DIC_DIR"); parse_status=$?
set -e
[ "$parse_status" -eq 0 ] || { echo "error: CaboCha parse failed with status $parse_status" >&2; exit "$parse_status"; }
case "$parse" in *"* 0 "*D*EOS*) ;; *) echo "error: Japanese dependency parse failed" >&2; exit 65;; esac

architecture=$(uname -m)
case "$architecture" in x86_64) architecture_status=supported;; *) architecture_status=unverified;; esac
echo "mecab 0.996"
echo "CRF++ 0.58"
echo "cabocha 0.69"
echo "charset: UTF-8"
echo "architecture: $architecture ($architecture_status)"
printf '%s\n' "$parse"
