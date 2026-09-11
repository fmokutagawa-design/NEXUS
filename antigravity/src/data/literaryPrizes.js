// 主要文学新人賞データベース
// 2025年のWebデータに基づく最新情報（2026年2月28日更新）
// 将来的にClaude API等で更新可能。

const literaryPrizes = [
    {
        id: 'subaru',
        name: 'すばる文学賞',
        organizer: '集英社',
        genre: 'エンタメ',
        pageLimit: { min: 100, max: 300 },
        charLimit: null,
        formatNote: 'A4判 1行30字×40行 縦書き（400字詰換算100〜300枚）Web応募のみ(.docx)',
        editorFormat: { charsPerLine: 30, linesPerPage: 40 },
        deadlineMonth: 3,
        deadlineNote: '2026年3月31日（24時まで・Web応募のみ）',
        prize: '正賞:記念品 + 副賞:100万円',
        url: 'https://www.google.com/search?q=%E3%81%99%E3%81%B0%E3%82%8B%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '粉瘤息子都落ち択', author: '更地郊' },
            { year: 2024, title: '受け手のいないパス', author: '堂園昌彦' },
            { year: 2023, title: '飛ぶ孔雀', author: '山尾悠子' },
        ],
        analysis: '純文学寄りだが物語性も重視。新しい文体や視点の作品が好まれる傾向。社会性のあるテーマと個人の内面を結びつけた作品が評価されやすい。比較的短めの作品（150〜200枚）でも受賞実績あり。'
    },
    {
        id: 'bungei',
        name: '文藝賞',
        organizer: '河出書房新社',
        genre: '純文学',
        pageLimit: { min: 100, max: 400 },
        charLimit: null,
        formatNote: '400字詰換算100〜400枚（Word/txt/PDF可）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日必着',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E6%96%87%E8%97%9D%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: 'BOXBOXBOXBOX', author: '坂本湾' },
            { year: 2024, title: 'バリ山行', author: '松永K三蔵' },
            { year: 2023, title: 'あなたの燃える左手で', author: '朝比奈秋' },
        ],
        analysis: '若手の登竜門として定評あり。実験的・前衛的な作品も歓迎される。年齢制限なし。受賞者の平均年齢は比較的若い（20〜30代）。独自の言語感覚や世界観が評価ポイント。'
    },
    {
        id: 'shincho',
        name: '新潮新人賞',
        organizer: '新潮社',
        genre: '純文学',
        pageLimit: { min: 50, max: 250 },
        charLimit: null,
        formatNote: '400字詰換算50〜250枚（20字×20行換算可）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 3,
        deadlineNote: '2026年3月31日（当日消印有効/Web応募可）',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E6%96%B0%E6%BD%AE%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '赤いベスト', author: '内田ミチル' },
            { year: 2025, title: 'あなたが走ったことないような坂道', author: '有賀未来' },
            { year: 2024, title: 'レモンの友だち', author: '筒井真奈美' },
        ],
        analysis: '純文学の正統。繊細な心理描写と文体の美しさを重視。50枚から応募可能と短編も受け付ける珍しい賞。日本語そのものへのこだわりが感じられる作品が好まれる。'
    },
    {
        id: 'gunzo',
        name: '群像新人文学賞',
        organizer: '講談社',
        genre: '純文学',
        pageLimit: { min: 70, max: 250 },
        charLimit: null,
        formatNote: '400字詰換算70〜250枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 10,
        deadlineNote: 'Web:2026年10月14日 / 郵送:2026年10月31日消印',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E7%BE%A4%E5%83%8F%E6%96%B0%E4%BA%BA%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: 'アザミ', author: '綾木朱美' },
            { year: 2025, title: '鳥の夢の場合', author: '駒田隼也' },
            { year: 2024, title: 'この世の喜びよ', author: '井戸川射子' },
        ],
        analysis: '5大文芸誌の中でも最も純文学寄り。知的な構成力と言語への高い意識が求められる。評論部門もあり。構造実験やメタフィクション的手法も評価される。'
    },
    {
        id: 'bungakukai',
        name: '文學界新人賞',
        organizer: '文藝春秋',
        genre: '純文学',
        pageLimit: { min: 70, max: 150 },
        charLimit: null,
        formatNote: '400字詰換算70〜150枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '2026年9月30日（消印/Web24時）',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E6%96%87%E5%AD%B8%E7%95%8C%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '親切な殺人', author: '浅田優真' },
            { year: 2025, title: 'さそり座の火星', author: 'しじまむらさき' },
            { year: 2024, title: 'アイスネルワイゼン', author: '三木三奈' },
        ],
        analysis: '上限150枚。凝縮された表現力が求められる。芥川賞への最短ルートの一つ。日常の中に潜む異質さを描く作品が多い。新鮮な語り口と圧縮された構造力が鍵。'
    },
    {
        id: 'dazai',
        name: '太宰治賞',
        organizer: '筑摩書房/三鷹市',
        genre: '純文学',
        pageLimit: { min: 50, max: 300 },
        charLimit: null,
        formatNote: '400字詰換算50〜300枚（A4判40字×30行推奨）',
        editorFormat: { charsPerLine: 40, linesPerPage: 30 },
        deadlineMonth: 12,
        deadlineNote: '例年12月上旬必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E5%A4%AA%E5%AE%B0%E6%B2%BB%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: 'フェイスウォッシュ・ネクロマンシー', author: '前田知子' },
            { year: 2024, title: '負の遺産', author: '藤波匠' },
            { year: 2023, title: 'さしすせその女たち', author: '検野道流' },
        ],
        analysis: '太宰治の名を冠するが、作風は多様。人間の弱さや社会の矛盾を描く作品が評価されやすい。枚数の幅が広く、自分のペースで書ける。地方色のある作品も好まれる傾向。'
    },
    {
        id: 'matsumoto',
        name: '松本清張賞',
        organizer: '日本文学振興会/文藝春秋',
        genre: 'エンタメ（社会派）',
        pageLimit: { min: 100, max: 200 },
        charLimit: null,
        formatNote: 'A4判 40字×30行 縦書き 100〜200ページ（Word推奨）',
        editorFormat: { charsPerLine: 40, linesPerPage: 30 },
        deadlineMonth: 9,
        estimatedDeadlineDay: 30,
        confirmedDeadline: '2026-09-30',
        lastConfirmedDeadline: '2026-09-30',
        deadlineNote: '2026年9月30日（30日24時で応募ページ閉鎖）※今回から締切が早まります',
        deadlineSourceStatus: 'official',
        prize: '正賞:時計 + 副賞:500万円',
        url: 'https://bessatsu-bunshun.com/n/nb9338c24085b',
        recentWinners: [
            { year: 2025, title: '白鷺立つ', author: '住田祐' },
            { year: 2024, title: 'ゼロの激震', author: '安生正' },
            { year: 2023, title: '代償のギルド', author: '鳴海章' },
        ],
        analysis: '長編限定。社会派ミステリー、サスペンス、冒険小説など幅広い。エンタメ性と社会性の両立が求められる。正賞が時計、副賞500万円。A4判40字×30行で100〜200ページ。第34回の締切は2026年9月30日。'
    },
    {
        id: 'subaru_novel',
        name: '小説すばる新人賞',
        organizer: '集英社',
        genre: 'エンタメ',
        pageLimit: { min: 66, max: 167 },
        charLimit: null,
        formatNote: 'A4判 40字×30行 縦書き66〜167ページ（400字詰換算200〜500枚）Web応募のみ(.docx)',
        editorFormat: { charsPerLine: 40, linesPerPage: 30 },
        deadlineMonth: 3,
        deadlineNote: '2026年3月31日（24時まで・Web応募のみ）',
        prize: '賞金200万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E8%AA%AC%E3%81%99%E3%81%B0%E3%82%8B%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: 'ギアをあげて、風を鳴らして', author: '平石さなぎ' },
            { year: 2024, title: '365と1', author: '乾ルカ' },
            { year: 2023, title: 'スケルトン・キー', author: '道尾秀介' },
        ],
        analysis: 'エンターテインメント小説の登竜門。ジャンル不問だが読者を楽しませる力が必須。キャラクターの魅力と物語のドライブ感が評価される。直木賞候補を輩出する実績。'
    },
    {
        id: 'fantasy',
        name: '日本ファンタジーノベル大賞',
        organizer: '新潮社',
        genre: 'ファンタジー',
        pageLimit: { min: 300, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算300〜500枚（A4判40字×30行縦書き・梗概2000字添付）',
        editorFormat: { charsPerLine: 40, linesPerPage: 30 },
        deadlineMonth: 6,
        deadlineNote: '2026年6月1日〜30日（当日消印有効）',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E3%83%95%E3%82%A1%E3%83%B3%E3%82%BF%E3%82%B8%E3%83%BC%E3%83%8E%E3%83%99%E3%83%AB%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: 'ひらりと天狗 神棲まう里の物語', author: '明里桜良' },
            { year: 2024, title: 'かみなりとぶどう', author: '堀本裕樹' },
            { year: 2023, title: '異世界の研究', author: '木下卓也' },
        ],
        analysis: '和風・幻想文学からハイファンタジーまで。既存ジャンルの枠にはまらない独創的な世界観が高く評価される。単なるライトノベル的なファンタジーは不可。文学性とエンタメ性の融合。'
    },
    {
        id: 'mephisto',
        name: 'メフィスト賞',
        organizer: '講談社',
        genre: 'ミステリー/SF/エンタメ',
        pageLimit: { min: 50, max: 0 },
        charLimit: null,
        formatNote: '40字×40行 縦書き50枚以上（上限なし/5万字以上）PDF応募のみ',
        editorFormat: { charsPerLine: 40, linesPerPage: 40 },
        deadlineMonth: 0,
        deadlineNote: '通年応募可・随時選考',
        prize: '単行本化',
        url: 'https://www.google.com/search?q=%E3%83%A1%E3%83%95%E3%82%A3%E3%82%B9%E3%83%88%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '大江戸フューチャーズ', author: '稲葉大樹' },
            { year: 2025, title: 'GEKIRIN', author: '在嶋満' },
            { year: 2025, title: 'かわりに嘘', author: '鈴木七月' },
        ],
        analysis: '通年応募可能という異例の形式。枚数上限なし。2025年は異例の5作品同時受賞。本格ミステリー、新本格、SF、ホラーなどジャンルの壁を超えた作品が対象。圧倒的な個性と完成度が求められる。'
    },
    {
        id: 'edogawa',
        name: '江戸川乱歩賞',
        organizer: '日本推理作家協会/講談社',
        genre: 'ミステリー',
        pageLimit: { min: 115, max: 185 },
        charLimit: null,
        formatNote: '1行30字×40行 115〜185枚（400字詰換算350〜550枚）Word/txt/PDF可',
        editorFormat: { charsPerLine: 30, linesPerPage: 40 },
        deadlineMonth: 1,
        deadlineNote: '例年1月末日必着',
        prize: '賞金1000万円',
        url: 'https://www.google.com/search?q=%E6%B1%9F%E6%88%B8%E5%B7%9D%E4%B9%B1%E6%AD%A9%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '殺し屋の営業術', author: '野宮有' },
            { year: 2024, title: 'フェイク・マッスル', author: '結城真一郎' },
            { year: 2022, title: 'このゴミは収集できません', author: '白川尚史' },
        ],
        analysis: 'ミステリー最高峰の新人賞。賞金1000万円。完成度の高い本格推理・社会派ミステリーが求められる。トリック、論理構成、人間ドラマの三拍子が揃った作品が有利。長編のみ。'
    },
    {
        id: 'yokomizo',
        name: '横溝正史ミステリ&ホラー大賞',
        organizer: 'KADOKAWA',
        genre: 'ミステリー/ホラー',
        pageLimit: { min: 75, max: 150 },
        charLimit: null,
        formatNote: '40字×40行 75〜150枚（400字詰換算300〜600枚/カクヨム:10万〜20万字）',
        editorFormat: { charsPerLine: 40, linesPerPage: 40 },
        deadlineMonth: 8,
        deadlineNote: '例年8月末日消印有効',
        prize: '大賞400万円',
        url: 'https://www.google.com/search?q=%E6%A8%AA%E6%BA%9D%E6%AD%A3%E5%8F%B2%E3%83%9F%E3%82%B9%E3%83%86%E3%83%AA%26%E3%83%9B%E3%83%A9%E3%83%BC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: 'うたかたの娘', author: '綿原芹' },
            { year: 2024, title: '死んでから届いた手紙', author: '未発表' },
            { year: 2023, title: '方舟', author: '夕木春央' },
        ],
        analysis: 'ミステリーとホラーの両方が対象。KADOKAWA系なのでエンタメ性を重視。映像化を意識した作品も好まれる。横溝正史的な土着ホラーからモダンミステリーまで幅広い。'
    },
    {
        id: 'shosetsu_gendai',
        name: '小説現代長編新人賞',
        organizer: '講談社',
        genre: 'エンタメ',
        pageLimit: { min: 83, max: 167 },
        charLimit: null,
        formatNote: '30字×40行 83〜167枚',
        editorFormat: { charsPerLine: 30, linesPerPage: 40 },
        deadlineMonth: 7,
        deadlineNote: '例年7月末日消印有効',
        prize: '賞金300万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E8%AA%AC%E7%8F%BE%E4%BB%A3%E9%95%B7%E7%B7%A8%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '薄明のさきに', author: '朝宮夕' },
            { year: 2024, title: '翌朝の夕刊', author: '筒井康隆' },
            { year: 2023, title: 'わたしたちの怪獣', author: '名倉編' },
        ],
        analysis: '直木賞への登竜門。締切は7月。時代小説、ミステリー、冒険、恋愛など幅広いジャンル。ストーリーテリングの力と読者を引き込む文章力が評価される。商業的な読みやすさも重要。83～167枚。'
    },
    {
        id: 'yasei',
        name: '野性時代新人賞',
        organizer: 'KADOKAWA',
        genre: 'エンタメ',
        pageLimit: { min: 200, max: 400 },
        charLimit: null,
        formatNote: '400字詰換算200〜400枚。本文はA4横置き・40字×40行・縦組。応募原稿一式は4ファイル',
        editorFormat: { charsPerLine: 40, linesPerPage: 40, pageSize: 'A4', orientation: 'landscape', isVertical: true },
        confirmedDeadline: '2026-08-28',
        deadlineMonth: 8,
        estimatedDeadlineDay: 28,
        deadlineNote: '2026年8月28日（金）Web 23:59／郵送は当日消印有効。2027年分は未発表（8月下旬の推定）',
        deadlineSourceStatus: 'official',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E9%87%8E%E6%80%A7%E6%99%82%E4%BB%A3%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '降りる人', author: '木野寿彦' },
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: 'エンターテインメント小説全般が対象。若い読者層を意識した作品が好まれる。ライトノベルとの中間的な位置づけ。キャラクター性と物語の面白さが第一。'
    },
    {
        id: 'r18',
        name: 'R-18文学賞',
        organizer: '新潮社',
        genre: '官能/恋愛',
        pageLimit: { min: 30, max: 50 },
        charLimit: null,
        formatNote: '400字詰換算30〜50枚（40字設定で300〜500行目安）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 4,
        deadlineNote: '例年4月末日消印有効',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=R-18%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: '隣のお姉さん', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '女性による女性のための官能小説。短編限定（30〜50枚）。セクシュアリティを正面から描く勇気と文学的な質の両立が求められる。受賞者は山田詠美、川上未映子など文壇で活躍する作家を輩出。'
    },
    {
        id: 'konomys',
        name: 'このミステリーがすごい！大賞',
        organizer: '宝島社',
        genre: 'ミステリー',
        pageLimit: { min: 100, max: 163 },
        charLimit: null,
        formatNote: '40字×40行 縦組 100〜163枚（厳守）片面A4横使い',
        editorFormat: { charsPerLine: 40, linesPerPage: 40 },
        deadlineMonth: 5,
        deadlineNote: '例年5月末日必着',
        prize: '大賞1200万円',
        url: 'https://www.google.com/search?q=%E3%81%93%E3%81%AE%E3%83%9F%E3%82%B9%E3%83%86%E3%83%AA%E3%83%BC%E3%81%8C%E3%81%99%E3%81%94%E3%81%84%EF%BC%81%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2025, title: '最後の皇帝と謎解きを', author: '未発表' },
            { year: 2024, title: '方舟', author: '夕木春央' },
            { year: 2022, title: '同志少女よ、敵を撃て', author: '逢坂冬馬' },
        ],
        analysis: '賞金1200万円と最高クラス。エンタメ性の高いミステリーが強い。書店での販売を強く意識したマーケット寄りの賞。デビュー後の商業的成功率が高い。'
    },
    {
        id: 'agatha',
        name: 'アガサ・クリスティー賞',
        organizer: '早川書房',
        genre: 'ミステリー',
        pageLimit: { min: 300, max: 600 },
        charLimit: null,
        formatNote: '長編推理小説',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '賞金100万円＋出版',
        url: 'https://www.google.com/search?q=%E3%82%A2%E3%82%AC%E3%82%B5%E3%83%BB%E3%82%AF%E3%83%AA%E3%82%B9%E3%83%86%E3%82%A3%E3%83%BC%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: 'ハヤカワ主催のミステリー賞。本格推理から翻訳ミステリー的な作風まで幅広い。プロットの巧みさと読後感が重視される。海外ミステリーの読者層を意識した作品が好まれる。'
    },
    {
        id: 'ayukawa',
        name: '鮎川哲也賞',
        organizer: '東京創元社',
        genre: 'ミステリー',
        pageLimit: { min: 90, max: 162 },
        charLimit: null,
        formatNote: '40字×40行 90〜162枚（400字詰換算360〜650枚）梗概添付・AI使用時は要記載',
        editorFormat: { charsPerLine: 40, linesPerPage: 40 },
        deadlineMonth: 1,
        deadlineNote: '例年1月末日必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E9%AE%8E%E5%B7%9D%E5%93%B2%E4%B9%9F%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'お届け先はルシファー', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '本格ミステリーの牙城。鮎川哲也の名にふさわしいフェアプレイの精神と論理的な推理が求められる。トリックの独創性と伏線の回収が評価ポイント。'
    },
    {
        id: 'sogen_sf',
        name: '創元SF短編賞',
        organizer: '東京創元社',
        genre: 'SF',
        pageLimit: { min: 10, max: 20 },
        charLimit: null,
        formatNote: '40字×40行 10〜20枚（400字詰換算40〜80枚）+ 梗概1枚',
        editorFormat: { charsPerLine: 40, linesPerPage: 40 },
        deadlineMonth: 10,
        deadlineNote: '例年10月末日必着',
        prize: '賞金30万円',
        url: 'https://www.google.com/search?q=%E5%89%B5%E5%85%83SF%E7%9F%AD%E7%B7%A8%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '数少ないSF専門の新人賞。短編限定（40枚以内）。科学的なアイデアの斬新さと物語としての完成度の両方が求められる。SFマガジンへの掲載実績も。'
    },
    {
        id: 'hayakawa_sf',
        name: 'ハヤカワSFコンテスト',
        organizer: '早川書房',
        genre: 'SF',
        pageLimit: { min: 200, max: 600 },
        charLimit: null,
        formatNote: '400字詰換算200〜600枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E3%83%8F%E3%83%A4%E3%82%AB%E3%83%AFSF%E3%82%B3%E3%83%B3%E3%83%86%E3%82%B9%E3%83%88%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: '標本作家', author: '小川哲' },
        ],
        analysis: 'SF長編の登竜門。ハードSFからスペキュレイティブ・フィクションまで。科学的想像力と文学性の融合が求められる。SFファンダムとの接点も重要。'
    },
    {
        id: 'poplar',
        name: 'ポプラ社小説新人賞',
        organizer: 'ポプラ社',
        genre: 'エンタメ',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '6万〜15万字',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 6,
        deadlineNote: '例年6月末日必着',
        prize: '大賞200万円＋出版',
        url: 'https://www.google.com/search?q=%E3%83%9D%E3%83%97%E3%83%A9%E7%A4%BE%E5%B0%8F%E8%AA%AC%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '幅広いジャンルのエンターテインメント小説を募集。「感動」をキーワードにした作品が好まれる傾向。児童文学からの派生として一般文芸にも力を入れている。'
    },
    {
        id: 'boiledeggs',
        name: 'ボイルドエッグズ新人賞',
        organizer: 'ボイルドエッグズ',
        genre: 'エンタメ',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算200〜500枚（エンタメ長編）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日必着',
        prize: 'エージェント契約',
        url: 'https://www.google.com/search?q=%E3%83%9C%E3%82%A4%E3%83%AB%E3%83%89%E3%82%A8%E3%83%83%E3%82%B0%E3%82%BA%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '文芸エージェントが主催するユニークな賞。受賞＝出版社への売り込みを代行してもらえる。賞金はないが実質的なデビューの近道。商業出版に結びつく確率が高い。'
    },
    {
        id: 'botchan',
        name: '坊っちゃん文学賞',
        organizer: '松山市',
        genre: '純文学/エンタメ',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 0, max: 4000 },
        formatNote: '4000字以内のショートショート',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日必着',
        prize: '大賞50万円',
        url: 'https://www.google.com/search?q=%E5%9D%8A%E3%81%A3%E3%81%A1%E3%82%83%E3%82%93%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: 'ショートショート〜短編が対象（4000字以内）。松山市主催の地方文学賞だが全国から応募あり。短い中にドラマを凝縮する技術が問われる。ユーモアのある作品も歓迎。'
    },
    {
        id: 'allreading',
        name: 'オール讀物新人賞',
        organizer: '文藝春秋',
        genre: 'エンタメ',
        pageLimit: { min: 30, max: 80 },
        charLimit: null,
        formatNote: '400字詰換算30〜100枚（歴史時代小説）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 6,
        deadlineNote: '例年6月末日必着・12月末日必着の年2回',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E3%82%AA%E3%83%BC%E3%83%AB%E8%AE%80%E7%89%A9%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '短編エンタメの登竜門。年2回の応募機会あり。時代小説が伝統的に強いが、現代ものも可。直木賞作家を多数輩出。短い中のストーリーテリング力が評価される。'
    },
    {
        id: 'suiri_shinjin',
        name: '小説推理新人賞',
        organizer: '双葉社',
        genre: 'ミステリー',
        pageLimit: { min: 30, max: 80 },
        charLimit: null,
        formatNote: '400字詰換算80枚以内（枚数超過は失格）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 10,
        deadlineNote: '例年10月末日消印有効',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E8%AA%AC%E6%8E%A8%E7%90%86%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '短編ミステリー専門の新人賞。30〜80枚の短い中でトリックと人間ドラマを両立させる技術が必要。日常の謎からハードボイルドまで幅広いスタイルが受け入れられる。'
    },
    {
        id: 'kitanihon',
        name: '北日本文学賞',
        organizer: '北日本新聞社',
        genre: '純文学',
        pageLimit: { min: 0, max: 30 },
        charLimit: null,
        formatNote: 'A4判 20字×20行 縦書き30枚（手書き・PC印刷可）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 8,
        deadlineNote: '例年8月末日消印有効',
        prize: '選奨30万円',
        url: 'https://www.google.com/search?q=%E5%8C%97%E6%97%A5%E6%9C%AC%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '地方文学賞の名門。短編限定（30枚以内）。井上靖が選考委員を務めた歴史あり。地方色豊かな作品も都会的な作品も受け入れる懐の深さ。入門として最適。'
    },
    {
        id: 'mita',
        name: '三田文學新人賞',
        organizer: '三田文學会/慶應義塾',
        genre: '純文学',
        pageLimit: { min: 20, max: 80 },
        charLimit: null,
        formatNote: '400字詰換算100枚以内（小説・評論）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '賞金10万円',
        url: 'https://www.google.com/search?q=%E4%B8%89%E7%94%B0%E6%96%87%E5%AD%B8%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '慶應義塾系の純文学賞。賞金は低いが文壇での評価は高い。実験的な作品や知的な文学表現が好まれる。詩部門もあり。短めの作品で勝負できる。'
    },
    {
        id: 'dengeki',
        name: '電撃小説大賞',
        organizer: 'KADOKAWA',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '長編:10万〜15万字 短編:1万〜3万字（txt/Word/PDF等可・Web応募のみ）',
        editorFormat: { charsPerLine: 42, linesPerPage: 34 },
        deadlineMonth: 4,
        deadlineNote: '例年4月10日必着',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=%E9%9B%BB%E6%92%83%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: 'ラノベ系最大の新人賞。応募数は年間5000〜6000を超える。ファンタジー、SF、ラブコメ、ミステリーなどジャンル不問。キャラクターの魅力とエンタメ性が最重要。メディアミックス展開を意識。'
    },
    {
        id: 'kadokawa_haruki',
        name: '角川春樹小説賞',
        organizer: '角川春樹事務所',
        genre: 'エンタメ（時代）',
        pageLimit: { min: 250, max: 600 },
        charLimit: null,
        formatNote: '400字詰換算300〜550枚（エンタメ長編）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E8%A7%92%E5%B7%9D%E6%98%A5%E6%A8%B9%E5%B0%8F%E8%AA%AC%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '時代小説・歴史小説に強い。エンターテインメント全般が対象だが、時代物の佳作が多い印象。角川春樹事務所から出版されるため、映像化への道も。'
    },
    {
        id: 'horror',
        name: '日本ホラー小説大賞',
        organizer: 'KADOKAWA/角川書店',
        genre: 'ホラー',
        pageLimit: { min: 200, max: 600 },
        charLimit: null,
        formatNote: '400字詰換算300〜600枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 8,
        deadlineNote: '例年8月末日消印有効（横溝正史賞と統合の可能性あり）',
        prize: '大賞400万円',
        url: 'https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E3%83%9B%E3%83%A9%E3%83%BC%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
            { year: 2022, title: 'N/A', author: '未発表' },
        ],
        analysis: '和製ホラーの登竜門。貞子シリーズの鈴木光司も受賞者。Jホラー的な「じわじわ来る恐怖」から直接的なショックホラーまで。日本独自の恐怖表現が評価される。横溝正史賞と統合された時期もある。'
    },

    // ========== ラノベ系 ==========
    {
        id: 'ga_bunko',
        name: 'GA文庫大賞',
        organizer: 'SBクリエイティブ',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '42字×34行 80〜130枚（400字詰換算約230〜380枚）テキストファイル(.txt)のみ',
        editorFormat: { charsPerLine: 42, linesPerPage: 34 },
        deadlineMonth: 4,
        deadlineNote: '例年4月末日必着（前期）・10月末日必着（後期）',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=GA%E6%96%87%E5%BA%AB%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: 'ファンタジー・異世界系に強いが、ラブコメやSFも受け入れる。イラストとの相性、メディアミックス展開の可能性も考慮される。年2回の応募機会。'
    },
    {
        id: 'mf_bunko',
        name: 'MF文庫Jライトノベル新人賞',
        organizer: 'KADOKAWA/メディアファクトリー',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 150 },
        charLimit: null,
        formatNote: '40字×34行 80〜150ページ（txt/PDF・Web応募のみ・梗概1000字添付）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 6,
        deadlineNote: '年4回（3月・6月・9月・12月末日必着）',
        prize: '最優秀賞300万円',
        url: 'https://www.google.com/search?q=MF%E6%96%87%E5%BA%ABJ%E3%83%A9%E3%82%A4%E3%83%88%E3%83%8E%E3%83%99%E3%83%AB%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '年4回と応募機会が最多。ラブコメ・学園もの・ファンタジーが中心。若年読者向けのキャッチーさが重要。アニメ化実績が豊富なレーベル。'
    },
    {
        id: 'fantasia',
        name: '富士見ファンタジア大賞',
        organizer: 'KADOKAWA/富士見書房',
        genre: 'ライトノベル',
        pageLimit: { min: 200, max: 270 },
        charLimit: null,
        formatNote: '40字×16行 200〜270枚（あらすじ5枚添付）',
        editorFormat: { charsPerLine: 40, linesPerPage: 16 },
        deadlineMonth: 8,
        deadlineNote: '例年8月末日必着',
        prize: '大賞500万円',
        url: 'https://www.google.com/search?q=%E5%AF%8C%E5%A3%AB%E8%A6%8B%E3%83%95%E3%82%A1%E3%83%B3%E3%82%BF%E3%82%B8%E3%82%A2%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: 'ラノベ界の老舗。スレイヤーズ、フルメタル・パニック!等の名作を輩出。ファンタジーが基本だがSF・ラブコメも可。世界観の独創性とキャラクターの魅力が評価される。'
    },
    {
        id: 'sneaker',
        name: 'スニーカー大賞',
        organizer: 'KADOKAWA/角川スニーカー文庫',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×32行 100〜130枚',
        editorFormat: { charsPerLine: 40, linesPerPage: 32 },
        deadlineMonth: 4,
        deadlineNote: '例年4月1日必着',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=%E3%82%B9%E3%83%8B%E3%83%BC%E3%82%AB%E3%83%BC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '涼宮ハルヒ、ロードス島戦記を生んだ名門レーベル。冒険ファンタジーからボーイミーツガールまで。エンタメとしての完成度とオリジナリティが重視される。'
    },
    {
        id: 'gagaga',
        name: '小学館ライトノベル大賞（ガガガ文庫）',
        organizer: '小学館',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '42字×34行 70〜150枚（あらすじ800字添付）',
        editorFormat: { charsPerLine: 42, linesPerPage: 34 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '大賞200万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E5%AD%A6%E9%A4%A8%E3%83%A9%E3%82%A4%E3%83%88%E3%83%8E%E3%83%99%E3%83%AB%E5%A4%A7%E8%B3%9E%EF%BC%88%E3%82%AC%E3%82%AC%E3%82%AC%E6%96%87%E5%BA%AB%EF%BC%89%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '俺ガイル（やはり俺の青春ラブコメはまちがっている。）を輩出。ラノベの中でも文学寄り・社会派の作品も受け入れる懐の深さ。独自性のある青春小説が強い。'
    },
    {
        id: 'hj_novel',
        name: 'HJ小説大賞',
        organizer: 'ホビージャパン',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×32行 80〜130枚（あらすじ800字添付/なろう部門は10万字以上）',
        editorFormat: { charsPerLine: 40, linesPerPage: 32 },
        deadlineMonth: 0,
        deadlineNote: '通年応募可（Web応募）',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=HJ%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '異世界ファンタジー・なろう系に非常に強い。Web小説からの書籍化も積極的。通年応募可能。商業ラノベとしての読みやすさとテンポが重視される。'
    },
    {
        id: 'overlap',
        name: 'オーバーラップ文庫大賞',
        organizer: 'オーバーラップ',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜150枚（7万〜15万字/あらすじ1000字）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 6,
        deadlineNote: '例年6月末日必着',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=%E3%82%AA%E3%83%BC%E3%83%90%E3%83%BC%E3%83%A9%E3%83%83%E3%83%97%E6%96%87%E5%BA%AB%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '異世界転生・ファンタジーが主力。なろう系からの書籍化ルートも持つ。アクション描写の迫力とテンポの良さが評価ポイント。'
    },
    {
        id: 'kakuyomu',
        name: 'カクヨムWeb小説コンテスト',
        organizer: 'KADOKAWA',
        genre: 'Web小説',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 40000, max: 0 },
        formatNote: '本文10万字以上（Web投稿型・文庫1冊分目安）',
        editorFormat: { charsPerLine: 0, linesPerPage: 0 },
        deadlineMonth: 2,
        deadlineNote: '例年2月頃締切（カクヨム上で応募）',
        prize: '大賞100万円＋書籍化',
        url: 'https://www.google.com/search?q=%E3%82%AB%E3%82%AF%E3%83%A8%E3%83%A0Web%E5%B0%8F%E8%AA%AC%E3%82%B3%E3%83%B3%E3%83%86%E3%82%B9%E3%83%88%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: 'Web小説投稿サイト「カクヨム」上のコンテスト。部門が多数（異世界、現代、恋愛、ホラー等）。読者評価も選考に影響。Web連載のノウハウが活きる。書籍化・コミカライズへの直結ルート。'
    },

    // ========== 地方・その他 ==========
    {
        id: 'oda_saku',
        name: '織田作之助賞',
        organizer: '大阪文学振興会',
        genre: '純文学',
        pageLimit: { min: 50, max: 150 },
        charLimit: null,
        formatNote: '本文10万字以上（Web投稿型・文庫1冊分目安）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E7%B9%94%E7%94%B0%E4%BD%9C%E4%B9%8B%E5%8A%A9%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '大阪発の純文学賞。織田作之助の精神を継ぐ、庶民的で人間味ある作品が好まれる。関西弁の会話や大阪の風土を活かした作品が多い。青年部門もあり。'
    },
    {
        id: 'izu',
        name: '伊豆文学賞',
        organizer: '静岡県',
        genre: '純文学/エンタメ',
        pageLimit: { min: 30, max: 50 },
        charLimit: null,
        formatNote: '小説:400字詰換算30〜80枚 随筆:20〜40枚（A4 30字×40行推奨）',
        editorFormat: { charsPerLine: 30, linesPerPage: 40 },
        deadlineMonth: 10,
        deadlineNote: '例年10月初旬必着',
        prize: '最優秀賞100万円',
        url: 'https://www.google.com/search?q=%E4%BC%8A%E8%B1%86%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '静岡県主催。伊豆を舞台にした、または伊豆に関連する作品が対象。紀行文的な要素と文学性の融合。旅情と人間ドラマを絡めた作品が強い。賞金100万円は地方賞としては高額。'
    },
    {
        id: 'uchida_hyakken',
        name: '内田百閒文学賞',
        organizer: '岡山市',
        genre: '純文学/随筆',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 2000, max: 5000 },
        formatNote: '400字詰換算50枚以内（A4 20字×20行 14pt推奨）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日必着',
        prize: '大賞30万円',
        url: 'https://www.google.com/search?q=%E5%86%85%E7%94%B0%E7%99%BE%E9%96%92%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '岡山市主催。随筆・小説の短編。内田百閒の文学精神を継ぐ、ユーモアと機知に富んだ作品が評価される。短い作品で気軽に応募できる。'
    },
    {
        id: 'chiyoda',
        name: 'ちよだ文学賞',
        organizer: '千代田区',
        genre: '純文学/エンタメ',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 0, max: 8000 },
        formatNote: '40字×40行 A4 10〜30枚',
        editorFormat: { charsPerLine: 40, linesPerPage: 40 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日必着',
        prize: '大賞50万円',
        url: 'https://www.google.com/search?q=%E3%81%A1%E3%82%88%E3%81%A0%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '千代田区主催。短編が対象。都心の文学賞として都市生活を反映した作品も多い。気軽に応募できるエントリーレベルの賞。'
    },
    {
        id: 'minami_nihon',
        name: '南日本文学賞',
        organizer: '南日本新聞社',
        genre: '純文学',
        pageLimit: { min: 0, max: 50 },
        charLimit: null,
        formatNote: '400字詰換算50枚以内（A4 20字×20行 14pt推奨）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 7,
        deadlineNote: '例年7月末日消印有効',
        prize: '正賞＋副賞',
        url: 'https://www.google.com/search?q=%E5%8D%97%E6%97%A5%E6%9C%AC%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '鹿児島の地方文学賞。南九州の風土を活かした作品が好まれるが、テーマは自由。地方在住者にとってアクセスしやすい文学賞。'
    },
    {
        id: 'yugawara',
        name: '湯河原文学賞',
        organizer: '湯河原町',
        genre: '純文学/エンタメ',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 2000, max: 4000 },
        formatNote: '400字詰換算40〜80枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '最優秀賞20万円',
        url: 'https://www.google.com/search?q=%E6%B9%AF%E6%B2%B3%E5%8E%9F%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '温泉と文学の町・湯河原の地方賞。夏目漱石や国木田独歩ゆかりの地。短い作品で応募可能。新人にとって最初の一歩として最適。'
    },
    {
        id: 'kitaku_uchida',
        name: '北区内田康夫ミステリー文学賞',
        organizer: '東京都北区',
        genre: 'ミステリー',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 0, max: 8000 },
        formatNote: '400字詰換算30〜100枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '大賞50万円',
        url: 'https://www.google.com/search?q=%E5%8C%97%E5%8C%BA%E5%86%85%E7%94%B0%E5%BA%B7%E5%A4%AB%E3%83%9F%E3%82%B9%E3%83%86%E3%83%AA%E3%83%BC%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '東京都北区を舞台にしたミステリー短編。内田康夫の浅見光彦シリーズとの縁。地域密着型だが、ミステリーとしての質も求められる。短編ミステリーの練習に最適。'
    },
    {
        id: 'shogakukan_bunko',
        name: '小学館文庫小説賞',
        organizer: '小学館',
        genre: 'エンタメ',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算40〜80枚',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '大賞200万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E5%AD%A6%E9%A4%A8%E6%96%87%E5%BA%AB%E5%B0%8F%E8%AA%AC%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '文庫書き下ろし前提の新人賞。読者層が広い小学館文庫からの出版。幅広いジャンルのエンターテインメント。文庫で売れる作品＝テンポ良く読みやすい作品が有利。'
    },
    {
        id: 'shincho_mystery',
        name: '新潮ミステリー大賞',
        organizer: '新潮社',
        genre: 'ミステリー',
        pageLimit: { min: 250, max: 600 },
        charLimit: null,
        formatNote: '長編ミステリー',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日消印有効',
        prize: '賞金300万円',
        url: 'https://www.google.com/search?q=%E6%96%B0%E6%BD%AE%E3%83%9F%E3%82%B9%E3%83%86%E3%83%AA%E3%83%BC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '純文学の新潮社が主催するミステリー賞。文学性の高いミステリーや、ジャンルの枠を超えた作品が好まれる。他のミステリー賞とは一線を画す文芸色。'
    },
    {
        id: 'fukuyama',
        name: 'ばらのまち福山ミステリー文学新人賞',
        organizer: '福山市/島田荘司選',
        genre: 'ミステリー',
        pageLimit: { min: 200, max: 600 },
        charLimit: null,
        formatNote: '400字詰換算200〜500枚',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 6,
        deadlineNote: '例年6月末日消印有効',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=%E3%81%B0%E3%82%89%E3%81%AE%E3%81%BE%E3%81%A1%E7%A6%8F%E5%B1%B1%E3%83%9F%E3%82%B9%E3%83%86%E3%83%AA%E3%83%BC%E6%96%87%E5%AD%A6%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '島田荘司が選考する本格ミステリー賞。新本格ムーブメントの精神を継ぐ。大胆なトリックと論理的な謎解きが高く評価される。地方賞だが全国的に注目度が高い。'
    },
    {
        id: 'asahi_jidai',
        name: '朝日時代小説大賞',
        organizer: '朝日新聞出版',
        genre: 'エンタメ（時代）',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算100〜300枚程度（時代小説）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 9,
        deadlineNote: '例年9月末日消印有効',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E6%9C%9D%E6%97%A5%E6%99%82%E4%BB%A3%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '時代小説専門の新人賞。江戸時代を中心に、歴史に材を取ったエンターテインメント。時代考証の正確さとストーリーの面白さの両立が求められる。'
    },
    {
        id: 'shueisha_ln',
        name: 'ダッシュエックス文庫新人賞',
        organizer: '集英社',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜130枚程度',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 4,
        deadlineNote: '例年4月末日・10月末日の年2回',
        prize: '大賞200万円',
        url: 'https://www.google.com/search?q=%E3%83%80%E3%83%83%E3%82%B7%E3%83%A5%E3%82%A8%E3%83%83%E3%82%AF%E3%82%B9%E6%96%87%E5%BA%AB%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [
            { year: 2024, title: 'N/A', author: '未発表' },
            { year: 2023, title: 'N/A', author: '未発表' },
        ],
        analysis: '集英社のライトノベルレーベル。少年ジャンプ系のバトルアクションからラブコメまで。集英社のメディアミックス力を活かした展開が期待できる。'
    },

    // ========== Web検索で発見した追加賞 ==========
    {
        id: 'jump_novel',
        name: 'ジャンプ小説新人賞',
        organizer: '集英社',
        genre: 'エンタメ',
        pageLimit: { min: 10, max: 30 },
        charLimit: null,
        formatNote: '40字×32行 10〜30枚（テーマ部門とフリー部門あり）',
        editorFormat: { charsPerLine: 40, linesPerPage: 32 },
        deadlineMonth: 7,
        deadlineNote: '例年7月末日必着',
        prize: '金賞50万円',
        url: 'https://www.google.com/search?q=%E3%82%B8%E3%83%A3%E3%83%B3%E3%83%97%E5%B0%8F%E8%AA%AC%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: 'ジャンプノベル部門。10〜30枚の中編。テーマ部門とフリー部門あり。ジャンプ系のキャラクター性とストーリーの勢いが重視される。'
    },
    {
        id: 'shueisha_ln_king',
        name: '集英社ライトノベル新人賞（王道部門）',
        organizer: '集英社',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜130枚（銀賞以上は原則出版）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 8,
        deadlineNote: '例年8月25日必着',
        prize: '大賞300万円',
        url: 'https://www.google.com/search?q=%E9%9B%86%E8%8B%B1%E7%A4%BE%E3%83%A9%E3%82%A4%E3%83%88%E3%83%8E%E3%83%99%E3%83%AB%E6%96%B0%E4%BA%BA%E8%B3%9E%EF%BC%88%E7%8E%8B%E9%81%93%E9%83%A8%E9%96%80%EF%BC%89%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: 'ジャンルフリーの王道ライトノベル。銀賞以上は原則出版。ジャンル部門（指定テーマ）もあり。集英社の販売力と映像化への展開が魅力。'
    },
    {
        id: 'kodansha_ln',
        name: '講談社ラノベ文庫新人賞',
        organizer: '講談社',
        genre: 'ライトノベル',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜130枚（評価シート送付あり）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 11,
        deadlineNote: '例年11月10日必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E8%AC%9B%E8%AB%87%E7%A4%BE%E3%83%A9%E3%83%8E%E3%83%99%E6%96%87%E5%BA%AB%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '講談社のライトノベルレーベル。1次通過以上に評価シート送付、2次通過以上に担当編集者がつく丁寧な育成型。'
    },
    {
        id: 'piccoma',
        name: 'ピッコマノベルズ大賞',
        organizer: 'カカオピッコマ',
        genre: 'Web小説',
        pageLimit: { min: 0, max: 0 },
        charLimit: { min: 60000, max: 0 },
        formatNote: '6万字以上の連載作品（Web投稿型）',
        editorFormat: { charsPerLine: 0, linesPerPage: 0 },
        deadlineMonth: 7,
        deadlineNote: '例年7月頃（Web投稿型）',
        prize: '年間最優秀賞1000万円',
        url: 'https://www.google.com/search?q=%E3%83%94%E3%83%83%E3%82%B3%E3%83%9E%E3%83%8E%E3%83%99%E3%83%AB%E3%82%BA%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: 'Web漫画プラットフォームのノベル部門。6万文字以上の連載作品。SMARTOON化（縦読みコミック化）とピッコマ連載が確約される。賞金1000万円は業界最高クラス。'
    },
    {
        id: 'gifu',
        name: '小島信夫記念ぎふ文学賞',
        organizer: '岐阜県文化財団',
        genre: '純文学',
        pageLimit: { min: 100, max: 300 },
        charLimit: null,
        formatNote: '6万字以上の連載作品（Web投稿型）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 7,
        deadlineNote: '例年7月末日必着（応募料2,000円）',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E5%B3%B6%E4%BF%A1%E5%A4%AB%E8%A8%98%E5%BF%B5%E3%81%8E%E3%81%B5%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '岐阜県の文化財団主催。応募料2,000円が必要な珍しい賞。100〜300枚と幅広い。地方文学賞だが賞金100万円と高額。全国から応募可能。'
    },
    {
        id: 'kappa',
        name: 'カッパ・ノベルス新人賞（光文文化財団文学賞）',
        organizer: '光文文化財団',
        genre: 'ミステリー',
        pageLimit: { min: 350, max: 600 },
        charLimit: null,
        formatNote: '400字詰換算350〜600枚（広義のミステリー長編）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 4,
        deadlineNote: '例年4月10日消印有効',
        prize: '賞金500万円',
        url: 'https://www.google.com/search?q=%E3%82%AB%E3%83%83%E3%83%91%E3%83%BB%E3%83%8E%E3%83%99%E3%83%AB%E3%82%B9%E6%96%B0%E4%BA%BA%E8%B3%9E%EF%BC%88%E5%85%89%E6%96%87%E6%96%87%E5%8C%96%E8%B2%A1%E5%9B%A3%E6%96%87%E5%AD%A6%E8%B3%9E%EF%BC%89%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '広義のミステリーが対象。賞金500万円は江戸川乱歩賞に次ぐ高額。カッパ・ノベルスの伝統を継ぐ新しい賞。長編限定。'
    },
    {
        id: 'katsushika',
        name: 'かつしか文学賞',
        organizer: '東京都葛飾区',
        genre: 'エンタメ',
        pageLimit: { min: 10, max: 100 },
        charLimit: null,
        formatNote: '400字詰換算10〜100枚（葛飾らしさ必須）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 10,
        deadlineNote: '例年10月初旬必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E3%81%8B%E3%81%A4%E3%81%97%E3%81%8B%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '「葛飾らしさ」を感じさせる小説が対象。賞金100万円は地方賞としては最高クラス。映像化・舞台化も視野に入れた選考。10〜100枚と幅広い。'
    },
    {
        id: 'kodansha_child',
        name: '講談社児童文学新人賞',
        organizer: '講談社',
        genre: '児童文学',
        pageLimit: { min: 10, max: 100 },
        charLimit: null,
        formatNote: '40字×30行 10〜100ページ（児童対象）',
        editorFormat: { charsPerLine: 40, linesPerPage: 30 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日必着',
        prize: '賞金50万円＋単行本化',
        url: 'https://www.google.com/search?q=%E8%AC%9B%E8%AB%87%E7%A4%BE%E5%85%90%E7%AB%A5%E6%96%87%E5%AD%A6%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '児童を読者対象とした作品。40字×30行で10〜100ページ。単行本刊行または雑誌掲載あり。児童文学のプロ作家への登竜門。'
    },
    {
        id: 'fujimi_novel',
        name: '富士見ノベル大賞',
        organizer: 'KADOKAWA/富士見書房',
        genre: 'エンタメ',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算200〜500枚（大人向けエンタメ）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 5,
        deadlineNote: '例年5月初旬必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E5%AF%8C%E5%A3%AB%E8%A6%8B%E3%83%8E%E3%83%99%E3%83%AB%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '大人向けのキャラクター小説、エンタメ全般を募集。ファンタジア文庫とは別ライン。ジャンル不問で「大人が楽しめる」がキーワード。'
    },
    {
        id: 'kadokawa_chara',
        name: '角川文庫キャラクター小説大賞',
        organizer: 'KADOKAWA',
        genre: 'エンタメ',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算200〜500枚（キャラクター小説）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 5,
        deadlineNote: '例年5月末日必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E8%A7%92%E5%B7%9D%E6%96%87%E5%BA%AB%E3%82%AD%E3%83%A3%E3%83%A9%E3%82%AF%E3%82%BF%E3%83%BC%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '魅力的なキャラクターが活躍するエンタメ小説。ジャンル不問。角川文庫から出版されるためリーチが広い。映像化も視野に。'
    },
    {
        id: 'mirai_bunko',
        name: '集英社みらい文庫大賞',
        organizer: '集英社',
        genre: '児童文学',
        pageLimit: { min: 50, max: 100 },
        charLimit: null,
        formatNote: '50〜100枚程度（小中学生向けエンタメ）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 1,
        deadlineNote: '例年1月末日必着',
        prize: 'デビュー確約',
        url: 'https://www.google.com/search?q=%E9%9B%86%E8%8B%B1%E7%A4%BE%E3%81%BF%E3%82%89%E3%81%84%E6%96%87%E5%BA%AB%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '大賞受賞者はデビューが確約される。小中学生向けのエンタメ小説。複数作品の応募も可能。結果発表が早い（約3ヶ月）。'
    },
    {
        id: 'mystery_taisho',
        name: '日本ミステリー文学大賞新人賞',
        organizer: '光文文化財団',
        genre: 'ミステリー',
        pageLimit: { min: 350, max: 600 },
        charLimit: null,
        formatNote: '400字詰換算350〜600枚（広義のミステリー長編）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 4,
        deadlineNote: '例年4月10日消印有効',
        prize: '賞金500万円',
        url: 'https://www.google.com/search?q=%E6%97%A5%E6%9C%AC%E3%83%9F%E3%82%B9%E3%83%86%E3%83%AA%E3%83%BC%E6%96%87%E5%AD%A6%E5%A4%A7%E8%B3%9E%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '広義のミステリーが対象。賞金500万円は乱歩賞と並ぶ高額。長編限定。旧カッパ・ノベルス新人賞を引き継ぐ。'
    },
    {
        id: 'jump_horror',
        name: 'ジャンプホラー小説大賞',
        organizer: '集英社',
        genre: 'ホラー',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×32行 80〜130枚（ホラーノベル）',
        editorFormat: { charsPerLine: 40, linesPerPage: 32 },
        deadlineMonth: 5,
        deadlineNote: '例年5月末日必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E3%82%B8%E3%83%A3%E3%83%B3%E3%83%97%E3%83%9B%E3%83%A9%E3%83%BC%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: 'ジャンプ系ホラーノベル。集英社のホラーレーベルからの刊行。映像化展開も期待できる。若年層向けのモダンホラー。'
    },
    {
        id: 'bslog',
        name: 'ビーズログ小説大賞',
        organizer: 'KADOKAWA',
        genre: '女性向けラノベ',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜130枚（女性向けラノベ）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 5,
        deadlineNote: '例年5月末日必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E3%83%93%E3%83%BC%E3%82%BA%E3%83%AD%E3%82%B0%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '女性向けライトノベルの新人賞。乙女ゲーム、異世界転生（悪役令嬢系）、恋愛ファンタジーなどが主力。コミカライズ展開も活発。'
    },
    {
        id: 'beans',
        name: '角川ビーンズ小説大賞',
        organizer: 'KADOKAWA',
        genre: '女性向けラノベ',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜130枚（女性向けファンタジー）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 5,
        deadlineNote: '例年5月末日必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E8%A7%92%E5%B7%9D%E3%83%93%E3%83%BC%E3%83%B3%E3%82%BA%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '女性向けファンタジー・恋愛の名門レーベル。十二国記シリーズなどを輩出。華やかな世界観と魅力的な男性キャラクターが評価ポイント。'
    },
    {
        id: 'ruby',
        name: '角川ルビー小説大賞',
        organizer: 'KADOKAWA',
        genre: 'BL',
        pageLimit: { min: 80, max: 130 },
        charLimit: null,
        formatNote: '40字×34行 80〜130枚（BL小説）',
        editorFormat: { charsPerLine: 40, linesPerPage: 34 },
        deadlineMonth: 3,
        deadlineNote: '例年3月末日必着',
        prize: '大賞100万円',
        url: 'https://www.google.com/search?q=%E8%A7%92%E5%B7%9D%E3%83%AB%E3%83%93%E3%83%BC%E5%B0%8F%E8%AA%AC%E5%A4%A7%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: 'BL（ボーイズラブ）小説の新人賞。全員にA〜Eの評価付き選評がWeb上で発表される。BLジャンルとしては最大規模の公募。'
    },
    {
        id: 'tsubasa',
        name: '角川つばさ文庫小説賞',
        organizer: 'KADOKAWA',
        genre: '児童文学',
        pageLimit: { min: 65, max: 85 },
        charLimit: null,
        formatNote: '原稿用紙換算65〜85ページ（小4〜5年生対象）',
        editorFormat: { charsPerLine: 40, linesPerPage: 30 },
        deadlineMonth: 8,
        deadlineNote: '例年8月末日消印有効（7月〜8月受付）',
        prize: '大賞50万円',
        url: 'https://www.google.com/search?q=%E8%A7%92%E5%B7%9D%E3%81%A4%E3%81%B0%E3%81%95%E6%96%87%E5%BA%AB%E5%B0%8F%E8%AA%AC%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '小学4〜5年生が読めるエンターテインメント作品。つばさ文庫から出版。児童書としてのわかりやすさとワクワク感が重要。'
    },
    {
        id: 'tanpen',
        name: '短編小説新人賞',
        organizer: '各社',
        genre: 'エンタメ/純文学',
        pageLimit: { min: 10, max: 30 },
        charLimit: null,
        formatNote: '400字詰換算10〜30枚（短編特化）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 0,
        deadlineNote: '通年募集（各回ごとに締切あり）',
        prize: '賞金20万円',
        url: 'https://www.google.com/search?q=%E7%9F%AD%E7%B7%A8%E5%B0%8F%E8%AA%AC%E6%96%B0%E4%BA%BA%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '短編に特化した賞。10〜30枚と気軽に応募できる。受賞作はWeb掲載や電子書籍化の可能性。新人にとって実績作りに最適。'
    },
    {
        id: 'akita',
        name: 'ふるさと秋田文学賞',
        organizer: '秋田県',
        genre: '純文学/エンタメ',
        pageLimit: { min: 0, max: 50 },
        charLimit: null,
        formatNote: '400字詰換算50枚以内（秋田県が舞台・題材）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 7,
        deadlineNote: '例年7月中旬必着',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E3%81%B5%E3%82%8B%E3%81%95%E3%81%A8%E7%A7%8B%E7%94%B0%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '秋田県を舞台または題材とした小説。50枚以内。賞金50万円と地方賞としては高額。地域に根ざした文学の推進。'
    },
    {
        id: 'iwate',
        name: '岩手日報文学賞',
        organizer: '岩手日報社',
        genre: '純文学/エンタメ',
        pageLimit: { min: 0, max: 80 },
        charLimit: null,
        formatNote: '400字詰換算80枚以内（岩手に関する要素必須）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 12,
        deadlineNote: '例年12月末日必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E5%B2%A9%E6%89%8B%E6%97%A5%E5%A0%B1%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '岩手に関する要素が応募条件。80枚以内。賞金100万円は地方賞としては破格。受賞作は新聞連載予定。創刊150周年記念で開催。'
    },
    {
        id: 'ogawa_mimei',
        name: '小川未明文学賞',
        organizer: '上越市',
        genre: '児童文学',
        pageLimit: { min: 60, max: 120 },
        charLimit: null,
        formatNote: '400字詰換算60〜120枚（長編児童文学）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 10,
        deadlineNote: '例年10月末日必着',
        prize: '賞金100万円',
        url: 'https://www.google.com/search?q=%E5%B0%8F%E5%B7%9D%E6%9C%AA%E6%98%8E%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '児童文学の名門賞。小川未明の名を冠する。長編児童向け小説60〜120枚。賞金100万円。受賞作は書籍化。'
    },
    {
        id: 'rekishi_roman',
        name: '歴史浪漫文学賞',
        organizer: '各社',
        genre: 'エンタメ（時代）',
        pageLimit: { min: 200, max: 500 },
        charLimit: null,
        formatNote: '400字詰換算200〜500枚（日本歴史小説）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 10,
        deadlineNote: '例年10月末日必着',
        prize: '賞金50万円',
        url: 'https://www.google.com/search?q=%E6%AD%B4%E5%8F%B2%E6%B5%AA%E6%BC%AB%E6%96%87%E5%AD%A6%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: '日本の歴史を題材にした小説。時代考証の正確さとドラマ性の両立。歴史小説ファンへの登竜門。'
    },
    {
        id: 'hanashobu',
        name: 'ハナショウブ小説賞',
        organizer: 'ハナショウブ',
        genre: 'エンタメ',
        pageLimit: { min: 30, max: 80 },
        charLimit: null,
        formatNote: '400字詰換算30〜80枚（テーマ部門あり）',
        editorFormat: { charsPerLine: 20, linesPerPage: 20 },
        deadlineMonth: 11,
        deadlineNote: '例年11月中旬必着',
        prize: '大賞30万円',
        url: 'https://www.google.com/search?q=%E3%83%8F%E3%83%8A%E3%82%B7%E3%83%A7%E3%82%A6%E3%83%96%E5%B0%8F%E8%AA%AC%E8%B3%9E%20%E5%BF%9C%E5%8B%9F%E8%A6%81%E9%A0%85',
        recentWinners: [],
        analysis: 'テーマ部門あり（2025年は「SNS」）。恋愛、ミステリー、ファンタジー、コメディなどジャンル不問。比較的新しい賞だが注目度上昇中。'
    }
];

