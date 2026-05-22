# Supabase Migrations — レポートAI検証機能

このディレクトリには、検証機能（`eval_*`系テーブル）に関するSQLマイグレーションが入っています。
本番アプリの既存テーブル（`clients`, `master_fmt`, `knowledge_base`, `best_practices`）には基本的に影響しません。

ただし `005` のみ `master_fmt` テーブルへ **検証用 v2 を `is_active=false` で INSERT** します（本番が参照する `is_active=true` の v1 には触らないため、本番アプリへの影響はありません）。

## 実行手順

Supabase ダッシュボード（プロジェクト `sfgunchibzhtpsaldffu`）の SQL Editor で、以下を**この順番**で実行する。

1. `001_eval_tables.sql` — 5テーブル + updated_at トリガー
2. `002_eval_rubrics_v1_seed.sql` — ルーブリック v1（4軸）
3. `003_eval_prompts_v1_seed.sql` — プロンプト v1（4セクション）
4. `004_eval_reach_v1_no_reel.sql` — reach v1 にリール除外指示を追加
5. `005_master_fmt_v2_seed.sql` — 検証用 master_fmt v2 を追加（`is_active=false`）

## マイグレーション実行履歴

- 001_eval_tables.sql: 5テーブル作成 ✅
- 002_eval_rubrics_v1_seed.sql: ルーブリックv1投入 ✅
- 003_eval_prompts_v1_seed.sql: プロンプトv1投入 ✅
- 004_eval_reach_v1_no_reel.sql: reach v1にリール除外指示追加 ⏳
- 005_master_fmt_v2_seed.sql: 新FMT v2を検証用に追加 ⏳ ← Phase 2.5

## 完了確認

```sql
-- 5テーブル
select table_name from information_schema.tables
  where table_name like 'eval_%' order by table_name;
-- => eval_prompt_versions, eval_rubrics, eval_runs, eval_scores, eval_test_cases

-- ルーブリック4件
select count(*) from eval_rubrics where version = 1;  -- => 4

-- プロンプト4件
select section, version_label from eval_prompt_versions order by section;
-- => account/v1, follower/v1, reach/v1, summary/v1
```

### master_fmt のバージョン状態確認（005 実行後）

```sql
select version, is_active, length(content) as content_length
from master_fmt
order by version;
```

期待結果:
- v1: `is_active = true`（本番運用中、触らない）
- v2: `is_active = false`（検証用、Phase 3 で参照する）
