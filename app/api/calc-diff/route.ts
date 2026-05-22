import { NextRequest, NextResponse } from "next/server";
import type {
  ExcelParseResult,
  DiffCalcResult,
  KpiDiffItem,
  MonthlyTrend,
} from "@/lib/types";

// ==========================================
// ヘルパー関数
// ==========================================

function calcDiffRate(current: number, prev: number): string {
  if (prev === 0) return current === 0 ? "0.0%" : "+∞%";
  const rate = ((current - prev) / prev) * 100;
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
}

/**
 * 直近3ヶ月のトレンドを判定
 * 対象の値を抽出する関数を受け取り、「上昇」「下降」「横ばい」を返す
 */
function calcTrend(trends: MonthlyTrend[], getValue: (t: MonthlyTrend) => number): string {
  if (trends.length < 3) return "データ不足";

  const recent3 = trends.slice(-3).map(getValue);
  const increasing = recent3[0] < recent3[1] && recent3[1] < recent3[2];
  const decreasing = recent3[0] > recent3[1] && recent3[1] > recent3[2];

  if (increasing) return "3ヶ月連続上昇";
  if (decreasing) return "3ヶ月連続下降";

  const diff01 = recent3[1] - recent3[0];
  const diff12 = recent3[2] - recent3[1];
  const avg = (recent3[0] + recent3[1] + recent3[2]) / 3;

  if (avg === 0) return "横ばい";

  const volatility = (Math.abs(diff01) + Math.abs(diff12)) / 2 / avg;
  if (volatility < 0.05) return "横ばい";

  if (diff12 > 0) return "直近上昇";
  return "直近下降";
}

function buildKpiDiff(
  trends: MonthlyTrend[],
  getValue: (t: MonthlyTrend) => number
): KpiDiffItem {
  if (trends.length < 2) {
    const current = trends.length > 0 ? getValue(trends[trends.length - 1]) : 0;
    return { current, prev: 0, diff_rate: "N/A", trend: "データ不足" };
  }

  const current = getValue(trends[trends.length - 1]);
  const prev = getValue(trends[trends.length - 2]);

  return {
    current,
    prev,
    diff_rate: calcDiffRate(current, prev),
    trend: calcTrend(trends, getValue),
  };
}

/**
 * デモグラフィクスを「35-54歳中心、青森県64%」のような要約テキストに変換
 */
function summarizeDemographics(data: ExcelParseResult["demographics"]): string {
  const parts: string[] = [];

  // 年齢: totalが最大の年齢帯を抽出
  if (data.age_gender.length > 0) {
    const sorted = [...data.age_gender].sort((a, b) => b.total - a.total);
    const top2 = sorted.slice(0, 2).map((a) => a.age);
    parts.push(`${top2.join("・")}歳中心`);
  }

  // 都道府県: 上位1~2件
  if (data.prefectures.length > 0) {
    const sorted = [...data.prefectures].sort((a, b) => b.value - a.value);
    const top = sorted[0];
    parts.push(`${top.name}${top.ratio}`);
    if (sorted.length > 1) {
      parts.push(`${sorted[1].name}${sorted[1].ratio}`);
    }
  }

  return parts.join("、") || "デモグラフィクスデータなし";
}

// ==========================================
// メインハンドラ
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const body: ExcelParseResult = await request.json();
    const { monthly_trends, feed_ranking, reel_ranking, feed_posts, demographics } = body;

    if (monthly_trends.length === 0) {
      return NextResponse.json({ error: "月次推移データがありません" }, { status: 400 });
    }

    const currentMonth = monthly_trends[monthly_trends.length - 1].year_month;
    const prevMonth = monthly_trends.length >= 2
      ? monthly_trends[monthly_trends.length - 2].year_month
      : "";

    // KPI差分計算
    const kpiDiff = {
      view: buildKpiDiff(monthly_trends, (t) => t.view_total),
      reach: buildKpiDiff(monthly_trends, (t) => t.reach_total),
      follower: buildKpiDiff(monthly_trends, (t) => t.follower),
      engagement: buildKpiDiff(monthly_trends, (t) => t.engagement_total),
    };

    // TOP / ワースト投稿
    const topFeed = feed_ranking.length > 0
      ? { title: feed_ranking[0].title, eng_rate: feed_ranking[0].eng_rate }
      : { title: "データなし", eng_rate: "0%" };

    const topReel = reel_ranking.length > 0
      ? { title: reel_ranking[0].title, eng_rate: reel_ranking[0].eng_rate }
      : { title: "データなし", eng_rate: "0%" };

    // ワースト: feed_postsからeng_rateが最低のものを取得
    const worstFeed = feed_posts.length > 0
      ? (() => {
          const sorted = [...feed_posts].sort((a, b) => a.eng_rate - b.eng_rate);
          return { title: sorted[0].title, eng_rate: `${sorted[0].eng_rate}%` };
        })()
      : { title: "データなし", eng_rate: "0%" };

    const result: DiffCalcResult = {
      current_month: currentMonth,
      prev_month: prevMonth,
      kpi_diff: kpiDiff,
      top_feed: topFeed,
      top_reel: topReel,
      worst_feed: worstFeed,
      demographics_summary: summarizeDemographics(demographics),
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "差分計算中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
