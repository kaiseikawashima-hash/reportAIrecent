# SNSレポート生成アプリ - 進捗チェックリスト

## 直近のリリースノート（2026-05-21 〜 2026-05-22）

### Phase 3.6 — 検証側の参照ロジック「過去レポ1件＋表現ナレッジ1件」化
従来「同社過去6件＋他社ランダム4件 = 計10件」だった検証側の参照を、トークン削減目的で「直前月の正解レポート1件＋`best_practices` 1件 = 計2件」に変更。本番 `/api/generate-report` は無変更。
- 新規画面: `/admin/knowledge/import`（過去レポート手動投入）+ KPI任意入力（5項目）→ Step 8-m
- API: `/api/master-fmt/list`（FMTバージョン一覧）+ `/api/knowledge` POST が `kpi_summary={}` を許容
- 検証API: `/api/eval/generate-section` が前月 `knowledge_base` + 最新 `best_practices`（→紐づく `knowledge_base.report_text`）を取得。参照不能時は `actual_references.reference_status` に `referenced:false` + `reason` を記録 → Step 8-n
- 検証画面: 結果上部に `ReferenceNotice`（参照状況バナー）+ 右パネルを「直前月レポート / 表現ナレッジ」2ブロック化

### Phase 3.6.1 — ナレッジDB削除機能
`knowledge_base` の物理削除エンドポイントと、`/admin/knowledge` の各カードに赤色ゴミ箱アイコン + 確認モーダル + トーストを追加。`best_practices` は ON DELETE CASCADE 設定済みのため自動連動削除（DBレベル確認済み）。→ Step 8-o
- 新規API: `DELETE /api/knowledge/[id]`（404/500 ハンドリング）
- 既存 GET/POST、本番自動保存フローは無変更

### Phase 3.7 — DiffCalcAgent を knowledge_base 参照型に + kpi_summary 拡充
Excel に当月分のみが入る運用に変わったため、前月比は前月レコードの `kpi_summary` から取得する方式に変更。同時に各セクション考察用の詳細データを保存。→ Step 8-p
- マイグレーション 007: `knowledge_base.excel_parsed jsonb DEFAULT '{}'`（Supabase 適用済み）
- 新ヘルパー: `lib/excel-to-kpi.ts`（性別比 / 年齢分布 7バケット / 都道府県・市区町村 TOP10 / フィード・リール別 reach/view 平均・本数 / ENG率 / コメント・プロフィールアクセス・リンククリック）
- `calc-diff`: `client_id + target_month_override` を受け取り、前月レコードなし → `N/A` + "データ不足（前月レコードなし）"、部分入力 → `"データ不足（前月の{key}未保存）"` のフォールバック付き
- 呼び出し側: `ReportGenerator.tsx` と `/api/eval/generate-section` から `client_id` を渡すよう更新
- 本番自動保存: `excelToKpiSummary(excelData)` + `excel_parsed: excelData` を送信
- 手動投入画面に「Excelアップロードモード」追加（パース確認表 + target_month / kpi_summary / excel_parsed 自動セット）

### Phase 3.7.1 — Excel パーサを Instagram AI Pro 固定構造に刷新
3.7 完了後、実Excelで `summary.view=0 / profile_access=0 / link_clicks=0 / feed_posts=[] / top_cities=[]` 等の致命的欠落が判明。キーワード検索を捨てて、シート別の固定カラム位置読みに全面リファクタ。→ Step 8-q
- パーサ完全書き直し: 全シートで固定 index 読み、`extractTitle` を ━ 区切り判定でボイラープレート（『残し続ける1ページ』など）混入を回避
- `MonthlyTrend` を14列対応に拡張（`reach_reel/feed`, `engagement_reel/feed`, `profile_access`, `link_clicks` 追加）
- `ExcelSummary` も推移データ当月行から内訳補完（`view_reel/feed`, `reach_reel/feed`, `engagement_reel/feed`, `profile_access`, `link_clicks`）
- `region.ratio` の 10倍誤補正バグを修正（Excel値はすでに％単位 → 文字列に "%" を付けるだけ）
- 検証: サンプルExcel（NOCOSU 2026/03）で `npx next start` 実機テスト 21/21 項目期待値一致

### 2026-06-02 — GitHub保存 + 削除APIのセキュリティ対応
未コミットだった全変更（Excel刷新・前月比・ナレッジDB拡充・セキュリティガイダンス設定）を GitHub にコミット＆プッシュ。あわせて、バックグラウンドのセキュリティレビューが検出した削除APIの脆弱性2件を修正。→ Step 8-r
- GitHub リポジトリ: `https://github.com/kaiseikawashima-hash/reportAIrecent`（既存リモートに push）
- 機密確認: `.env*` は `.gitignore` 済み、APIキー類は未追跡（GitHubに上がっていない）
- 認証追加: `DELETE /api/knowledge/[id]` は不可逆な破壊的操作のためサーバー側で `APP_PASSWORD` を必須化
- fail-open 対策: `APP_PASSWORD` 未設定時、本番は拒否・開発のみ素通り（`ALLOW_UNAUTHENTICATED=1` で明示オプトイン可）、比較は `timingSafeEqual`

### 既知の運用課題（次セッション以降で対応想定）
- `best_practices` レコードは現在 0 件 → 検証側で常に「⚠️ 表現ナレッジを参照していません」が表示される。`/admin/knowledge` から既存ナレッジを★登録すれば次回から拾われる
- `knowledge_base` の 家計画 2026/03 は Phase 3.5 のパーサバグ由来で `view=0` の壊れデータ。Phase 3.6.1 の削除機能で消して本番 `/` から再生成すれば、3.7.1 の新パーサで正しい `excel_parsed` 込みで保存される
- `eval_test_cases` 登録済みの「家計画 / 2026/3」も古いパース結果を持つため、Excel 再アップロードで `input_excel_data` を更新する必要あり
- Supabase Advisor から RLS 警告（11テーブル無効）— anon キーで全書き込み可能な状態。本セッションでは別件としてスコープ外

---

## 完了済み

- [x] Step 1: Supabaseテーブル作成
  - clients / master_fmt / knowledge_base の3テーブル作成
  - 旧テーブル7件（master_format, knowledge_db, industry_accounts, feed_analysis, reel_analysis, analysis_findings, kyouwa_monthly）を削除済み
- [x] Step 2: ExcelParseAgent実装
  - `app/api/parse-excel/route.ts`
  - xlsx読み込み → サマリー/月次推移/ランキング/投稿詳細/デモグラフィクスをJSON化
