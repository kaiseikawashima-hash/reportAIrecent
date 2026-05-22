# CLAUDE.md — sns-report-app

## プロジェクト概要

Instagram運用代行チーム向けの月次レポート自動生成アプリ。
Excelデータ（数値）＋スクショ画像（投稿サムネイル）をアップロードするとAIが考察・施策を生成し、Markdownでコピーできる。

### 入力データの役割分担
| データ種別 | 入力方法 | 用途 |
|---|---|---|
| 数値データ全般 | Excelファイル | サマリー・フォロワー・リーチ・アカウント分析 |
| 投稿サムネイル画像 | スクショ（複数枚） | フィードTOP3・ワースト3の内容分析 |

※ 現行アプリにあったスクショからのAI数値読み取りは廃止。数値はすべてExcelから取得する。

---

## 技術スタック

- **フロントエンド**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **データベース**: Supabase（既存プロジェクト `sfgunchibzhtpsaldffu` を使用）
- **AI**: Google Gemini API（gemini-2.5-flash）
- **デプロイ**: Vercel

---

## ディレクトリ構成

```
sns-report-app/
├── app/
│   ├── page.tsx                  # レポート生成画面（メイン）
│   ├── admin/
│   │   ├── page.tsx              # 管理画面（クライアント・FMT管理）
│   │   └── knowledge/
│   │       ├── page.tsx          # ナレッジDB一覧画面
│   │       └── import/
│   │           └── page.tsx      # 過去レポート手動登録画面
│   └── api/
│       ├── parse-excel/
│       │   └── route.ts          # ExcelParseAgent
│       ├── calc-diff/
│       │   └── route.ts          # DiffCalcAgent
│       ├── knowledge/
│       │   └── route.ts          # KnowledgeDBAgent
│       ├── master-fmt/
│       │   ├── route.ts          # アクティブFMT取得/新版登録
│       │   └── list/
│       │       └── route.ts      # 全バージョン一覧（手動登録画面用）
│       ├── generate-report/
│       │   └── route.ts          # ReportGenerateAgent
│       └── scrape-hp/
│           └── route.ts          # HP読み取り（クライアント属性自動生成）
├── lib/
│   ├── supabase.ts               # Supabaseクライアント
│   ├── gemini.ts                 # Gemini APIクライアント
│   └── types.ts                  # 型定義
└── components/
    ├── ReportGenerator.tsx       # メイン生成UI
    ├── ClientSelector.tsx        # クライアント選択
    ├── ExcelUploader.tsx         # Excelアップロード（数値データ）
    ├── ScreenshotUploader.tsx    # スクショアップロード（投稿サムネイル画像）
    └── ReportOutput.tsx          # 生成結果表示
```

---

## Supabaseテーブル定義

実装前に以下のテーブルをSupabaseで作成すること。

```sql
-- クライアント属性
create table clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  area text,
  hp_url text,
  operator_memo text,       -- 担当者の感覚値メモ
  auto_memo text,           -- Gemini自動生成メモ（HP + 担当者メモをマージ）
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- マスターFMT
create table master_fmt (
  id uuid default gen_random_uuid() primary key,
  version integer not null default 1,
  content text not null,    -- FMTの中身（テキスト）
  is_active boolean default true,
  updated_at timestamp with time zone default now()
);

-- ナレッジDB
create table knowledge_base (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id),
  year_month text not null,         -- 例: "2026/03"
  fmt_version integer not null,     -- 生成時のFMTバージョン
  kpi_summary jsonb,                -- 数値サマリー（JSON）
  top_posts jsonb,                  -- TOP投稿情報（JSON）
  report_text text,                 -- 生成された考察テキスト全文
  quality_flag boolean,             -- NULL許容（将来の評価用）
  created_at timestamp with time zone default now()
);
```

---

## Agents（機能モジュール）の定義

このアプリは以下の5つのAgentで構成される。
各Agentは独立したAPIルートとして実装し、フェーズ2での社内アプリへの移植を容易にする。

---

### Agent 1: ExcelParseAgent
**ファイル**: `app/api/parse-excel/route.ts`

**役割**: アップロードされたExcelを読み込み、シートごとに構造化JSONへ変換する

**入力**: `.xlsx` ファイル（multipart/form-data）

