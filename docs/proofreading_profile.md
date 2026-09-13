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

通知を止めるには、`disabled_rules` に規則IDを追加してください。`tomarigi/*` でこの3規則をまとめて除外できます。従来の `nexus-integrated-rules` でも、既存の統合規則とこの3規則をまとめて除外できます。有効・無効の両方に指定した場合は、無効が優先されます。ホワイトリストは従来どおり、通知の対象に登録語が含まれる場合に適用します。辞書通知では、登録語の出現範囲に収まる通知も除外します。たとえば `薔薇` を登録すると、その語中の `薔`・`薇` の通知は出ませんが、別の箇所に単独で現れた文字には適用しません。位置は絵文字や補助漢字を含めてUTF-16単位で照合し、作品別の登録語は共有リンターに保存しません。

助言は校正結果の本文に参考情報として表示され、適用できる修正案とは分離されます。内部データには `fix` や `suggested` を付けず、XMLでは `<advisory>` を使い、`<suggested>` を出力しません。同じ箇所に別の規則の修正案があっても、その案を助言に引き継ぎません。既存のprh表記辞書などによる修正案は従来どおりです。

助言のXMLには `<ruleIds>` と `<sources>` も含めます。出典のファイル名、リソース名、リソース内のキー、`sourceVersion`、`versionSource` はXMLエスケープし、助言同士をまとめる場合も異なる出典を残します。`sourceVersion` は元DLLのアセンブリ版です。XML設定自体には版がないため、対応するDLLの版とそのパスを `versionSource` で明示します。

## 辞書の再生成と出典の限界

`antigravity` で次のコマンドを実行します。抽出にはMonoの `mcs`・`mono`・`monodis`・`resgen` が必要ですが、通常の校正とビルドは生成済みデータだけを使います。

```sh
python3 scripts/sync_tomarigi_dictionary.py
python3 scripts/sync_tomarigi_reference_data.py
python3 scripts/sync_tomarigi_dictionary.py --check
python3 scripts/sync_tomarigi_reference_data.py --check
```

どちらの `--check` も書き込まず、生成内容との差異や生成物の欠落があれば非ゼロで終了します。PRHでは手作業の490件を保持し、Tomarigi正本の146件を合わせて636件を生成します。正本の `t_adverbkana.xml` にある `漸く → シバラク` は意味を変えるため、同期スクリプトの `SOURCE_QUARANTINE` で監査対象として除外しています。XMLは変更せず、推測した読みへの置換もしません。

生成先は `textlint/data/tomarigi/` です。

- `kanji.json`：6,359字と部首定義265件。`radicalId`、`parts`、`similar`、常用／その他を区別した `OnS`・`KunS`・`On`・`Kun` の読み18,819件を保持します。読みの順序と送り仮名の区切りは原資料どおりです。
- `homonyms.json`：同音異義語1,550グループ・3,760語と同訓異字181項目。
- `usage-exceptions.json`：漢数字の除外熟語328件、「的」490件・「超」129件。`settings` には句読点・文字幅・文末形式のXML設定9値を原名・原値のまま保持します。これらの設定から新しい校正规則は有効にしません。
- `reference-manifest.json`：スキーマ版2、データ別の出典・版、10入力ファイルのSHA-256、件数。生成日時は含めません。

原資料では6,359字すべての `Similar` が空文字です。また、`𠮟`・`塡`・`剝`・`頰` の `RadicalID` は `0` で、対応する部首定義がありません。空文字とIDをそのまま残し、類似漢字や部首を補ってはいません。`鬱` は原資料どおり常用漢字として扱います。

## 比較測定で過剰指摘と見逃しを確認する

比較測定は `antigravity` フォルダで `npm run benchmark:proofreading` を実行します。結果には適合率、再現率、過剰指摘数、見逃し数が表示されます。付属コーパスは動作確認用の小規模セットであり、製品精度の確定値ではありません。
