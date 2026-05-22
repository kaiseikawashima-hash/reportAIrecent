-- ============================================
-- Phase 1 Step 1-3: 既存本番プロンプトを v1 として登録
-- ============================================
-- app/api/generate-report/route.ts の buildPrompt() を元にしたテンプレート。
-- 4セクションは同じレイヤー構造のテンプレートを共有する。
-- {master_fmt}, {client_name}, {client_area}, {client_auto_memo}, {diff_text},
-- {detail_text}, {knowledge_text}, {operator_memo}, {previous_sections} は
-- Phase 3 の生成ロジックで実値に展開する。
--
-- 各セクションの差分:
--   - section_label のみ
--   - reach のみ [Layer 6] 投稿サムネイル画像の指示を持つ
--   - detail_text の中身は各セクションで異なる（buildExcelDetailText で生成）

insert into eval_prompt_versions (section, version_label, prompt_template, description) values

('summary', 'v1',
$prompt$[Layer 1] マスターFMT
{master_fmt}

[Layer 2] クライアント属性
会社名: {client_name}
エリア: {client_area}
特徴メモ: {client_auto_memo}

[Layer 3] 今月の構造化数値
{diff_text}

[Layer 3-b] 詳細データ
{detail_text}

[Layer 4] 過去レポート参照（文体・施策の参考）
※ マスターFMTと矛盾する場合はマスターFMTを優先すること
{knowledge_text}

[Layer 5] 担当者メモ
{operator_memo}

[既に生成済みのセクション（文脈として参照）]
{previous_sections}

---
上記をもとに「サマリー」セクションのみを生成してください
Markdown形式で出力すること$prompt$,
'本番アプリと同じプロンプト（ベースライン）'),

('follower', 'v1',
$prompt$[Layer 1] マスターFMT
{master_fmt}

[Layer 2] クライアント属性
会社名: {client_name}
エリア: {client_area}
特徴メモ: {client_auto_memo}

[Layer 3] 今月の構造化数値
{diff_text}

[Layer 3-b] 詳細データ
{detail_text}

[Layer 4] 過去レポート参照（文体・施策の参考）
※ マスターFMTと矛盾する場合はマスターFMTを優先すること
{knowledge_text}

[Layer 5] 担当者メモ
{operator_memo}

[既に生成済みのセクション（文脈として参照）]
{previous_sections}

---
上記をもとに「フォロワー分析」セクションのみを生成してください
Markdown形式で出力すること$prompt$,
'本番アプリと同じプロンプト（ベースライン）'),

('reach', 'v1',
$prompt$[Layer 1] マスターFMT
{master_fmt}

[Layer 2] クライアント属性
会社名: {client_name}
エリア: {client_area}
特徴メモ: {client_auto_memo}

[Layer 3] 今月の構造化数値
{diff_text}

[Layer 3-b] 詳細データ
{detail_text}

[Layer 4] 過去レポート参照（文体・施策の参考）
※ マスターFMTと矛盾する場合はマスターFMTを優先すること
{knowledge_text}

[Layer 5] 担当者メモ
{operator_memo}

[Layer 6] 投稿サムネイル画像
※ 添付画像はフィードTOP3・ワースト3のサムネイル
※ テーマ・デザイン傾向を考察に活かすこと

[既に生成済みのセクション（文脈として参照）]
{previous_sections}

---
上記をもとに「リーチ分析」セクションのみを生成してください
Markdown形式で出力すること$prompt$,
'本番アプリと同じプロンプト（ベースライン）'),

('account', 'v1',
$prompt$[Layer 1] マスターFMT
{master_fmt}

[Layer 2] クライアント属性
会社名: {client_name}
エリア: {client_area}
特徴メモ: {client_auto_memo}

[Layer 3] 今月の構造化数値
{diff_text}

[Layer 3-b] 詳細データ
{detail_text}

[Layer 4] 過去レポート参照（文体・施策の参考）
※ マスターFMTと矛盾する場合はマスターFMTを優先すること
{knowledge_text}

[Layer 5] 担当者メモ
{operator_memo}

[既に生成済みのセクション（文脈として参照）]
{previous_sections}

---
上記をもとに「アカウント分析」セクションのみを生成してください
Markdown形式で出力すること$prompt$,
'本番アプリと同じプロンプト（ベースライン）');