- [x] Step 3: DiffCalcAgent実装
  - `app/api/calc-diff/route.ts`
  - 前月比・3ヶ月トレンド計算、デモグラフィクス要約
- [x] Step 4: マスターFMTをDBに登録
  - v1をmaster_fmtテーブルにINSERT済み
- [x] Step 5: KnowledgeDBAgent実装
  - `app/api/knowledge/route.ts` (GET: 同クライアント6件+他社ランダム4件 / POST: 保存)
  - `app/api/knowledge/list/route.ts` (全件一覧)
- [x] Step 6: ReportGenerateAgent実装
  - `app/api/generate-report/route.ts`
  - 4セクション順次生成（サマリー→フォロワー→リーチ→アカウント）
  - 6層プロンプト構造、ストリーミングレスポンス、画像対応（リーチのみ）
- [x] Step 7: フロントエンドUI実装
  - メイン画面 `/` - ReportGenerator（Excel/スクショアップロード → 生成 → Markdownコピー）
  - 管理画面 `/admin` - クライアントCRUD + マスターFMT編集（バージョン管理）
  - ナレッジDB `/admin/knowledge` - 過去レポート一覧（フィルタ付き）
  - 追加API: `/api/clients`, `/api/master-fmt`
- [x] Step 8: OutputAgent実装
  - ReportGenerator.tsx内でメタデータ抽出 → knowledge_baseへ自動POST
- [x] Step 8-b: best_practicesテーブル追加（2026-04-14）
  - `knowledge_base.quality_flag` を廃止し、`best_practices` テーブルを新設
  - `app/api/best-practices/route.ts` (GET/POST/DELETE) 実装
  - ナレッジDB画面に「ベストプラクティスに登録 / 解除」ボタン・★バッジ・登録理由プロンプト追加
- [x] Step 8-c: clients.plan カラム追加（2026-04-14）
  - `plan text check (plan in ('standard','advance')) default 'advance'` を追加
  - 管理画面にプラン選択ラジオ（アドバンス/スタンダード）追加
  - ReportGenerateAgent のリーチ分析で分岐：
    - advance: フィード・リール各TOP3/ワースト3
    - standard: フィード・リール各TOP1/ワースト1
- [x] Step 8-d: 管理画面UI改善 + auto_memo自動生成（2026-04-15）
  - クライアント一覧をカード形式（1〜2列グリッド）に変更、各カードに「編集」ボタン
  - 新規追加・編集を共通モーダルフォームに統一
    （会社名・エリア・HP URL・担当者メモ・プラン選択・auto_memo）
  - `app/api/scrape-hp/route.ts` 新規実装
    - HPをfetch→HTMLストリップ→Geminiで「{強み}。{エリア}の{ターゲット}向け。{運用特徴}」形式に整形
    - HP取得失敗時は担当者メモ＋会社名から推測
  - モーダル内に「属性を自動生成」ボタン＋ローディング表示、生成結果は保存前に手修正可能
  - `POST /api/clients` が `auto_memo` を受け入れるよう拡張

- [x] Step 8-e: レポートAI検証機能 Phase 1 & 2 実装（2026-04-28）
  - **目的**: AI生成レポートの品質を客観評価する基盤づくり。本番アプリ（既存テーブル・API・画面）には一切影響を与えない設計
  - **Phase 1 — DB & 初期データ（要手動実行）**
    - `supabase/migrations/001_eval_tables.sql` — 5テーブル新規作成
      （`eval_rubrics` / `eval_test_cases` / `eval_prompt_versions` / `eval_runs` / `eval_scores`）
      - すべて接頭辞 `eval_` で命名、updated_at 自動更新トリガー付き
      - `eval_test_cases.client_id` のみ既存 `clients(id)` を外部キー参照（読み取り専用）
    - `supabase/migrations/002_eval_rubrics_v1_seed.sql` — ルーブリックv1の4軸投入
      （因果の妥当性 / 原因仮説の具体性 / 次月施策の実行可能性 / 表記・簡潔性、各10点満点）
    - `supabase/migrations/003_eval_prompts_v1_seed.sql` — 既存 `buildPrompt` を反映したv1×4セクション投入
      （summary / follower / reach / account、reach のみ Layer 6 の画像指示を含む）
    - `supabase/migrations/README.md` — 実行手順と完了確認SQL
  - **Phase 2 — API & 画面**
    - 型定義: `lib/eval/types.ts`
      （`EvalRubric` / `EvalTestCase` / `EvalPromptVersion` / `EvalSection` / `SECTION_LABELS` / `DEFAULT_REFERENCE_CONFIG`）
    - API（`/api/eval/*` 配下のみ追加、既存APIは無変更）
      - `app/api/eval/test-cases/route.ts` GET一覧 / POST作成
        （POSTは multipart/form-data で Excel受領 → 内部で `/api/parse-excel` + `/api/calc-diff` を呼んでJSON化 → INSERT）
      - `app/api/eval/test-cases/[id]/route.ts` GET / PUT / DELETE（ソフトデリート）
        - 編集可: `name`, `input_operator_memo`, `reference_*`, `notes`, `is_active`
        - 不変: `input_excel_data`, `input_diff_context`, `client_id`, `target_month`
      - `app/api/eval/prompts/route.ts` GET一覧 / POST作成（unique制約違反は409）
      - `app/api/eval/prompts/[id]/route.ts` GET / PUT / DELETE（ソフトデリート）
    - 画面（`/admin/eval/*` 配下のみ追加）
      - `app/admin/eval/page.tsx` — トップ（テストケース・プロンプト件数表示 + 2カードナビ）
      - `app/admin/eval/test-cases/page.tsx` — 一覧 + クライアント・対象月フィルタ + 新規追加/編集/削除
      - `app/admin/eval/prompts/page.tsx` — セクション別タブ + 一覧 + 「複製してv2作成」操作
    - コンポーネント
      - `components/eval/TestCaseForm.tsx` — 新規・編集兼用モーダル
        （Excelアップロード→自動パース→保存、正解レポート4セクション貼付欄、運用者名・メモ）
      - `components/eval/TestCaseList.tsx` — カード一覧
      - `components/eval/PromptForm.tsx` — 新規・編集兼用、複製時は `parent_version_id` にプリセット元IDセット
      - `components/eval/PromptList.tsx` — カード + 「本文を表示」モーダル
    - 既存への影響: `/admin` ヘッダーに「検証」リンクを1つ追加した以外、既存テーブル・API・画面は無変更
    - 検証: `npx tsc --noEmit` / `npx eslint` / `npx next build` すべて成功

