module.exports = {
  rules: {
    // 1. prh表記辞書。Tomarigi本体ではなく、誤字・慣用句・読みやすい表記を扱う。
    "prh": {
      "rulePaths": [
        "textlint/prh.yml"
      ]
    },
    // 2. 日本語標準プリセット（RedPen / LanguageTool のコア機能をカバー）
    "preset-japanese": {
      "sentence-length": { "max": 100 },      // 一文の長さ制限 (RedPen/Tomarigi)
      "max-ten": { "max": 3 },                 // 読点数制限 (RedPen)
      "no-doubled-joshi": { 
        "max": 3,                              // 助詞の連続制限 (Tomarigi)
        "allow": ["も", "や"] 
      },
      "no-doubled-conjunction": true,          // 接続詞の連続 (Tomarigi)
      "no-double-negative-ja": true,           // 二重否定 (LanguageTool)
      "no-dropping-the-ra": true,              // ら抜き言葉
      "no-mix-dearu-desumasu": true,           // 敬体・常体混在 (RedPen)
      "no-nfd": true,                          // Unicode正規化エラー
      "no-invalid-control-character": true     // 制御文字
    },
    // 3. スペース・記号の整形 (RedPen 由来のルールを多く含む)
    "preset-ja-spacing": {
      "ja-no-space-between-full-width": true,
      "ja-no-space-around-parentheses": true,
      "ja-space-between-half-and-full-width": { "space": "never" }
    }
    // NEXUS 独自ルールはローカルファイルなので、electron/textlintMain.cjs で
    // 明示的に読み込む。ここへ名前だけを書くと設定全体のロードが失敗する。
  }
};
