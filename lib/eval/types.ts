import type { DiffCalcResult, ExcelParseResult } from "@/lib/types";

// ==========================================
// セクション
// ==========================================

export type EvalSection = "summary" | "follower" | "reach" | "account";

export const EVAL_SECTIONS: EvalSection[] = ["summary", "follower", "reach", "account"];

export const SECTION_LABELS: Record<EvalSection, string> = {
  summary: "サマリー",
  follower: "フォロワー分析",
  reach: "リーチ分析",
  account: "アカウント分析",
};

// ==========================================
// ルーブリック
// ==========================================

export type EvalAxisKey = "causality" | "specificity" | "actionability" | "format";

export interface EvalRubric {
  id: string;
  version: number;
  axis_key: EvalAxisKey;
  name: string;
  description: string;
  max_score: number;
  score_definitions: Record<string, string>;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

// ==========================================
// テストケース
// ==========================================

export interface EvalTestCase {
  id: string;
  name: string;
  client_id: string;
  target_month: string;
  input_excel_data: ExcelParseResult;
  input_diff_context: DiffCalcResult;
  input_screenshots: string[];
  input_operator_memo: string | null;
  reference_report_text: string | null;
  reference_summary: string | null;
  reference_follower: string | null;
  reference_reach: string | null;
  reference_account: string | null;
  reference_author: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // ジョイン時に取得
  client?: { id: string; name: string };
}

// ==========================================
// プロンプトバージョン
// ==========================================

export interface PromptReferenceConfig {
  same_client_limit: number;
  other_client_limit: number;
  use_best_practice: boolean;
}

export const DEFAULT_REFERENCE_CONFIG: PromptReferenceConfig = {
  same_client_limit: 6,
  other_client_limit: 4,
  use_best_practice: true,
};

export interface EvalPromptVersion {
  id: string;
  section: EvalSection;
  version_label: string;
  prompt_template: string;
  description: string | null;
  parent_version_id: string | null;
  reference_config: PromptReferenceConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