- [x] Step 8-f: テストケースフォームに投稿サムネ画像のアップロード機能を追加（2026-04-29）
  - **目的**: リーチ分析セクションでGemini Visionに渡すフィードTOP3・ワースト3画像を、検証用テストケースでも保持できるようにする
  - **Supabase Storage**
    - バケット `eval-screenshots`（public read）を新規作成済み
    - RLSポリシー4本（select/insert/update/delete）を anon ロールに付与
  - **コンポーネント**: `components/eval/TestCaseForm.tsx`
    - Excelファイル欄の下に「スクショ（投稿サムネイル画像・任意）」を追加
    - 本番アプリ `ScreenshotUploader.tsx` と同じUIスタイル（緑系プレビュー、複数枚、削除ボタン付き）
    - 編集モードでは既存 `input_screenshots` URL をプレビュー表示し、個別の「×」で削除可
    - 新規追加スクショは緑のリング表示で区別、保存時に `existing` と `new` を別々に送信
  - **API**: `app/api/eval/test-cases/route.ts`（POST）
    - `multipart/form-data` の `screenshots` フィールド（File[]、複数）を受け取り
    - レコードを先に INSERT して `id` を取得 → `{id}/{timestamp}_{filename}` パスでStorageへアップロード
    - 取得した public URL 配列を `input_screenshots` に UPDATE
  - **API**: `app/api/eval/test-cases/[id]/route.ts`（PUT）
    - Content-Type で multipart/form-data か JSON かを分岐（既存JSON経路は維持）
    - `existing_screenshots`（残す既存URLの JSON 文字列）+ `new_screenshots`（新規 File[]）を処理
    - 既存URLのうち existing に含まれないものは Storage から削除、新規ファイルはアップロード
    - 最終的なURL配列を `input_screenshots` に保存
  - 本番アプリ `components/ScreenshotUploader.tsx` には変更なし
  - 検証: `npx tsc --noEmit` / `npx eslint` 成功

- [x] Step 8-g: reach v1 プロンプトにリール除外指示を追加（2026-04-29）
  - **背景**: 検証チーム（川嶋・本間）はリール考察を書いた経験がなく、4軸ルーブリックでの採点妥当性が保てないため、検証フェーズではフィードのみを評価対象とする方針
  - `supabase/migrations/004_eval_reach_v1_no_reel.sql` を新規作成
    - `eval_prompt_versions` の `section='reach', version_label='v1'` レコードのみを UPDATE
    - `prompt_template` の末尾に「リールに言及しない」「出力構成は4点（フィード基準傾向 / TOP3 / ワースト3 / 次月施策）」の検証フェーズ限定指示を追加
    - `description` を「本番アプリと同じプロンプト（ベースライン）+ 検証フェーズ用にリール考察を除外」に更新
  - 本番アプリ `app/api/generate-report/route.ts` には一切手を加えていない
  - summary / follower / account の v1 は変更なし

- [x] Step 8-h: master_fmt v2（検証用）を追加（2026-04-29、Phase 2.5）
  - **目的**: 検証フェーズで使う新FMT（先駆け考察ロジック設計）を `master_fmt` テーブルへ事前登録。本番が参照するのは `is_active=true` の v1 のみのため、`is_active=false` で INSERT しても本番アプリには影響しない
  - `supabase/migrations/005_master_fmt_v2_seed.sql` を新規作成
    - `master_fmt` に `version=2, is_active=false` で INSERT
    - 新FMT の主な変更点: リーチ分析の構成を「Good / Bad / 代表投稿 / 次月の対策」に変更
  - `supabase/migrations/README.md` を更新（実行履歴表 + 005 用の確認SQL を追記）
  - 既存 v1 レコードへの UPDATE/DELETE は実施していない
  - 本番アプリ（`/api/master-fmt`, `/api/generate-report`, `/admin` のFMT編集画面）への変更なし

- [x] Step 8-i: プロンプト v1.6 投入 + セクション単体生成（検証）画面実装（2026-05-21）
  - **目的**: Claudeプロジェクトで磨いたプロンプト v1.6 をアプリ側に持ち込み、検証用にセクション単体生成 → 直前月正解レポートとの横並び比較ができるようにする。本番側（`/`, `/admin`, `/admin/knowledge`、`/api/generate-report` ほか）は無変更
  - **マイグレーション**: `supabase/migrations/006_eval_prompts_v16_seed.sql`（新規）
    - `eval_prompt_versions` に v1.6 を 4 セクション分 INSERT
      - 共通プロンプト本体・最終指示は v1 と同じ（v1.6 の改訂は新FMT.md 側で吸収）
      - **フォロワー分析のみ `is_active = true`**、他 3 セクション（summary / reach / account）は `is_active = false`
    - `master_fmt` は触らない（version=4 が `is_active=true` で新FMT v1.6 相当の本文を保持済み）
    - 既存 v1 系プロンプト 4 レコードには触らない
    - `eval_runs.test_case_id` と `eval_runs.rubric_version` の NOT NULL を解除
      - セクション単体生成 API がテストケース未紐付けでも Run を保存できるようにするため
  - **API**: `app/api/eval/generate-section/route.ts`（新規 / POST）
    - 入力: multipart/form-data（`section` / `prompt_version_id` / `client_id` / `year_month`（"YYYY-MM"）/ `excel_file`）
    - 処理: プロンプト + master_fmt（`is_active=true` 最新）+ clients を取得 → 内部 fetch で `/api/parse-excel` → `/api/calc-diff` → 直前月の `knowledge_base.report_text` を取得（なければ「（参照可能な過去レポートなし）」）→ プレースホルダ置換 → Gemini 2.5 Flash 呼び出し → `eval_runs` に `status='generated'` で保存
    - `actual_references` に `prompt_template` / `filled_prompt`（置換後の最終プロンプト）/ `master_fmt_version` / `master_fmt_content` / `knowledge_text` / `client_info` / `excel_parsed` / `diff_context` / `operator_memo` を保存
    - `test_case_id` は `(client_id, target_month "YYYY/MM")` で `eval_test_cases` を検索して紐付け、無ければ NULL
    - `operator_memo` は「（特記事項なし）」固定、`previous_sections` は空（部分生成のみ）
    - `knowledge_base` への自動保存は行わない
  - **共通ロジック**: `lib/eval/promptResolver.ts`（新規）
    - `fillPrompt` / `buildDiffContextText` / `buildExcelDetailText` / `toSlashYearMonth` / `prevYearMonth`
    - 既存 `app/api/generate-report/route.ts` の `buildDiffContextText` / `buildExcelDetailText` と同等の整形ロジックを切り出し（本番側は無変更）
  - **画面**: `app/admin/eval/generate/page.tsx`（新規）
    - フォーム: クライアント / 対象年月（`<input type="month">`）/ セクション（フォロワー分析のみ選択可、他 3 セクションはグレーアウト + 「準備中」）/ プロンプトバージョン（`is_active=true` をデフォルト選択）/ Excel ファイル
    - 結果表示: 左右 2 カラム（生成結果 / 直前月の正解レポート）+ 「デバッグ情報を見る」展開（`master_fmt` 全文・プロンプトテンプレート・`filled_prompt` ハイライト・`knowledge_text` ・`operator_memo` ・`excel_parsed`/`diff_context`/`client_info` JSON）
    - Markdown 表示は本番 `ReportOutput` と同じ `<pre className="whitespace-pre-wrap">` 方式
  - **トップ画面**: `app/admin/eval/page.tsx` を更新
    - `/admin/eval/generate` へのメイン導線を最上部に追加（既存の test-cases / prompts へのリンクは維持）
    - 「Phase 3 以降で生成・評価機能を追加予定」の旧告知バナーは撤去
  - **既存への影響なし**: `/`, `/admin`, `/admin/knowledge`、`/api/generate-report`, `/api/parse-excel`, `/api/calc-diff` ほか既存 API・画面・テーブル（`clients` / `knowledge_base` / `best_practices` / `master_fmt`）は無変更
  - 検証: `npx tsc --noEmit` / `npx eslint`（対象ファイル）/ `npx next build` すべて成功