**出力**:
```typescript
{
  summary: {
    follower: number,
    view: number,
    reach: number,
    engagement: number,
    post_count: number,
  },
  monthly_trends: Array<{
    year_month: string,
    follower: number,
    view_total: number,
    view_reel: number,
    view_feed: number,
    reach_total: number,
    engagement_total: number,
  }>,
  feed_ranking: Array<{
    rank: number,
    title: string,
    reach: number,
    engagement: number,
    eng_rate: string,
    url: string,
  }>,
  reel_ranking: Array<{
    rank: number,
    title: string,
    reach: number,
    engagement: number,
    eng_rate: string,
    url: string,
  }>,
  feed_posts: Array<{
    title: string,
    post_date: string,
    view: number,
    reach: number,
    engagement: number,
    eng_rate: number,
    likes: number,
    saves: number,
  }>,
  reel_posts: Array<same as feed_posts>,
  demographics: {
    age_gender: Array<{ age: string, male: number, female: number, total: number }>,
    prefectures: Array<{ name: string, value: number, ratio: string }>,
    cities: Array<{ name: string, value: number, ratio: string }>,
  },
  target_month: string,   // Excelから自動判定（例: "2026/03"）
}
```

**実装メモ**:
- `xlsx` ライブラリを使用（`npm install xlsx`）+ `cellDates: true` で読み込み
- シート名は **部分一致** で解決（`findSheetByPartialName` で「推移」「年齢」「都道府県」等のキーワード検索）
- 投稿タイトルは先頭の『』で囲まれた部分だけ抽出する
- 列レイアウトのズレに耐えるため、固定列インデックスは使わずヘッダー文字列をキーワードマッチして列番号を解決する（`detectHeader` / `findCol` / `findColAll`）
  - 実Excelに「No./順位」のような連番インデックス列が左端に1列入っているケースに対応
  - 該当ヘッダーが見つからない場合は先頭データ行を検査して非数値セルを名称列に推定するフォールバックあり
  - target_month / year_month は `formatYearMonth` で Date オブジェクト・Excelシリアル日付・"YYYY/MM"・"YYYY-MM"・"YYYY年M月" を `YYYY/MM` に正規化
- 投稿ランキングは `投稿URL` 等を タイトル と取り違えないよう、URL／リンク／permalink 列を先に解決する
- target_monthは `ホーム-推移データ` シートの最終行の月を使う（昇順ソート後の末尾）

---

### Agent 2: DiffCalcAgent
**ファイル**: `app/api/calc-diff/route.ts`

**役割**: ExcelParseAgentの出力から前月比・3ヶ月トレンドを計算し、AIに渡せる差分コンテキストを生成する

**入力**: ExcelParseAgentの出力JSON

**出力**:
```typescript
{
  current_month: string,           // "2026/03"
  prev_month: string,              // "2026/02"
  kpi_diff: {
    view: { current: number, prev: number, diff_rate: string, trend: string },
    reach: { current: number, prev: number, diff_rate: string, trend: string },
    follower: { current: number, prev: number, diff_rate: string, trend: string },
    engagement: { current: number, prev: number, diff_rate: string, trend: string },
  },
  // 例: { current: 2184, prev: 2660, diff_rate: "-18%", trend: "3ヶ月連続下降" }
  top_feed: { title: string, eng_rate: string },
  top_reel: { title: string, eng_rate: string },
  worst_feed: { title: string, eng_rate: string },
  demographics_summary: string,    // "35-54歳中心、青森県64%" 等の要約テキスト
}
```

**実装メモ**:
- trendは直近3ヶ月のmonthly_trendsを見て「上昇 / 下降 / 横ばい」を判定
- diff_rateは `((current - prev) / prev * 100).toFixed(1) + "%"` の形式

---

### Agent 3: KnowledgeDBAgent
**ファイル**: `app/api/knowledge/route.ts`

**役割**: Supabaseへの過去レポート保存・参照を担当する

**GET（参照）**:
```
クエリパラメータ:
  client_id: string
  limit_same: number    // 同クライアント参照件数（デフォルト6）
  limit_random: number  // 他社ランダム参照件数（デフォルト4）
```

