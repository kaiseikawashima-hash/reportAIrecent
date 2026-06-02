import type {
  AgeGender,
  ExcelParseResult,
  KpiAgeDistribution,
  KpiGenderRatio,
  KpiSummary,
  PostDetail,
  RegionData,
} from "@/lib/types";

// ==========================================
// Phase 3.7: ExcelParseResult → KpiSummary 変換
// ==========================================

const EMPTY_AGE_DISTRIBUTION: KpiAgeDistribution = {
  "13-17": 0,
  "18-24": 0,
  "25-34": 0,
  "35-44": 0,
  "45-54": 0,
  "55-64": 0,
  "65+": 0,
};

const AGE_BUCKETS: Array<keyof KpiAgeDistribution> = [
  "13-17",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
];

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function avgFrom(total: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(total / count);
}

/**
 * "25-34", "25〜34", "25-34歳" 等のラベルを KpiAgeDistribution のキーへマッピング。
 * - "65+" / "65以上" / "65 歳以上" 等は "65+"
 * - 範囲ラベルが見つからない場合は null
 */
function mapAgeLabel(raw: string): keyof KpiAgeDistribution | null {
  const s = raw.replace(/\s+/g, "");
  if (/65[+＋]/.test(s) || /65以上/.test(s) || /65歳以上/.test(s)) return "65+";

  const m = s.match(/(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (Number.isNaN(lo) || Number.isNaN(hi)) return null;
  // 範囲が完全一致するバケットを優先
  for (const bucket of AGE_BUCKETS) {
    if (bucket === "65+") continue;
    const [bLo, bHi] = bucket.split("-").map(Number);
    if (lo === bLo && hi === bHi) return bucket;
  }
  // 中心値でフォールバック
  const mid = (lo + hi) / 2;
  if (mid < 18) return "13-17";
  if (mid < 25) return "18-24";
  if (mid < 35) return "25-34";
  if (mid < 45) return "35-44";
  if (mid < 55) return "45-54";
  if (mid < 65) return "55-64";
  return "65+";
}

function buildGenderRatio(rows: AgeGender[]): KpiGenderRatio {
  return {
    male: sum(rows.map((r) => r.male)),
    female: sum(rows.map((r) => r.female)),
  };
}

function buildAgeDistribution(rows: AgeGender[]): KpiAgeDistribution {
  const dist: KpiAgeDistribution = { ...EMPTY_AGE_DISTRIBUTION };
  for (const r of rows) {
    const key = mapAgeLabel(r.age);
    if (!key) continue;
    dist[key] += r.total || r.male + r.female;
  }
  return dist;
}

function formatEngagementRate(engagement: number, reach: number): string {
  if (reach <= 0) return "0.0%";
  const rate = (engagement / reach) * 100;
  return `${rate.toFixed(1)}%`;
}

function topN<T>(items: T[], n: number, getValue: (item: T) => number): T[] {
  return [...items].sort((a, b) => getValue(b) - getValue(a)).slice(0, n);
}

function postsSum(posts: PostDetail[], key: keyof PostDetail): number {
  return posts.reduce((acc, p) => {
    const v = p[key];
    return acc + (typeof v === "number" ? v : 0);
  }, 0);
}

// ==========================================
// メイン
// ==========================================

export function excelToKpiSummary(parsed: ExcelParseResult): KpiSummary {
  const { summary, feed_posts, reel_posts, demographics, monthly_trends, target_month } = parsed;

  // Phase 3.7.1: 当月の monthly_trends 行から内訳合計を取得し、投稿数で割って平均を算出
  const currentTrend =
    monthly_trends.find((t) => t.year_month === target_month) ??
    monthly_trends[monthly_trends.length - 1] ??
    null;

  const feedPostCount = feed_posts.length;
  const reelPostCount = reel_posts.length;

  const feedReachAvg = avgFrom(currentTrend?.reach_feed ?? 0, feedPostCount);
  const reelReachAvg = avgFrom(currentTrend?.reach_reel ?? 0, reelPostCount);
  const feedViewAvg = avgFrom(currentTrend?.view_feed ?? 0, feedPostCount);
  const reelViewAvg = avgFrom(currentTrend?.view_reel ?? 0, reelPostCount);

  const likesTotal = postsSum(feed_posts, "likes") + postsSum(reel_posts, "likes");
  const savesTotal = postsSum(feed_posts, "saves") + postsSum(reel_posts, "saves");
  const commentsFromPosts =
    postsSum(feed_posts, "comments") + postsSum(reel_posts, "comments");
  const commentsTotal = summary.comments > 0 ? summary.comments : commentsFromPosts;

  const topPrefectures: RegionData[] = topN(demographics.prefectures, 10, (r) => r.value);
  const topCities: RegionData[] = topN(demographics.cities, 10, (r) => r.value);

  return {
    // 既存5項目（互換性維持）
    follower: summary.follower,
    view: summary.view,
    reach: summary.reach,
    engagement: summary.engagement,
    post_count: summary.post_count,

    // フォロワー分析用
    follower_net_increase: 0, // 前月比較が必要なため calc-diff 側で扱う
    gender_ratio: buildGenderRatio(demographics.age_gender),
    age_distribution: buildAgeDistribution(demographics.age_gender),
    top_prefectures: topPrefectures,
    top_cities: topCities,

    // Phase 4a: 推移グラフ用内訳（summary は推移データ当月行由来の値を保持済み）
    view_reel: summary.view_reel,
    view_feed: summary.view_feed,
    reach_reel: summary.reach_reel,
    reach_feed: summary.reach_feed,
    engagement_reel: summary.engagement_reel,
    engagement_feed: summary.engagement_feed,

    // リーチ分析用
    feed_reach_avg: feedReachAvg,
    reel_reach_avg: reelReachAvg,
    feed_view_avg: feedViewAvg,
    reel_view_avg: reelViewAvg,
    feed_post_count: feedPostCount,
    reel_post_count: reelPostCount,
    engagement_rate: formatEngagementRate(summary.engagement, summary.reach),
    likes_total: likesTotal,
    saves_total: savesTotal,
    comments_total: commentsTotal,

    // アカウント分析用（推移データ当月行から取得した summary を優先、空なら currentTrend）
    profile_access: summary.profile_access || currentTrend?.profile_access || 0,
    link_clicks: summary.link_clicks || currentTrend?.link_clicks || 0,
  };
}
