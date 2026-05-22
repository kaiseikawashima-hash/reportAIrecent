-- ============================================
-- Phase 1: 検証機能テーブル群
-- ============================================
-- 既存テーブル（clients, master_fmt, knowledge_base, best_practices）には一切手を入れない
-- すべて接頭辞 eval_ で命名

-- ============================================
-- 1. 評価ルーブリック定義テーブル
-- ============================================
create table eval_rubrics (
  id uuid default gen_random_uuid() primary key,
  version integer not null,
  axis_key text not null,
  name text not null,
  description text not null,
  max_score integer not null default 10,
  score_definitions jsonb not null,
  display_order integer not null,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  unique(version, axis_key)
);

create index idx_eval_rubrics_version on eval_rubrics(version, is_active);

-- ============================================
-- 2. テストケース（検証セット）
-- ============================================
create table eval_test_cases (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  client_id uuid references clients(id),
  target_month text not null,

  -- 入力データ（AIに渡す情報）
  input_excel_data jsonb not null,
  input_diff_context jsonb not null,
  input_screenshots text[] default array[]::text[],
  input_operator_memo text,

  -- 正解レポート（既存運用者が書いたもの）
  reference_report_text text,
  reference_summary text,
  reference_follower text,
  reference_reach text,
  reference_account text,
  reference_author text,

  notes text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_eval_test_cases_client on eval_test_cases(client_id, target_month);
create index idx_eval_test_cases_active on eval_test_cases(is_active);

-- ============================================
-- 3. プロンプトバージョン管理
-- ============================================
create table eval_prompt_versions (
  id uuid default gen_random_uuid() primary key,
  section text not null check (section in ('summary', 'follower', 'reach', 'account')),
  version_label text not null,
  prompt_template text not null,
  description text,
  parent_version_id uuid references eval_prompt_versions(id),
  reference_config jsonb default '{"same_client_limit": 6, "other_client_limit": 4, "use_best_practice": true}'::jsonb,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(section, version_label)
);

create index idx_eval_prompt_versions_section on eval_prompt_versions(section, is_active);

-- ============================================
-- 4. 生成実行ログ
-- ============================================
create table eval_runs (
  id uuid default gen_random_uuid() primary key,
  test_case_id uuid not null references eval_test_cases(id) on delete cascade,
  prompt_version_id uuid not null references eval_prompt_versions(id),
  rubric_version integer not null,

  section text not null check (section in ('summary', 'follower', 'reach', 'account')),
  generated_text text,
  generation_model text,
  generation_metadata jsonb,
  actual_references jsonb,

  ai_evaluation jsonb,
  ai_evaluator_model text,
  ai_evaluated_at timestamp with time zone,

  status text default 'pending' check (status in ('pending', 'generated', 'ai_evaluated', 'human_evaluated', 'completed', 'failed')),

  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_eval_runs_test_case on eval_runs(test_case_id, section);
create index idx_eval_runs_prompt on eval_runs(prompt_version_id);
create index idx_eval_runs_status on eval_runs(status);

-- ============================================
-- 5. 人間採点結果
-- ============================================
create table eval_scores (
  id uuid default gen_random_uuid() primary key,
  run_id uuid not null references eval_runs(id) on delete cascade,
  rubric_id uuid not null references eval_rubrics(id),

  score integer not null check (score >= 0 and score <= 10),
  comment text,

  evaluator_name text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),

  unique(run_id, rubric_id, evaluator_name)
);

create index idx_eval_scores_run on eval_scores(run_id);

-- ============================================
-- updated_at 自動更新トリガー
-- ============================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_eval_test_cases_updated_at before update on eval_test_cases
  for each row execute function update_updated_at_column();

create trigger update_eval_prompt_versions_updated_at before update on eval_prompt_versions
  for each row execute function update_updated_at_column();

create trigger update_eval_runs_updated_at before update on eval_runs
  for each row execute function update_updated_at_column();

create trigger update_eval_scores_updated_at before update on eval_scores
  for each row execute function update_updated_at_column();