- [x] Step 8-l: ExcelParseAgent パース修正 + 検証画面に確認表追加（2026-05-21）
  - **背景**: `/admin/eval/generate` で「家計画 / 2026/03」テストケースを実行すると、`actual_references.excel_parsed` の値がほぼ全て壊れていた（target_month="1" / monthly_trends 1行のみ / age_gender age が "1"-"7" / prefectures name が "1"-"14" / value=0 / ratio="818","9",… / demographics_summary "5・4歳中心、1818、29"）
  - **原因**: 実Excelに「No./順位」のような連番インデックス列が左端に1列入っており、旧パーサが固定列インデックス（row[0]=year_month / row[0]=age / row[0]=name など）を前提にしていたため全列が1列ずつズレて読まれていた。投稿ランキングも `h.includes("投稿")` が「投稿URL」にマッチしてタイトル欄にURLが入っていた
  - **修正**: `app/api/parse-excel/route.ts` を全面リファクタ
    - `detectHeader(rows, keywords, minMatches)`: 先頭10行を走査してキーワード（年月/フォロワー/区分/男/女 など）が複数含まれる行をヘッダー行として特定
    - `findCol(header, keywords)` / `findColAll(header, keywords)`: ヘッダー名 `includes` マッチで列インデックスを取得（OR / AND）
    - `formatYearMonth(v)`: Date オブジェクト・Excel シリアル日付（25569〜80000）・"YYYY/MM"・"YYYY-MM"・"YYYY年M月" 形式を `YYYY/MM` に正規化
    - `parseMonthlyTrends`: 年月列をヘッダーキーワードで特定 + 各セルを `formatYearMonth` 試行するフォールバック。`YYYY/MM` 形式にならない行はスキップし、結果を年月昇順にソート（最後の要素＝当月）
    - `parseAgeGender`: 区分／男／女／合計列をキーワードで特定、`colAge<0` の場合は「男性列の左隣」をフォールバックに採用。整数だけの行ラベルは除外
    - `parseRegion`（都道府県・市区町村共通）: 名称列が見つからない場合は先頭データ行を検査して最初の非数値セルを名称列に推定、value 列はその右側で最初の数値セル、ratio 列は `%`／割合／比率／rate／シェアで検索。ratio 列が存在しない場合は value 合計から自動計算
    - `parsePostRanking` / `parsePostDetails`: URL／リンク／permalink 列を title より先に解決して、「投稿URL」が title に入る問題を解消
    - `XLSX.read` に `cellDates: true` を追加
  - **画面**: `app/admin/eval/generate/page.tsx` に「読み取った数値の確認表」アコーディオン追加（生成ボタンの直上）
    - Excel 選択時に `/api/parse-excel` を呼び、パース結果をプレビュー表示
    - サマリー（デフォルト展開）／ 月次推移（全行）／ フィード TOP3 ／ リール TOP3 ／ 年齢・性別 ／ 都道府県 TOP10
    - target_month を常時バナー表示（`YYYY/MM` 形式でない場合は赤字）
    - 年齢・都道府県のラベルが連番数字になっている場合は赤字でフラグ + 見出しに「⚠ ラベル列が連番数字になっています」
  - **既存への影響**: `/api/calc-diff` / `/api/generate-report` / 本番 `/` は無変更。parse-excel の出力が正しくなることで自動的に前月比・3ヶ月トレンド・デモグラフィクス要約も復旧する
  - 検証: `npx tsc --noEmit` 成功

- [x] Step 8-m: 過去レポート手動登録画面 `/admin/knowledge/import`（2026-05-21）
  - **目的**: 運用開始時の過去レポート（正解データ）を手動で `knowledge_base` に蓄積するための画面。検証画面の直前月正解参照と本番自動保存フローの両方に活用できる
  - **API**: `app/api/master-fmt/list/route.ts`（新規）
    - GET で `master_fmt` を `version DESC` で全件返却（既存 `/api/master-fmt` は `is_active=true` 最新1件のみ返すので、`/admin` のFMT編集画面を壊さないよう別ルートで実装）
  - **API**: `app/api/knowledge/route.ts`（POST 修正）
    - 既存自動保存に影響しない範囲で:
      - `report_text` を必須化（既存自動保存も `meta.full_text` を渡しているので無影響）
      - `year_month` の `YYYY/MM` 形式バリデーション追加
      - `kpi_summary` / `top_posts` 未指定時のデフォルトを `null` → `{}` に変更（部分入力も受け入れる）
  - **画面**: `app/admin/knowledge/import/page.tsx`（新規）
    - 入力: クライアント（既存 `clients` プルダウン）/ 年月（YYYY/MM テキスト）/ FMTバージョン（`/api/master-fmt/list` から全バージョン取得、デフォルトは最新）/ 考察テキスト（textarea 必須）
    - KPIサマリー（任意・前月比計算用）: フォロワー純増数 / 総リーチ数 / 総ビュー数 / 総エンゲージメント数 / 投稿本数 を 2列グリッドで配置。入力された項目だけが `kpi_summary` JSONB に保存される
    - 「ナレッジに登録」で `POST /api/knowledge` を叩き、成功時に年月・考察テキスト・KPI 欄をクリア（クライアントと FMT バージョンは残して連続入力しやすく）
  - **画面**: `app/admin/knowledge/page.tsx`（修正）
    - ヘッダーに「過去レポートを手動登録」ボタンを追加して `/admin/knowledge/import` へ遷移
  - **既存への影響なし**: `/`, `/admin`, `/admin/eval/*`、既存 `/api/knowledge` GET、`ReportGenerator.tsx` の自動保存フローはすべて未変更

