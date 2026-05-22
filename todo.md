# SNSレポート生成アプリ - 進捗チェックリスト

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
  - 環境変数設定（SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY）
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
- 環境変数: `.env.local` に設定済み（`.env.local.example` はテンプレート）