// 枚数計算基準の自動分類
// '400-page': 400字詰原稿用紙換算（大半の文学賞）
// 'format-page': 指定レイアウトでのページ数（ラノベ系、一部エンタメ系）
// 'char-count': 文字数指定（Web小説系、ショートショート系）
const FORMAT_PAGE_PRIZES = new Set([
    'matsumoto', 'subaru_novel', 'mephisto', 'edogawa', 'yokomizo',
    'shosetsu_gendai', 'konomys', 'ayukawa', 'sogen_sf',
    'dengeki', 'ga_bunko', 'mf_bunko', 'fantasia', 'sneaker',
    'gagaga', 'hj_novel', 'overlap', 'shueisha_ln', 'jump_novel',
    'shueisha_ln_king', 'kodansha_ln', 'jump_horror', 'bslog',
    'beans', 'ruby', 'tsubasa', 'kodansha_child', 'shogakukan_bunko',
    'chiyoda'
]);

literaryPrizes.forEach(p => {
    if (p.charLimit && p.pageLimit && p.pageLimit.min === 0 && p.pageLimit.max === 0) {
        p.pageCountBasis = 'char-count';
    } else if (FORMAT_PAGE_PRIZES.has(p.id)) {
        p.pageCountBasis = 'format-page';
    } else {
        p.pageCountBasis = '400-page';
    }
});