- [x] Step 8-n: 検証側参照ロジック「過去レポート1件＋表現ナレッジ1件」化（2026-05-22）
  - **背景**: Phase 3.6。AI生成レポートの参照方式を従来「同社6件＋他社4件」から「過去レポート1件（直前月固定）＋ best_practices 1件」に変更してトークン削減。本番 `/api/generate-report` は無変更、検証側のみ先行適用
  - **API**: `app/api/eval/generate-section/route.ts`（修正）
    - 過去レポート: `knowledge_base` から `client_id` + 直前月（`YYYY/MM`）の1件取得（既存ロジック流用、空のときは `referenced: false` で記録）
    - 表現ナレッジ: `best_practices` から `created_at DESC` の最新1件を取得 → 紐づく `knowledge_base.report_text` を結合取得（テーブル空・FK欠落・本文空の各ケースで個別の `reason` を記録）
    - `knowledge_text` を「直前月レポート」「表現ナレッジ」の2サブセクションに整形。参照不能時はそのブロックに「※ 参照できる前月レポートがありませんでした」等のフォールバック文を埋め込む
    - `actual_references.reference_status = { prev_report: { referenced, knowledge_base_id?, year_month?, reason? }, expression_knowledge: { referenced, best_practice_id?, knowledge_base_id?, year_month?, reason? } }` を保存
    - 本文を画面側でも個別に表示するため `prev_report_text` / `expression_knowledge_text` も `actual_references` とレスポンスJSONに含める
    - 旧フィールド `knowledge_source_year_month` は廃止（`reference_status.prev_report` で同等情報を取得）
  - **画面**: `app/admin/eval/generate/page.tsx`（修正）
    - 結果セクションの最上部に `ReferenceNotice` を追加。両方参照済みなら emerald、いずれか欠落なら amber バナーで「⚠️ 前月レポートを参照していません — {理由}」「⚠️ 表現ナレッジを参照していません — {理由}」を1〜2行表示
    - 右側パネルを「直前月の正解レポート」「表現/文体ナレッジ（best_practices）」の2ブロック（`ReferenceBlock`）に分割し、ブロック内でも本文 or 「⚠️ 参照していません — {理由}」を表示
    - レスポンス型を `ReferenceStatus` + `PrevReportRef` / `ExpressionRef` のユニオンに刷新（discriminated union で TS narrowing 可）
  - **既存への影響なし**: 本番 `/`, `/api/generate-report`, `/api/knowledge` GET, `/admin`, `/admin/knowledge`, `/admin/knowledge/import` は無変更。`best_practices` テーブル・`master_fmt` テーブルへの書き込みなし
  - 検証: `npx tsc --noEmit` / `npx eslint`（対象ファイル）/ `npx next build` すべて成功
  - **運用注**: `best_practices` テーブルは現状 0 件のため、運用初期は常に「表現ナレッジを参照していません」が表示される想定。`/admin/knowledge` から既存ナレッジを★登録すると次回以降に拾われる

