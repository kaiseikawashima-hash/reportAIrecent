// ==========================================
// Phase 4a: レポート作成画面（アプリ内完結版）の型定義
// ==========================================

import type { EvalSection } from "@/lib/eval/types";

// ------------------------------------------
// 推移グラフ・手打ち入力対象の KPI キー
// （monthly_trends 相当。デモグラフィックは対象外）
// ------------------------------------------

export const TREND_KPI_KEYS = [
  "follower",
  "view",
  "view_reel",
  "view_feed",
  "reach",
  "reach_reel",
  "reach_feed",
  "engagement",
  "engagement_reel",
  "engagement_feed",
  "profile_access",
  "link_clicks",
] as const;

export type TrendKpiKey = (typeof TREND_KPI_KEYS)[number];

export const TREND_KPI_LABELS: Record<TrendKpiKey, string> = {
  follower: "フォロワー",
  view: "ビュー（合計）",
  view_reel: "ビュー（リール）",
  view_feed: "ビュー（フィード）",
  reach: "リーチ（合計）",
  reach_reel: "リーチ（リール）",
  reach_feed: "リーチ（フィード）",
  engagement: "ENG（合計）",
  engagement_reel: "ENG（リール）",
  engagement_feed: "ENG（フィード）",
  profile_access: "プロフィールアクセス",
  link_clicks: "リンククリック",
};

/** 手打ち入力1ヶ月分の値（入力された項目のみ保持） */
export type ManualKpiValues = Partial<Record<TrendKpiKey, number>>;

/** 手打ち入力エントリ（year_month は "YYYY/MM"） */
export interface ManualKpiEntry {
  year_month: string;
  values: ManualKpiValues;
}

// ------------------------------------------
// knowledge_base 由来の KPI 履歴
// ------------------------------------------

/** 履歴1ヶ月分（kpi_summary は過去レコードでキー欠落があり得る） */
export interface KpiHistoryPoint {
  year_month: string; // "YYYY/MM"
  kpi: Record<string, unknown>;
  has_report: boolean;
}

// ------------------------------------------
// セクション生成 API のレスポンス
// ------------------------------------------

export interface GenerateSectionResult {
  section: EvalSection;
  generated_text: string;
  prompt_version_label: string;
  fmt_version: number;
  current_month: string;
  prev_month: string;
}