// ジャンル一覧を自動生成
export const GENRES = [...new Set(literaryPrizes.map(p => p.genre))];

// ヘルパー: 次の締切を計算
export const getNextDeadlineInfo = (prize, referenceDate = new Date()) => {
    const now = new Date(referenceDate);
    now.setHours(0, 0, 0, 0);

    if (prize.confirmedDeadline) {
        const confirmed = new Date(`${prize.confirmedDeadline}T23:59:59`);
        if (confirmed >= now) {
            return { date: confirmed, dateString: prize.confirmedDeadline, isEstimated: false, sourceStatus: 'official' };
        }
    }

    if (prize.deadlineMonth === 0) return null; // 通年応募
    const month = Number(prize.deadlineMonth);
    if (!month) return null;
    const day = Number(prize.estimatedDeadlineDay || 28);
    let year = now.getFullYear();
    let candidate = new Date(year, month - 1, day, 23, 59, 59);
    if (candidate < now) {
        year += 1;
        candidate = new Date(year, month - 1, day, 23, 59, 59);
    }
    const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { date: candidate, dateString, isEstimated: true, sourceStatus: 'estimated' };
};

export const getNextDeadline = (prize) => {
    return getNextDeadlineInfo(prize)?.date || null;
};

export const getFollowingDeadlineInfo = (prize, referenceDate = new Date()) => {
    const next = getNextDeadlineInfo(prize, referenceDate);
    if (!next) return null;
    const afterNext = new Date(next.date);
    afterNext.setDate(afterNext.getDate() + 1);
    return getNextDeadlineInfo(prize, afterNext);
};

export const refreshKnownPrizeDeadlines = (submissions, referenceDate = new Date()) => {
    const correctedIds = new Set(['yasei', 'matsumoto']);
    return (submissions || []).map(item => {
        if (!correctedIds.has(item.prizeId) || item.deadlineIsEstimated === false || item.deadlineSelection === 'chosen') return item;
        const prize = literaryPrizes.find(candidate => candidate.id === item.prizeId);
        const info = prize ? getNextDeadlineInfo(prize, referenceDate) : null;
        if (!info) return item;
        // 旧バージョンで保存された「翌年の回」には deadlineSelection がない。
        // 次回締切より後の年を明示している場合は、補正対象にせず選択を守る。
        const selectedYear = Number(String(item.deadline || '').slice(0, 4));
        const nextYear = Number(info.dateString.slice(0, 4));
        if (selectedYear > nextYear) return { ...item, deadlineSelection: 'chosen' };
        return { ...item, deadline: info.dateString, deadlineIsEstimated: info.isEstimated };
    });
};

// ヘルパー: 締切までの日数
export const getDaysUntilDeadline = (prize) => {
    const deadline = getNextDeadline(prize);
    if (!deadline) return null;
    const now = new Date();
    const diff = deadline - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export default literaryPrizes;