- [x] Step 8-q: ExcelParseAgent を Instagram AI Pro 固定構造パーサに刷新（Phase 3.7.1 / 2026-05-22）
  - **背景**: Phase 3.7 でキーワード検索ベースのパーサに項目追加したが、実Excel（Instagram AI Pro エクスポート）で `summary.view=0`, `profile_access=0`, `link_clicks=0`, `monthly_trends.view_total=0`, `feed_posts=[]`, `reel_posts=[]`, `top_cities=[]` 等の致命的欠落が判明
  - **方針**: 全クライアントが同一フォーマット（Instagram AI Pro エクスポート）を使う前提で、キーワード検索を捨てて **シート別の固定カラム位置読み** に書き直し
  - **型定義拡張**: `lib/types.ts`
    - `ExcelSummary` に `view_reel / view_feed / reach_reel / reach_feed / engagement_reel / engagement_feed` を追加（推移データ当月行からの内訳）
    - `MonthlyTrend` に `reach_reel / reach_feed / engagement_reel / engagement_feed / profile_access / link_clicks` を追加（推移データ14列に全対応）
  - **パーサ刷新**: `app/api/parse-excel/route.ts` を全面リファクタ
    - `parseSummary`: `ホーム-数値サマリー`（縦持ち）の列A ラベル完全一致で取得（フォロワー数/ビュー数/リーチ数/エンゲージメント/投稿数）
    - `parseMonthlyTrends`: `ホーム-推移データ`（横持ち14列）を固定 index で読む（0:No., 1:月, 2-5: フォロワー/ビュー総/リール/フィード, 6-8: リーチ総/リール/フィード, 9-11: ENG 総/リール/フィード, 12-13: プロフィールクリック/リンククリック）
    - `parseRanking`: `ホーム-{フィード|リール}ランキング TOP5`（横持ち6列）— [順位, タイトル, リーチ数, エンゲージメント, エンゲージメント率, 投稿URL]
    - `parsePosts`: `投稿分析-{フィード|リール}`（横持ち11列）— [No., タイトル, 投稿日, タイプ, ビュー, リーチ, ENG, ENG率, いいね, コメント, 保存]
    - `parseAgeGender`: `デモグラフィック分析-年齢・性別分析（フォロワー数）`（5列）— [No., 年齢層, 男, 女, 合計]
    - `parseRegion`: `デモグラフィック分析-{都道府県|都市}`（4列）— [No., 名称, 値, 比率(%)]。`ratio` は Excel上の値（"93.70" 等）に文字列で "%" を付けるだけ（10倍補正は廃止 — Excel値は既に％単位）
    - `extractTitle`: 投稿本文を行分割し、`.` と `━` 区切りで境界判定。最初の意味のある 1-3 行を取得して boilerplate（『残し続ける1ページ』等）混入を回避
    - **summary 補完**: `ホーム-数値サマリー` には `profile_access / link_clicks / *_reel / *_feed` が無いため、`monthly_trends` の当月行（`target_month` 一致）から補完。`post_count` が 0 のときは投稿明細の合計、`comments` が 0 のときは投稿明細のコメント合計でフォールバック
  - **excel-to-kpi 更新**: `lib/excel-to-kpi.ts`
    - `feed_reach_avg / reel_reach_avg / feed_view_avg / reel_view_avg` を `currentTrend.{reach,view}_{feed,reel} ÷ {feed|reel}_post_count` で算出（投稿明細から平均する旧方式を廃止）
    - `currentTrend` は `target_month` 一致行 → 末尾行 → null の順でフォールバック
    - `profile_access / link_clicks` は `summary` を優先、空なら `currentTrend` から取得
  - **動作確認（サンプルExcel 2026/03）**: `npx next build` → `next start -p 3777` → `POST /api/parse-excel` で21件全期待値クリア
    - `summary`: view=14663, reach=7583, follower=1031, engagement=690, post_count=35, profile_access=555, link_clicks=14, view_reel=2017, view_feed=6925, reach_reel=1314, reach_feed=3093, engagement_reel=214, engagement_feed=958 ✅
    - `monthly_trends[0]`: 14項目すべて期待値通り（view_total=8942 と summary.view=14663 は別物として両方保持）✅
    - `feed_posts.length=12 / reel_posts.length=4 / feed_ranking.length=5 / reel_ranking.length=4` ✅
    - `prefectures.length=14 / cities.length=45 / age_gender.length=7` ✅
    - `prefectures[0..3].ratio = "93.70%, 1.03%, 1.03%, 0.80%"`（10倍バグ修正）✅
    - 投稿タイトル: ranking と posts いずれもボイラープレート除外で個別タイトルが入る
  - **既存への影響**: 関数シグネチャと `ExcelParseResult` の既存キーは無変更（追加のみ）。本番 `/api/generate-report`, ReportGenerator 自動保存、`/api/calc-diff`, `/admin/eval/generate`, `/admin/knowledge/import` の Excel モードはすべて再ビルドで自動的に新パーサを利用
  - **運用上の留意**:
    - 既存 `knowledge_base` の壊れデータ（家計画 2026/03 view=0）は本Phase の対象外。Phase 3.6.1 の削除機能 + 本番再生成で更新する必要あり（運用作業 G）
    - 検証画面に登録済みの `eval_test_cases` の `input_excel_data` も古いパース結果を持つため、Excel再アップロードで更新を推奨
  - 検証: `npx tsc --noEmit` / `npx eslint`（対象ファイル）/ `npx next build` すべて成功 + サンプルExcelでの実行テストOK

- [x] Step 8-p: DiffCalcAgent を knowledge_base 参照型へ移行 + Excel項目拡充（2026-05-22）
  - **背景**: Phase 3.7。Excelに当月分しか入らない運用に変わったため、前月比は前月レコードの `kpi_summary` から取得する必要がある。同時に各セクション考察に必要な詳細データ（性別比・年齢分布・地域・各種平均・コメント・プロフィールアクセス・リンククリック）を保存する
  - **マイグレーション**: `supabase/migrations/007_knowledge_base_excel_parsed.sql`（新規、適用済み）
    - `knowledge_base.excel_parsed jsonb DEFAULT '{}'::jsonb` を追加（カラム拡充は `IF NOT EXISTS`）
    - 既存2レコードはデフォルト `{}` で初期化済み
    - 番号は 006 が `eval_prompts_v16_seed.sql` で既使用のため 007 を採用
  - **型定義**: `lib/types.ts` 拡張
    - `ExcelSummary` に `comments / profile_access / link_clicks` を追加
    - `PostDetail` に `comments` を追加
    - `KnowledgeBase` に `excel_parsed` フィールド追加
    - 新規型: `KpiSummary` / `KpiGenderRatio` / `KpiAgeDistribution`
  - **ExcelParseAgent**: `app/api/parse-excel/route.ts`
    - `parseSummary`: 「プロフィール」「リンククリック / ウェブサイト / 外部リンク」「コメント」の各キーワードで行ラベルを判定し、見つからなければ 0
    - `parsePostDetails`: `comments` 列を `「コメント」/「comment」` で検索追加
    - 既存項目の値・順序は無変更（後方互換）
  - **新ヘルパー**: `lib/excel-to-kpi.ts`（新規）
    - `excelToKpiSummary(ExcelParseResult): KpiSummary`
    - 既存5キー（follower/view/reach/engagement/post_count）を引き継ぎつつ、性別比集計（`gender_ratio`）/ 年齢分布マッピング（`age_distribution` を 13-17 / 18-24 / 25-34 / 35-44 / 45-54 / 55-64 / 65+ の7バケットへ正規化）/ 都道府県・市区町村 TOP10（`top_prefectures` / `top_cities`）/ フィード/リールのリーチ平均・ビュー平均・本数 / `engagement_rate = engagement/reach` / いいね・保存・コメント合計 / `profile_access` / `link_clicks` を生成
    - `follower_net_increase` は前月比較が必要なため 0 固定（calc-diff 側で算出可能）
  - **DiffCalcAgent**: `app/api/calc-diff/route.ts`
    - 入力に `client_id?` / `target_month_override?` を追加
    - `client_id` 指定時は `knowledge_base` から `(client_id, prev_month)` で前月レコードを取得し、その `kpi_summary` の `view/reach/follower/engagement` と当月 Excel の `summary` を比較
    - 前月レコードなし: `prev=0`, `diff_rate="N/A"`, `trend="データ不足（前月レコードなし）"`
    - 前月レコードはあるが該当キーが欠落: `prev=0`, `diff_rate="N/A"`, `trend="データ不足（前月の${key}未保存）"`
    - `monthly_trends.length < 3` の場合はトレンドを2点比較（上昇/下降/横ばい）で代替
    - `client_id` 未指定時は旧 monthly_trends ベースで動く（後方互換）
  - **caller 更新**:
    - `app/api/eval/generate-section/route.ts`: `calcDiffInternal(excel, request, { clientId, targetMonth })` に変更（target_month は `toSlashYearMonth(yearMonth)`）
    - `components/ReportGenerator.tsx`: `/api/calc-diff` 呼び出し時に `client_id` と `target_month_override: excelData.target_month` を渡す
  - **自動保存拡張**: `components/ReportGenerator.tsx`
    - 自動保存の `kpi_summary` を `excelData.summary` → `excelToKpiSummary(excelData)` に変更
    - 同時に `excel_parsed: excelData` を送信
    - `app/api/knowledge/route.ts` POST は `excel_parsed` フィールドを受け取り、未指定時は `{}` で INSERT
  - **手動投入画面**: `app/admin/knowledge/import/page.tsx`
    - 「入力モード」ラジオ（手動入力 / Excelアップロード）を追加
    - Excelモード: ファイル選択 → `/api/parse-excel` → 確認表（サマリー / 性別・年齢分布 / 投稿本数）を表示、target_month / kpi_summary / excel_parsed をフォーム状態に自動セット
    - 手動モード: 既存挙動を維持（5項目任意入力）
    - 両モードで `excel_parsed` を送信（手動時は `{}`）
  - **検証画面**: `app/admin/eval/generate/page.tsx` の SummaryTable に「コメント / プロフィールアクセス / リンククリック」3行を追加
  - **既存への影響**:
    - 本番 `/` の挙動はそのまま（呼び出し方の変化のみ。calc-diff は client_id を渡すと新方式に切替）
    - 既存テストケース（家計画 2026/03）で生成しても旧フィールドはすべて互換、追加項目だけ増える
  - **運用上の留意**:
    - 既存 2026/03 レコードは `view=0` の壊れデータ。Phase 3.6.1 削除機能で消した上で本番から再生成 → `excel_parsed` 込みで自動保存されると新方式の前月比が機能する
    - 家計画 2026/02 のみが kpi 完全保有のため、`generate-section` で 2026/03 を再現するときは 2026/02 を前月として参照
  - 検証: `npx tsc --noEmit` / `npx eslint`（対象ファイル）/ `npx next build` すべて成功

