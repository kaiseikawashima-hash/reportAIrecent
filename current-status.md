# レポートAIプロジェクト 現状把握レポート

調査日: 2026-05-21
対象: `C:\Users\fsp19\Desktop\sns-report-app`
Supabaseプロジェクト: `sfgunchibzhtpsaldffu`

---

## 1. マイグレーションの現状

`supabase/migrations/` 配下の全SQLファイル一覧:

| # | ファイル名 | 内容（1行説明） |
|---|---|---|
| 001 | `001_eval_tables.sql` | 検証用5テーブル（`eval_rubrics` / `eval_test_cases` / `eval_prompt_versions` / `eval_runs` / `eval_scores`）+ `updated_at` 自動更新トリガを作成 |
| 002 | `002_eval_rubrics_v1_seed.sql` | ルーブリック v1 を4軸（causality / specificity / actionability / format）投入 |
| 003 | `003_eval_prompts_v1_seed.sql` | 本番 `generate-report` と同等の v1 プロンプトを4セクション分（summary / follower / reach / account）投入 |
| 004 | `004_eval_reach_v1_no_reel.sql` | reach v1 プロンプトに「リール考察を生成しない」検証フェーズ限定の指示を末尾追記する UPDATE |
| 005 | `005_master_fmt_v2_seed.sql` | `master_fmt` に検証用 v2 を `is_active=false` で INSERT |

- 最新マイグレーション番号: **005**
- `README.md` の実行履歴では 004 / 005 が「⏳ 未実行」表記だが、後述する DB 状態を見る限り **両方とも実行済み**（README の表記が古い）

---

## 2. 検証用テーブルの現状

| テーブル | レコード数 | 主要カラム値 |
|---|---|---|
| `eval_rubrics` | 4 | v1 / `causality`「因果の妥当性」, `specificity`「原因仮説の具体性」, `actionability`「次月施策の実行可能性」, `format`「表記・簡潔性」（いずれも max_score=10, is_active=true） |
| `eval_test_cases` | 1 | name=`家計画_2026/3` / client_id=`9541f760-7279-4b79-8b0e-58f5b4901331` / target_month=`2026/03` / is_active=true（2026-04-29登録） |
| `eval_prompt_versions` | 4 | 全レコードが version_label=`v1`（section: account, follower, reach, summary）。reach のみ description に「+ 検証フェーズ用にリール考察を除外」が付与済（=004適用済） |
| `eval_runs` | 0 | （データなし） |
| `eval_scores` | 0 | （データなし） |

---

## 3. master_fmt の現状

| version | is_active | updated_at | content_length | content 冒頭 |
|---|---|---|---|---|
| 1 | false | 2026-04-12 | 601 | `■ 表記ルール\n・「。」は使わない\n・文末表現：〜である…` |
| 2 (※二重登録) | false | 2026-04-29 | 660 | `■表記ルール\r\n・「。」は使わない\r\n・文末表現…`（migration 005 投入分） |
| 2 (※二重登録) | false | 2026-05-20 | 4076 | `# 新FMT\n\nこのファイルは、レポート生成時に Claude が遵守すべき **マスターFMT** の本文…` |
| 3 | false | 2026-05-20 | 4076 | `# 新FMT\n\n…`（v2と同内容のまま再保存） |
| 4 | **true** | 2026-05-20 | 4058 | `# 新FMT\n\n…`（現行アクティブ） |

- **v1.6 は DB に存在しない**（`version` カラムは整数。v1〜v4 しか登録されていない）
- 現行アクティブは **v4**。`api/generate-report/route.ts` も `is_active=true` の最新を引くため、本番生成時は v4 の `# 新FMT` 本文が使われる
- v2 が **2件存在**（テーブル定義に `unique(version)` がないため）。migration 005 が投入した小さな v2 と、後日 admin 画面から保存された大きな v2 が共存

---

## 4. 検証用API・画面の実装状況

### `app/api/eval/` 配下
| ファイル | 役割（1行） |
|---|---|
| `prompts/route.ts` | プロンプトの GET（一覧, section/is_active フィルタ）と POST（新規作成。`(section, version_label)` ユニーク制約違反を 409 で返す） |
| `prompts/[id]/route.ts` | プロンプトの GET（単一） / PUT（template, description, is_active, reference_config の編集） / DELETE（ソフトデリート = is_active=false） |
| `test-cases/route.ts` | テストケースの GET（一覧, client_id/target_month/is_active フィルタ）と POST（Excelファイルを内部 `/api/parse-excel` + `/api/calc-diff` 経由で解析→Storage `eval-screenshots` に画像保存→DB INSERT） |
| `test-cases/[id]/route.ts` | テストケースの GET / PUT（JSON更新と multipart更新の両対応, スクショ差分削除） / DELETE（ソフトデリート） |

