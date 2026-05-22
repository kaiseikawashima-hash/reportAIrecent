-- ============================================
-- Phase 検証: プロンプト v1.6 を 4 セクション分投入
-- ============================================
-- prompts.md v1.6 の本文を eval_prompt_versions に登録する。
-- v1.6 では共通プロンプト本体・セクション別最終指示は v1 と同じで、
-- マスターFMT（新FMT.md）側の改訂（アカウント分析 NG 例追加など）で品質向上を狙う。
--
-- 反映ポリシー:
--   - フォロワー分析のみ is_active = true で投入（実運用での検証対象）
--   - 他3セクション（summary / reach / account）は is_active = false
--   - 既存の v1 系プロンプト（4 レコード）には触らない
--   - master_fmt は触らない（version=4 の本文がすでに新FMT v1.6 相当）
--
-- 加えて、セクション単体生成 API（/api/eval/generate-section）が
-- eval_test_cases に紐付かない検証 Run を保存できるようにするため、
-- eval_runs.test_case_id と eval_runs.rubric_version の NOT NULL 制約を緩める。

-- ============================================
-- eval_runs の NOT NULL 制約緩和
-- ============================================
alter table eval_runs alter column test_case_id drop not null;
alter table eval_runs alter column rubric_version drop not null;

-- ============================================
-- v1.6 プロンプト投入
-- ============================================

insert into eval_prompt_versions (section, version_label, prompt_template, description, is_active) values

('summary', 'v1.6',
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
'v1.6: 共通プロンプト本体・最終指示は v1 と同じ。新FMT 側でアカウント分析・リーチ分析 NG/OK 例を強化',
false),

('follower', 'v1.6',
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
'v1.6: 共通プロンプト本体・最終指示は v1 と同じ。新FMT 側でフォロワー分析の「単月効果として書かない」「性別・年代を狙った結果として書かない」を明文化',
true),

('reach', 'v1.6',
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
上記をもとに「リーチ分析」セクションの **フィード部分のみ** を生成してください
Markdown形式で出力すること$prompt$,
'v1.6: 共通プロンプト本体・最終指示は v1 と同じ。新FMT 側でグリッド全体推測・根拠なし外部要因の禁止を明文化',
false),

('account', 'v1.6',
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
'v1.6: 共通プロンプト本体・最終指示は v1 と同じ。新FMT 側でストーリー単位因果づけ・文言/デザイン効果踏み込みの禁止を明文化',
false);
