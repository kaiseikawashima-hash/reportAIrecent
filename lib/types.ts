// ==========================================
// ExcelParseAgent 出力型
// ==========================================

export interface ExcelSummary {
  follower: number;
  view: number;
  reach: number;
  engagement: number;
  post_count: number;
  comments: number;
  profile_access: number;
  link_clicks: number;
  // Phase 3.7.1: 推移データ当月行から取得した内訳（リール/フィード別）
  view_reel: number;
  view_feed: number;
  reach_reel: number;
  reach_feed: number;
  engagement_reel: number;
  engagement_feed: number;
}

export interface MonthlyTrend {
  year_month: string;
  follower: number;
  view_total: number;
  view_reel: number;
  view_feed: number;
  reach_total: number;
  // Phase 3.7.1: リール/フィード内訳と当月固有指標
  reach_reel: number;
  reach_feed: number;
  engagement_total: number;
  engagement_reel: number;
  engagement_feed: number;
  profile_access: number;
  link_clicks: number;
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
  comments: number;
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
  excel_parsed: Record<string, unknown> | null;
  report_text: string | null;
  created_at: string;
}

// ==========================================
// Phase 3.7: 拡充版 kpi_summary
// 既存5キー（follower / view / reach / engagement / post_count）は互換性のため固定。
// 追加項目は欠落許容。
// ==========================================

export interface KpiGenderRatio {
  male: number;
  female: number;
}

export interface KpiAgeDistribution {
  "13-17": number;
  "18-24": number;
  "25-34": number;
  "35-44": number;
  "45-54": number;
  "55-64": number;
  "65+": number;
}

export interface KpiSummary {
  // 既存5項目（互換性維持）
  follower: number;
  view: number;
  reach: number;
  engagement: number;
  post_count: number;

  // フォロワー分析用
  follower_net_increase: number;
  gender_ratio: KpiGenderRatio;
  age_distribution: KpiAgeDistribution;
  top_prefectures: RegionData[];
  top_cities: RegionData[];

  // Phase 4a: 推移グラフ用内訳（当月Excelの推移データ行から取得。過去レコードは欠落許容）
  view_reel: number;
  view_feed: number;
  reach_reel: number;
  reach_feed: number;
  engagement_reel: number;
  engagement_feed: number;

  // リーチ分析用
  feed_reach_avg: number;
  reel_reach_avg: number;
  feed_view_avg: number;
  reel_view_avg: number;
  feed_post_count: number;
  reel_post_count: number;
  engagement_rate: string;
  likes_total: number;
  saves_total: number;
  comments_total: number;

  // アカウント分析用
  profile_access: number;
  link_clicks: number;
}

export interface BestPractice {
  id: string;
  knowledge_base_id: string;
  client_id: string | null;
  year_month: string;
  reason: string | null;
  created_at: string;
}