### `app/admin/eval/` 配下
| ファイル | 役割 |
|---|---|
| `page.tsx` | 検証機能トップ。テストケース件数とプロンプト件数を表示し、各管理ページへリンク。「Phase 3 以降で生成・評価機能を追加予定」と明示 |
| `prompts/page.tsx` | プロンプト管理画面。4セクションタブ + 一覧 + 新規/編集/複製/削除モーダル |
| `test-cases/page.tsx` | テストケース管理画面。client/月フィルタ + 一覧 + 新規/編集モーダル |

### `components/eval/` 配下
| ファイル | 役割 |
|---|---|
| `PromptList.tsx` | プロンプト一覧カード（プレビュー / 編集 / 複製 / 削除） |
| `PromptForm.tsx` | プロンプト編集モーダル（create / edit / preset複製。reference_config編集UI付き） |
| `TestCaseList.tsx` | テストケース一覧カード（正解レポート有無バッジ等） |
| `TestCaseForm.tsx` | テストケース編集モーダル（Excelアップ + スクショ追加/削除 + 各セクション正解レポート入力） |

### `lib/eval/` 配下
| ファイル | 役割 |
|---|---|
| `types.ts` | 検証機能の型定義（`EvalSection`, `EvalRubric`, `EvalTestCase`, `EvalPromptVersion`, `PromptReferenceConfig`, `DEFAULT_REFERENCE_CONFIG` 等） |

---

## 5. 既存（本番側）の構成確認

### `app/api/generate-report/route.ts` の処理フロー要約
1. `client_id`, `diff_context`, `knowledge_refs`, `operator_memo`, `excel_raw`, `screenshot_images?` を受け取る
2. `clients` から該当クライアントを取得（name, area, auto_memo, plan）
3. `master_fmt` から `is_active=true` の最新を取得 → これが Layer 1
4. `buildDiffContextText()` / `buildKnowledgeText()` で Layer 3 / Layer 4 のテキストを構築
5. `ReadableStream` で 4セクションを順次 Gemini に投げる
   - `summary` → `follower` → `reach` → `account` の固定順
   - 各セクションは「`buildPrompt()` を直接組み立てる」方式で、`eval_prompt_versions` テーブルは参照しない
   - 生成済みセクションは `previousSections` として次セクションに引き継ぐ
   - リーチ分析のみ `screenshot_images` を Gemini Vision に inlineData で添付
   - プランで TOP/ワースト件数を切替（advance: 3件 / standard: 1件）
6. 完了後 `<!--META:{ fmt_version, full_text }:META-->` をフッタに出力（フロントが DB 保存に使用）

### 「Agents」一覧（CLAUDE.md にある `lib/agents/` ではなく、API ルートとして実装されている）
**注: `lib/agents/` ディレクトリは存在しない**

| Agent | 実体 | 役割 |
|---|---|---|
| ExcelParseAgent | `app/api/parse-excel/route.ts` | Excel を `xlsx` で読み込み、summary / monthly_trends / feed_ranking / reel_ranking / feed_posts / reel_posts / demographics / target_month を JSON 化 |
| DiffCalcAgent | `app/api/calc-diff/route.ts` | 前月比・3ヶ月トレンド・worst_feed・demographics_summary を算出 |
| KnowledgeDBAgent | `app/api/knowledge/route.ts` (+ `knowledge/list/route.ts`) | GET=同クライアント直近6件 + 他社ランダム4件、POST=生成結果保存、list=全件一覧 |
| ReportGenerateAgent | `app/api/generate-report/route.ts` | 上述の4セクション順次生成 |
| OutputAgent | `components/ReportOutput.tsx` + `app/api/knowledge/route.ts` POST | ストリーミング表示 + `__META` 抽出 → ナレッジ自動保存 |
| BestPracticeAgent | `app/api/best-practices/route.ts` | quality_flag に代わるベストプラクティス登録/解除 (GET/POST/DELETE) |
| ClientAgent | `app/api/clients/route.ts` | クライアント GET/POST/PUT |
| MasterFmtAgent | `app/api/master-fmt/route.ts` | アクティブ FMT GET / 新版保存 POST（旧版を自動で is_active=false） |
| ScrapeHpAgent | `app/api/scrape-hp/route.ts` | HP HTML + 担当者メモから Gemini で auto_memo を自動生成 |