**参照ロジック**:
```typescript
// 同クライアントの直近N件
const sameClient = await supabase
  .from('knowledge_base')
  .select('*')
  .eq('client_id', client_id)
  .order('year_month', { ascending: false })
  .limit(limit_same);

// 他クライアントのランダムN件
const others = await supabase
  .from('knowledge_base')
  .select('*')
  .neq('client_id', client_id)
  .order('created_at', { ascending: false })
  .limit(50);  // 多めに取得してからランダムにN件選ぶ

// othersからランダムにlimit_random件選ぶ
const randomOthers = others.data
  .sort(() => Math.random() - 0.5)
  .slice(0, limit_random);
```

**POST（保存）**:
```
生成完了後に自動でknowledge_baseに保存する
保存するのは: client_id, year_month, fmt_version, kpi_summary, top_posts, report_text
```

---

### Agent 4: ReportGenerateAgent
**ファイル**: `app/api/generate-report/route.ts`

**役割**: 差分コンテキスト・ナレッジ・マスターFMTをGeminiに投げて4段階順次生成する

**入力**:
```typescript
{
  client_id: string,
  diff_context: DiffCalcAgentの出力,
  knowledge_refs: KnowledgeDBAgentの出力,
  operator_memo?: string,    // 担当者メモ（任意）
  excel_raw: ExcelParseAgentの出力,  // 詳細データ用
}
```

**生成の順番（必ずこの順で逐次実行）**:
```
1. サマリーセクション生成
2. フォロワー分析セクション生成（1の結果を文脈に含める）
3. リーチ分析セクション生成（1,2の結果を文脈に含める）
4. アカウント分析セクション生成（1,2,3の結果を文脈に含める）
```

**プロンプト構造（各セクション共通）**:
```
[Layer 1] マスターFMT
{master_fmtのcontent}

[Layer 2] クライアント属性
会社名: {client.name}
エリア: {client.area}
特徴メモ: {client.auto_memo}

[Layer 3] 今月の構造化数値
{diff_contextの内容をテキスト形式で展開}

[Layer 4] 過去レポート参照（文体・施策の参考）
※ マスターFMTと矛盾する場合はマスターFMTを優先すること
{knowledge_refsのreport_textを列挙}

[Layer 5] 担当者メモ（任意）
{operator_memo}

[Layer 6] 投稿サムネイル画像（任意）
※ リーチ分析セクションのみ使用
※ アップロードされた場合はGemini Vision APIで画像を渡す
※ フィードTOP3・ワースト3の内容（テーマ・デザイン傾向）を考察に活かす

---
上記をもとに「{セクション名}」を生成してください。
```

**実装メモ**:
- ストリーミングレスポンスで返す（`ReadableStream`）
- 各セクション生成前に `--- {セクション名} 生成中 ---` のシグナルを送る
- エラー時は該当セクションをスキップして次に進む

---

### Agent 5: OutputAgent
**役割**: 生成結果の画面表示・Markdownコピー・DB自動保存を担当する

**実装場所**: `components/ReportOutput.tsx` + `app/api/knowledge/route.ts`（POST）

**処理**:
1. ストリーミングで受け取った結果をセクションごとにリアルタイム表示
2. 全セクション完了後に「Markdownをコピー」ボタンを活性化
3. 完了と同時にknowledge_base（Supabase）へ自動保存

---

## 画面構成

### メイン画面（`app/page.tsx`）
```
┌─────────────────────────────────────┐
│ クライアント選択（プルダウン）        │
│ Excelファイルアップロード            │
│ スクショアップロード                 │
│   └ フィードTOP3・ワースト3の        │
│     サムネイル画像（複数枚・任意）   │
│ 担当者メモ（テキストエリア・任意）    │
│                                     │
│ ［レポートを生成する］               │
├─────────────────────────────────────┤
│ ● サマリー 生成中...                │
│ ● フォロワー分析 待機中             │
│ ● リーチ分析 待機中                 │
│ ● アカウント分析 待機中             │
├─────────────────────────────────────┤
│ 生成結果（Markdownプレビュー）       │
│                                     │
│ ［Markdownをコピー］                │
└─────────────────────────────────────┘
```

### 管理画面（`app/admin/page.tsx`）
- クライアント一覧・登録・編集
- マスターFMT編集（バージョン管理付き）

### ナレッジDB画面（`app/admin/knowledge/page.tsx`）
- 過去レポート一覧（クライアント・年月でフィルタ）
- ベストプラクティス登録／解除（`best_practices` テーブル）
- ヘッダーから `/admin/knowledge/import` への遷移ボタン

