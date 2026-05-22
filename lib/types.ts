// ==========================================
// ExcelParseAgent 出力型
// ==========================================

export interface ExcelSummary {
  follower: number;
  view: number;
  reach: number;
  engagement: number;
  post_count: number;
}

export interface MonthlyTrend {
  year_month: string;
  follower: number;
  view_total: number;
  view_reel: number;
  view_feed: number;
  reach_total: number;
  engagement_total: number;
}

export interface PostRanking {
  rank: number;
  title: string;
  reach: number;
  engagement: number;
  eng_rate: string;
  url: string;
}

export interface PostDetail {
  title: string;
  post_date: string;
  view: number;
  reach: number;
  engagement: number;
  eng_rate: number;
  likes: number;
  saves: number;
}

export interface AgeGender {
  age: string;
  male: number;
  female: number;
  total: number;
}

export interface RegionData {
  name: string;
  value: number;
  ratio: string;
}

export interface Demographics {
  age_gender: AgeGender[];
  prefectures: RegionData[];
  cities: RegionData[];
}

export interface ExcelParseResult {
  summary: ExcelSummary;
  monthly_trends: MonthlyTrend[];
  feed_ranking: PostRanking[];
  reel_ranking: PostRanking[];
  feed_posts: PostDetail[];
  reel_posts: PostDetail[];
  demographics: Demographics;
  target_month: string;
}

// ==========================================
// DiffCalcAgent 出力型
// ==========================================

export interface KpiDiffItem {
  current: number;
  prev: number;
  diff_rate: string;
  trend: string;
}

export interface DiffCalcResult {
  current_month: string;
  prev_month: string;
  kpi_diff: {
    view: KpiDiffItem;
    reach: KpiDiffItem;
    follower: KpiDiffItem;
    engagement: KpiDiffItem;
  };
  top_feed: { title: string; eng_rate: string };
  top_reel: { title: string; eng_rate: string };
  worst_feed: { title: string; eng_rate: string };
  demographics_summary: string;
}

// ==========================================
// DB型
// ==========================================

export type ClientPlan = "standard" | "advance";

export interface Client {
  id: string;
  name: string;
  area: string | null;
  hp_url: string | null;
  operator_memo: string | null;
  auto_memo: string | null;
  plan: ClientPlan;
  created_at: string;
  updated_at: string;
}

export interface MasterFmt {
  id: string;
  version: number;
  content: string;
  is_active: boolean;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  client_id: string | null;
  year_month: string;
  fmt_version: number;
  kpi_summary: Record<string, unknown> | null;
  top_posts: Record<string, unknown> | null;
  report_text: string | null;
  created_at: string;
}

export interface BestPractice {
  id: string;
  knowledge_base_id: string;
  client_id: string | null;
  year_month: string;
  reason: string | null;
  created_at: string;
}