### 本番画面の構成
| URL | 役割 |
|---|---|
| `/` | `ReportGenerator` — クライアント選択 + Excel + スクショ + 担当者メモ → 4セクション順次生成 + Markdown コピー + ナレッジ自動保存 |
| `/admin` | クライアントCRUD（カード型一覧 + モーダル, プラン選択 + auto_memo 自動生成）+ マスターFMT編集（textarea + 新版保存） |
| `/admin/knowledge` | ナレッジDB一覧（client/月フィルタ + 展開表示 + ベストプラクティス登録/解除 + 登録理由プロンプト） |
| `/admin/eval` | 検証機能トップ（→ test-cases / prompts へ） |
| `/admin/eval/test-cases` | テストケース管理 |
| `/admin/eval/prompts` | プロンプト管理（セクション別タブ） |

---

## 6. 不整合・気になる点

### 6.1 ドキュメント vs 実装の乖離
- **`CLAUDE.md` が古い**: `lib/agents/` ディレクトリ前提で記述されているが、実体は `app/api/*/route.ts` のみ。`lib/agents/` フォルダは存在しない。
- **CLAUDE.md にない実装が複数**:
  - `best_practices` テーブル + `/api/best-practices` + ナレッジDB画面の星マーク（`todo.md` Step 8-b で追加）
  - `clients.plan` カラム + プラン分岐（`todo.md` Step 8-c）
  - `auto_memo` 自動生成 + `/api/scrape-hp`（Step 8-d）
  - 検証機能一式（Step 8-e）
- **マイグレーション README が古い**: 004/005 を ⏳ 未実行と表記しているが、DB 上は両方適用済み（reach v1 の description に「リール考察を除外」が入っており、v2 の `is_active=false` レコードも存在する）。

### 6.2 master_fmt 周りの異常
- **`version` カラムにユニーク制約がない** → 結果として **version=2 が DB に 2件**（migration 005 由来の 660字版と、5/20 に admin 画面から保存された 4076字版）が共存している。
- **「v1.6」は DB に存在しない**: `version` は integer 型で v1〜v4 のみ。「v1.6 が入っているか」という確認意図に対する答えは **NO**。現行アクティブは v4（4058字, `# 新FMT` で始まる本文, is_active=true）。
- 旧 v1 (601字) と migration 005 投入の v2 (660字) は内容が大きく異なる（v3/v4 は `# 新FMT` で始まる別系統の長文）。

### 6.3 検証機能の「分離」が中途半端
- `eval_prompt_versions` は本番プロンプトと同じ内容で v1 を保持しているが、**本番の `generate-report/route.ts` は `eval_prompt_versions` を一切参照していない**（`buildPrompt()` でハードコードしたテンプレートを使う）。
  - つまり管理画面でプロンプトを編集しても本番出力には反映されない。Phase 3 で「生成・評価機能」を作るときに、`eval_prompt_versions` を読んで生成するエンジンを別途用意する必要がある（現状そこは未実装）。
- `eval_runs` / `eval_scores` が空 = 生成・採点の API・画面は未実装（`/admin/eval` トップにも「Phase 3 以降で追加予定」と明記）。

### 6.4 reference_config の運用が未消化
- `eval_prompt_versions.reference_config` に `same_client_limit / other_client_limit / use_best_practice` を保持できる設計だが、現状参照する側（生成エンジン）が存在しない → 入れても効かないフィールドになっている。

### 6.5 `eval_test_cases` のスクショ仕様の食い違い
- `001_eval_tables.sql` では `input_screenshots text[]`（URL 配列）
- 実装側は Supabase Storage `eval-screenshots` バケットにアップロード → public URL を `text[]` に格納
- これは整合しているが、**バケット作成自体はマイグレーションに含まれていない**（手動で作成済み前提）。新環境で起動するときに引っかかる可能性あり。

### 6.6 細かい点
- `app/api/knowledge/route.ts` の他社レポート取得は「`limit(50)` してから JS で `Math.random()` シャッフル」。50件超になるとサンプリング偏りが出るが、現実的にはそこまで蓄積されていない見込み。
- `app/api/master-fmt/route.ts` の POST は「アクティブな最新の version + 1」で新版を作る。すでに version=4 が active なので、次に admin から保存すると v5 になる。**手動投入で穴が空くと**（v1 active 状態で v5 を手動 insert してから admin から保存、等）番号が飛ぶ可能性あり。
- `eval_prompt_versions.parent_version_id` は POST 時にしかセットされず、DELETE 時の整合性チェック（参照されている版は物理削除不可）は適用していない。現状ソフトデリートのみなので問題は表面化していない。
- `app/admin/eval/page.tsx` の件数取得は `is_active=true` のデフォルトのため、ソフトデリート済みのものは表示件数に乗らない。ユーザー期待と一致しているか要確認。