### 過去レポート手動登録画面（`app/admin/knowledge/import/page.tsx`）
- 運用開始時の過去レポート（正解データ）を `knowledge_base` へ手動投入する画面
- 入力: クライアント / 年月（YYYY/MM）/ FMTバージョン（`/api/master-fmt/list` から全バージョン取得・デフォルト最新）/ 考察テキスト（必須）/ KPIサマリー（任意・follower / reach / view / engagement / post_count）
- `POST /api/knowledge` を流用。`kpi_summary` は入力された項目のみ JSONB 化、`top_posts` は `{}` で INSERT
- 登録後は年月・考察・KPI欄をクリアして連続入力可能（クライアント・FMTは維持）

### 検証画面（`/admin/eval/*`）
本番（`/`）には影響を与えない、プロンプト改善 PDCA 用の検証スタック。詳細は `current-status.md` 参照。

| URL | 役割 |
|---|---|
| `/admin/eval` | トップ。`/generate` への導線を最上部、test-cases / prompts を下段 |
| `/admin/eval/generate` | **セクション単体生成（メイン導線）**。Excel 選択時に「読み取った数値の確認表」アコーディオン（target_month / summary / 月次推移 / フィード&リール TOP3 / 年齢・性別 / 都道府県 TOP10）を生成ボタン直上に表示。指定プロンプトで部分生成 → 直前月正解レポートと横並び比較 + デバッグ展開 |
| `/admin/eval/test-cases` | テストケース管理（クライアント × 対象月 × Excel × 正解レポート） |
| `/admin/eval/prompts` | プロンプト管理（セクション別タブ、版管理） |

**セクション単体生成（`/api/eval/generate-section`）の動作**:
1. `eval_prompt_versions` から指定された `prompt_version_id` のテンプレート取得
2. `master_fmt` から `is_active=true` の最新を取得（現在は v4 = 新FMT v1.6 相当）
3. `clients` から会社情報取得
4. 内部 fetch で `/api/parse-excel` → `/api/calc-diff`
5. `knowledge_base` から直前月（client_id + year_month "YYYY/MM"）の正解レポート取得（無ければ「（参照可能な過去レポートなし）」）
6. プレースホルダ（`{master_fmt}`/`{client_name}`/`{client_area}`/`{client_auto_memo}`/`{diff_text}`/`{detail_text}`/`{knowledge_text}`/`{operator_memo}`/`{previous_sections}`）を置換し Gemini 2.5 Flash に投げる
7. `eval_runs` に `status='generated'` で保存。`actual_references` に `filled_prompt`（置換後の最終プロンプト全文）を含む全コンテキストを記録
8. `knowledge_base` への自動保存は **行わない**（検証は本番ナレッジを汚さない）

**プロンプト v1.6**: フォロワー分析のみ `is_active=true`。他 3 セクションは `is_active=false`（Supabase 直編集で切り替え運用）。共通プロンプト本体・最終指示は v1 と同じで、改善は新FMT.md 側で吸収する設計。

---

## 環境変数（.env.local）

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
APP_PASSWORD=          # 簡易認証用（任意）
```

---

## 実装の優先順位

```
Step 1: Supabaseテーブル作成
Step 2: ExcelParseAgent実装・動作確認
Step 3: DiffCalcAgent実装・動作確認
Step 4: マスターFMTをDBに登録
Step 5: KnowledgeDBAgent実装
Step 6: ReportGenerateAgent実装（プロンプト調整が核心）
Step 7: フロントエンド（UI）実装
Step 8: OutputAgent（自動保存）実装
Step 9: Vercelデプロイ
Step 10: 過去データ14ヶ月分をナレッジDBへ一括投入
```

---

## 注意事項

- Notion連携は不要。一切実装しない
- スクショは投稿サムネイル画像（フィードTOP3・ワースト3）の内容分析のみに使用する
- スクショから数値を読み取る処理は不要。数値はすべてExcelから取得する
- 各Agentは独立させること（フェーズ2での移植を容易にするため）
- fmt_versionは master_fmt テーブルの `version` カラムから取得する
- quality_flagは現時点ではNULLのまま保存し、将来の評価運用まで使わない
