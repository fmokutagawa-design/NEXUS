# 作品別校正設定

作品フォルダの中に `.nexus/proofreading.json` を置くと、その作品だけの校正設定を使用できます。

```json
{
  "mode": "novel",
  "whitelist": ["固有名詞", "作品独自の表記"],
  "enabled_rules": [],
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

## Tomarigiの辞書通知は参考情報として読む

同音異義語・漢数字・常用漢字の通知は、誤りを断定するものではありません。候補や理由を読んで、作品の文脈に合うか確認してください。通知から本文の置換や保存は行いません。

| 規則ID | 通知する条件 | 初期状態 |
| --- | --- | --- |
| `tomarigi/homonym-reference` | 解析された読みが辞書と一致し、有効な別表記の候補がある語 | 有効 |
| `tomarigi/chinese-numeral` | 数字と解析された漢数字のうち、辞書の除外熟語に含まれない箇所 | 有効 |
| `tomarigi/kanji-level` | 辞書に登録された常用漢字外の文字 | 無効 |

常用漢字の通知を使う作品では、`enabled_rules` を `["tomarigi/kanji-level"]` に変更します。省略時や空配列では無効です。`enabled_rules` は完全な規則IDだけを受け付け、`tomarigi/*` では有効になりません。

通知を止めるには、`disabled_rules` に規則IDを追加してください。`tomarigi/*` でこの3規則をまとめて除外できます。従来の `nexus-integrated-rules` でも、既存の統合規則とこの3規則をまとめて除外できます。有効・無効の両方に指定した場合は、無効が優先されます。ホワイトリストは従来どおり、通知の対象に登録語が含まれる場合に適用します。

助言は校正結果の本文に参考情報として表示され、適用できる修正案とは分離されます。内部データには `fix` や `suggested` を付けず、XMLでは `<advisory>` を使い、`<suggested>` を出力しません。同じ箇所に別の規則の修正案があっても、その案を助言に引き継ぎません。既存のprh表記辞書などによる修正案は従来どおりです。

## 比較測定で過剰指摘と見逃しを確認する

比較測定は `antigravity` フォルダで `npm run benchmark:proofreading` を実行します。結果には適合率、再現率、過剰指摘数、見逃し数が表示されます。付属コーパスは動作確認用の小規模セットであり、製品精度の確定値ではありません。
