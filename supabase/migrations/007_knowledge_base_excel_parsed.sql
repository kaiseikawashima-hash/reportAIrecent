-- Phase 3.7
-- knowledge_base に ExcelParseAgent の出力を丸ごと保存するカラムを追加する。
-- 既存レコードは default '{}' で初期化される。後から手動 UPDATE で補完可能。

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS excel_parsed jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN knowledge_base.excel_parsed IS
  'ExcelParseAgentの出力JSON全体を保存（前月比計算・詳細考察用）';