- [x] Step 8-o: ナレッジDB一覧に削除機能を追加（2026-05-22）
  - **背景**: Phase 3.6.1。手動投入機能で誤登録・重複登録した際に、レコードを消す手段がなかった
  - **API**: `app/api/knowledge/[id]/route.ts`（新規 / DELETE）
    - `knowledge_base` を物理削除。事前に `.maybeSingle()` で存在チェックし、無ければ 404 を返す
    - `best_practices_knowledge_base_id_fkey` は ON DELETE CASCADE 設定済み（`confdeltype='c'` 確認済み）のため、紐づく `best_practices` レコードも自動で連動削除される
    - 既存 `app/api/knowledge/route.ts` の GET/POST は無変更
  - **画面**: `app/admin/knowledge/page.tsx`（修正）
    - 各カードのベストプラクティス操作ボタンと展開矢印の間に、赤色のゴミ箱アイコン（インライン SVG `TrashIcon`）を配置
    - クリックで確認モーダル（オーバーレイ + 中央寄せ）を表示し、クライアント名 / 年月 / FMTバージョン / 「⚠️ この操作は取り消せません」を提示
    - 「削除する」で `DELETE /api/knowledge/{id}` を呼び、成功時はローカル state から `records` と `bestPractices` を即時除外。展開中なら閉じる
    - 右下に 3 秒で消えるトースト（success=emerald / error=red）で「削除しました」「削除に失敗しました」を表示
    - オーバーレイクリック・キャンセルボタンで閉じる（削除実行中は無効化）
  - **既存への影響なし**: `/`, `/admin`, `/admin/knowledge/import`, `/admin/eval/*`、本番 `/api/generate-report`, `/api/knowledge` GET/POST, ReportGenerator 自動保存フローは無変更
  - 検証: `npx tsc --noEmit` / `npx eslint`（対象ファイル）/ `npx next build` すべて成功

- [x] Step 8-r: GitHub保存 + 削除APIセキュリティ対応（2026-06-02）
  - **背景**: 「ファイルを失わないよう Git/GitHub に保存したい」という要望。既存リモート（`reportAIrecent`）は設定済みだが、直近の変更が未コミット・未プッシュだった
  - **Git**: 未コミットの全変更（Phase 3.7 / 3.7.1 系のコード、`.claude/settings.json`、migration 007 等）をコミットして `origin/main` に push
    - 機密確認: `.gitignore` の `.env*` で `.env.local` は除外済み・未追跡。APIキー類はGitHubに存在しない
    - `.env.local.example` も `.env*` パターンで gitignore 対象のため未追跡（ローカルのテンプレートとしてのみ存在）
  - **新規**: `lib/auth.ts` — サーバー側認証ヘルパー
    - `x-app-password` ヘッダー / `app_password` Cookie を `APP_PASSWORD` と `crypto.timingSafeEqual` で照合
    - `APP_PASSWORD` 未設定時: 本番（`NODE_ENV=production`）は拒否（fail-closed）、開発環境 or `ALLOW_UNAUTHENTICATED=1` のみ素通り
  - **新規**: `lib/client-auth.ts` — クライアント側ヘルパー
    - 初回のみ `prompt()` でパスワード取得 → `sessionStorage` に保持、`x-app-password` ヘッダー付与、401時は破棄して再入力
  - **修正**: `app/api/knowledge/[id]/route.ts` — DELETE 冒頭で `isAuthorized()` チェック → 失敗時 401
  - **修正**: `app/admin/knowledge/page.tsx` — 削除呼び出しに `authHeaders()` 付与、401 ハンドリング追加
  - **対応した指摘**: Missing Authorization（HIGH）/ Fail-Open Authorization（MEDIUM）
  - **運用上の留意**: 現状ローカル環境のみ運用。`.env.local` の `APP_PASSWORD` は設定済みのため、ローカルでも削除時にパスワード入力が必要。Vercel等にデプロイする際は環境変数に `APP_PASSWORD` を登録すること（未設定だと本番では削除が401で拒否される）
  - 検証: `npx tsc --noEmit` 成功 / 3コミットを push 済み（`3371fef` → `64bff74` → `526391a`）