---

## 7. 2026-05-22 時点の差分（Phase 3.6 〜 3.7.1）

このセクションは初版（2026-05-21）以降の変更ポイントのみ。詳細な実装ノートは `todo.md` の Step 8-n / 8-o / 8-p / 8-q 参照。

### 7.1 マイグレーション
- `supabase/migrations/007_knowledge_base_excel_parsed.sql`（Supabase 適用済み、検証クエリ確認済み）
  - `knowledge_base.excel_parsed jsonb DEFAULT '{}'::jsonb` を追加
  - 既存2レコード（家計画 2026/02・2026/03）はデフォルト `{}` で初期化済み
- 番号 006 は既存の `eval_prompts_v16_seed.sql`、007 が今回追加分

### 7.2 テーブル現状（差分のみ）
- `knowledge_base` カラム: 既存8カラム + 新規 `excel_parsed jsonb` の計9カラム
- 全レコード: 依然として2件（家計画 2026/02, 2026/03）。両者とも `excel_parsed = '{}'` のまま（次回本番再生成時に正しい値が入る）
- `best_practices`: 0件のまま
- `eval_runs`: 7件（Phase 3 検証用の蓄積）

### 7.3 新規 API
| ルート | メソッド | 役割 |
|---|---|---|
| `/api/master-fmt/list` | GET | 全FMTバージョン降順返却（既存 `/api/master-fmt` は active 最新1件のみ） |
| `/api/knowledge/[id]` | DELETE | knowledge_base 物理削除（best_practices は ON DELETE CASCADE で連動） |

### 7.4 既存 API の仕様変更（後方互換あり）
- `/api/parse-excel`: シート別固定カラム読みに刷新。`ExcelSummary` に `view_reel/feed`, `reach_reel/feed`, `engagement_reel/feed`, `profile_access`, `link_clicks` を追加。`MonthlyTrend` を14列対応に拡張。`PostDetail` に `comments` 追加。`region.ratio` の 10倍誤補正バグを修正
- `/api/calc-diff`: 入力に `client_id?` と `target_month_override?` を追加。`client_id` 指定時は `knowledge_base` の前月 `kpi_summary` から前月比を計算。未指定なら旧 `monthly_trends` ベースの挙動を維持（後方互換）
- `/api/knowledge` POST: `excel_parsed` フィールドを受け入れ。`kpi_summary={}` / `top_posts={}` を許容（手動投入対応）
- `/api/eval/generate-section`: 参照ロジックを「同社6+他社4」から「前月レポ1+best_practices 1」に変更。`actual_references.reference_status` で参照成否＋理由を記録

### 7.5 新規画面・コンポーネント
- `app/admin/knowledge/import/page.tsx`: 過去レポート手動投入画面。「手動入力」「Excelアップロード」モード切替（後者は parse-excel 経由でパース確認表 + target_month/kpi_summary/excel_parsed 自動セット）
- `app/admin/eval/generate/page.tsx`: `ReferenceNotice` + `ReferenceBlock` 追加（参照状況バナーと2ブロック化）+ SummaryTable に comments/profile_access/link_clicks 行追加
- `app/admin/knowledge/page.tsx`: 各カードに削除ゴミ箱アイコン + 確認モーダル + 3秒トースト追加

### 7.6 新規 lib
- `lib/excel-to-kpi.ts`: `excelToKpiSummary(ExcelParseResult): KpiSummary`。性別比集計、年齢分布7バケット正規化、都道府県/市区町村TOP10、フィード/リール別平均、ENG率、各種合計値を生成
- `lib/types.ts`: `KpiSummary` / `KpiGenderRatio` / `KpiAgeDistribution` 型を追加。`KnowledgeBase` に `excel_parsed` フィールド追加

### 7.7 残課題
- 既存 `knowledge_base` 2件は壊れデータ（家計画 2026/03 view=0、両者 excel_parsed={}）。Phase 3.6.1 の削除機能 + 本番再生成で復旧予定
- `eval_test_cases` の `input_excel_data` も古いパース結果を保持。再アップロードで更新推奨
- `best_practices` 0件 → 検証側で常時「参照していません」表示。`/admin/knowledge` から★登録で解消
- Phase 3 検証機能（生成・採点・横並び比較）の Phase 3.5 以降は未着手（todo.md Step 8-k）
- RLS 全テーブル無効（Supabase Advisor 警告）— 別フェーズで検討
