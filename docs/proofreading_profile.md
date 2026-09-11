# 作品別校正設定

作品フォルダの中に `.nexus/proofreading.json` を置くと、その作品だけの校正設定を使用できます。

```json
{
  "mode": "novel",
  "whitelist": ["固有名詞", "作品独自の表記"],
  "disabled_rules": ["prh", "redpen/paragraph-indent"],
  "techniques": {
    "allow_nominal_endings": true,
    "allow_repetition": true,
    "relax_dialogue": true
  },
  "thresholds": {
    "long_paragraph": 1000,
    "blank_lines": 3
  }
}
```

`disabled_rules` は完全なルール名のほか、末尾に `*` を付けた前方一致も指定できます。

比較測定は `antigravity` フォルダで `npm run benchmark:proofreading` を実行します。結果には適合率、再現率、過剰指摘数、見逃し数が表示されます。付属コーパスは動作確認用の小規模セットであり、製品精度の確定値ではありません。