- [x] Phase 4a: アプリ内完結レポート作成画面（基盤）（2026-06-02）
  - **指示書**: `phase4a-instructions.md` / 設計: `report-builder-design-2026-06-02.md`
  - **新画面**: `/admin/eval/report`（既存 `/admin/eval/generate` は無変更で温存。eval トップに導線追加）
    - クライアント選択 → 当月Excelアップロード → 担当者メモ（任意） → 4セクション順次AI生成 → 考察編集 → 保存
    - Notion FMT 準拠の4セクション構成。各セクションに「このセクションをコピー」ボタン（Notionコピペ運用と両立）
  - **生成エンジン**: `POST /api/report-builder/generate-section`
    - `eval_prompt_versions` の is_active 最新版を自動選択（follower=v1.6 / 他=v1）。プロンプト改善PDCAの成果がそのまま反映される
    - 前セクションの生成結果を `{previous_sections}` で文脈引き継ぎ（本番 generate-report と同じ逐次方式）
    - 参照は eval 版と同等（直前月レポート1件 + best_practices 1件、`lib/report/knowledge-context.ts`）。eval_runs には書き込まない
  - **グラフ基盤**: recharts 導入。`components/report/charts.tsx`（折れ線/棒/ドーナツ）
    - KPI推移表（直近1年）/ フォロワー推移 / ビュー・リーチ月次 / 性別・年齢・都道府県・市区町村ドーナツ
    - 推移系はデータ3点未満で「データ蓄積中」表示（無理に線を引かない）。蓄積月のみを点として結び欠月はスキップ
    - 純増は「当月フォロワー − 前月フォロワー」を表示側で明示計算（kpi_summary の follower_net_increase=0 既知課題には依存しない）
  - **保存（UPSERT）**: `POST /api/report-builder/save`
    - 同一 client_id + year_month の既存レコードを削除してから INSERT（ノコス2026/03 重複問題の再発防止）。既存重複データ自体の削除は別途判断のまま
    - `kpi_summary` / `top_posts` / `excel_parsed` / `report_text`（`## セクション名` 連結＝本番と同形式）を保存。APP_PASSWORD 認証ゲート
  - **過去月数値の手打ち入力**: `POST /api/report-builder/manual-kpi` + `ManualKpiEditor`
    - 入力対象は推移グラフ用12項目のみ（フォロワー/ビュー・リーチ・ENG各 合計・リール・フィード/プロフアクセス/リンククリック）。デモグラは対象外
    - 既存月は kpi_summary に入力キーのみマージ更新、新規月は report_text=null で INSERT
    - 入力口は2か所: ①`/admin` クライアント登録/編集モーダル（折りたたみ・任意） ②レポート画面の折りたたみ欄
  - **kpi_summary 拡張**: `view_reel/view_feed/reach_reel/reach_feed/engagement_reel/engagement_feed` キーを追加（`excelToKpiSummary` が当月Excelから自動セット。過去レコードは欠落許容）
  - **既存無変更**: `/`・`/admin/knowledge`・`/api/knowledge` POST は無変更。`/admin` はモーダルへの追加のみ
  - 検証: `npm run build` 成功 / lint エラー0 / 履歴API実機確認（重複月dedupe動作確認）/ 認証ゲート401確認
  - コミット: `8618ecd`（Step C）→ `4822935`（Step A+B）→ `a572356`（Step D）
  - **残課題（Phase 4b/4c へ）**: AI Pro/Notion風デザイン、年齢ピラミッド、投稿サムネイル、ナレッジ共有貼付欄、エクスポート、サマリーの「各指標テーブル（目標/要因/次月対策）」の編集列、日別シートパース（アカウントアクション折れ線）

## 未着手

- [ ] Step 8-j: マイグレーション 006 の手動実行（川嶋）
  - Supabase SQL Editor（`sfgunchibzhtpsaldffu`）で `006_eval_prompts_v16_seed.sql` を実行
  - 実行後の確認:
    - `eval_prompt_versions` に `version_label='v1.6'` が 4 セクション分存在（summary / follower / reach / account）
    - `follower / v1.6` のみ `is_active=true`、他 3 セクションは `is_active=false`
    - `eval_runs.test_case_id` と `eval_runs.rubric_version` が NULL 許容になっている
  - `/admin/eval/generate` から フォロワー分析（家計画 / 2026-03 / v1.6）で生成が実行できることを確認
  - 生成後、`eval_runs` の `actual_references` に `filled_prompt` が保存されていることを確認
  - 既存本番アプリ（`/`, `/admin`, `/admin/knowledge`）が引き続き正常動作することを確認
  - 001〜005 は適用済み（README の ⏳ 表記は古いだけで DB 上は反映済み）
- [ ] Step 8-k: レポートAI検証機能 Phase 3 以降
  - 生成API（テストケース×プロンプトv* で4セクション生成 → `eval_runs` 保存）
  - LLM-as-a-Judge 評価API（`eval_runs.ai_evaluation` 保存）
  - 人間採点UI（`eval_scores` 4軸×10点）
  - `/admin/eval/compare` 横並び比較画面
  - 川嶋さん側で5社×2ヶ月分（計10ケース）の入力が揃ってから着手
- [ ] Step 9: Vercelデプロイ
  - Vercelプロジェクト作成
  - 環境変数設定（SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, **APP_PASSWORD**）
    - ⚠️ `APP_PASSWORD` 未設定だと本番では削除APIが401で拒否される（fail-closed）。認証なしで運用する場合のみ `ALLOW_UNAUTHENTICATED=1`（非推奨）
  - デプロイ確認
- [ ] Step 10: 過去データ14ヶ月分をナレッジDBへ一括投入
  - 過去レポートのExcelデータ準備
  - knowledge_baseへバルクインサート

## 動作確認・調整（随時）

- [ ] 実際のExcelデータでExcelParseAgentの動作確認（シート名のマッチング調整）
- [ ] Geminiプロンプトの品質チューニング（マスターFMTとの整合性確認）
- [ ] スクショ画像によるリーチ分析の精度確認
- [ ] エラーハンドリングの実運用テスト

## 技術メモ

- Supabaseプロジェクト: `sfgunchibzhtpsaldffu`（ap-northeast-1）
- Geminiモデル: `gemini-2.5-flash`
- 環境変数: `.env.local` に設定済み（`.env.local.example` はテンプレート）。`APP_PASSWORD`（削除API認証）/ `ALLOW_UNAUTHENTICATED`（本番で認証無効化したい場合のみ=1）を含む
- GitHub: `https://github.com/kaiseikawashima-hash/reportAIrecent`（`main` ブランチ）
