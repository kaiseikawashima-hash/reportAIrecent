import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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
// Phase 3.7: knowledge_base 参照型の前月比計算
// ==========================================

type KpiKey = "view" | "reach" | "follower" | "engagement";

function pickKpi(kpi: Record<string, unknown> | null | undefined, key: KpiKey): number | null {
  if (!kpi) return null;
  const v = kpi[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,%]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * 前月レコードが見つからない場合の KpiDiffItem を作成
 */
function buildMissingPrevKpi(current: number): KpiDiffItem {
  return {
    current,
    prev: 0,
    diff_rate: "N/A",
    trend: "データ不足（前月レコードなし）",
  };
}

/**
 * 前月レコードの kpi_summary に当該キーが無い場合の KpiDiffItem を作成
 */
function buildPartialPrevKpi(current: number, key: KpiKey): KpiDiffItem {
  return {
    current,
    prev: 0,
    diff_rate: "N/A",
    trend: `データ不足（前月の${key}未保存）`,
  };
}

/**
 * "2026/03" → "2026/02"
 */
function prevYearMonthSlash(yearMonthSlash: string): string | null {
  const match = yearMonthSlash.match(/^(\d{4})\/(0[1-9]|1[0-2])$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (m === 1) return `${y - 1}/12`;
  return `${y}/${String(m - 1).padStart(2, "0")}`;
}

interface KbReferenceResult {
  prevMonth: string;
  prevKpi: Record<string, unknown> | null;
  found: boolean;
}

async function fetchPrevKnowledgeBase(
  clientId: string,
  targetMonth: string
): Promise<KbReferenceResult> {
  const prevMonth = prevYearMonthSlash(targetMonth) ?? "";
  if (!prevMonth) {
    return { prevMonth: "", prevKpi: null, found: false };
  }

  const { data, error } = await supabase
    .from("knowledge_base")
    .select("kpi_summary")
    .eq("client_id", clientId)
    .eq("year_month", prevMonth)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { prevMonth, prevKpi: null, found: false };
  }
  return {
    prevMonth,
    prevKpi: (data.kpi_summary as Record<string, unknown> | null) ?? null,
    found: true,
  };
}

function buildKpiDiffFromKb(
  currentExcel: { view: number; reach: number; follower: number; engagement: number },
  trends: MonthlyTrend[],
  prevKpi: Record<string, unknown> | null,
  found: boolean
): DiffCalcResult["kpi_diff"] {
  function build(key: KpiKey, current: number): KpiDiffItem {
    if (!found || !prevKpi) {
      return buildMissingPrevKpi(current);
    }
    const prev = pickKpi(prevKpi, key);
    if (prev === null) {
      return buildPartialPrevKpi(current, key);
    }
    return {
      current,
      prev,
      diff_rate: calcDiffRate(current, prev),
      trend:
        trends.length >= 3
          ? calcTrend(
              trends,
              key === "view"
                ? (t) => t.view_total
                : key === "reach"
                ? (t) => t.reach_total
                : key === "follower"
                ? (t) => t.follower
                : (t) => t.engagement_total
            )
          : (current > prev ? "上昇" : current < prev ? "下降" : "横ばい"),
    };
  }

  return {
    view: build("view", currentExcel.view),
    reach: build("reach", currentExcel.reach),
    follower: build("follower", currentExcel.follower),
    engagement: build("engagement", currentExcel.engagement),
  };
}

// ==========================================
// メインハンドラ
// ==========================================

interface CalcDiffRequest extends ExcelParseResult {
  client_id?: string;
  target_month_override?: string; // "YYYY/MM" — excel.target_month が信頼できない場合用
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CalcDiffRequest;
    const {
      monthly_trends,
      feed_ranking,
      reel_ranking,
      feed_posts,
      demographics,
      summary,
      target_month,
      client_id,
      target_month_override,
    } = body;

    const currentMonth =
      target_month_override && /^\d{4}\/(0[1-9]|1[0-2])$/.test(target_month_override)
        ? target_month_override
        : target_month ||
          (monthly_trends.length > 0
            ? monthly_trends[monthly_trends.length - 1].year_month
            : "");

    let kpiDiff: DiffCalcResult["kpi_diff"];
    let prevMonth = "";

    if (client_id && currentMonth) {
      // 新方式: knowledge_base から前月の kpi_summary を取得
      const { prevMonth: pm, prevKpi, found } = await fetchPrevKnowledgeBase(
        client_id,
        currentMonth
      );
      prevMonth = pm;
      kpiDiff = buildKpiDiffFromKb(
        {
          view: summary.view,
          reach: summary.reach,
          follower: summary.follower,
          engagement: summary.engagement,
        },
        monthly_trends,
        prevKpi,
        found
      );
    } else {
      // 旧方式（後方互換）: Excel 内の monthly_trends から前月比
      if (monthly_trends.length === 0) {
        return NextResponse.json({ error: "月次推移データがありません" }, { status: 400 });
      }
      prevMonth =
        monthly_trends.length >= 2
          ? monthly_trends[monthly_trends.length - 2].year_month
          : "";
      kpiDiff = {
        view: buildKpiDiff(monthly_trends, (t) => t.view_total),
        reach: buildKpiDiff(monthly_trends, (t) => t.reach_total),
        follower: buildKpiDiff(monthly_trends, (t) => t.follower),
        engagement: buildKpiDiff(monthly_trends, (t) => t.engagement_total),
      };
    }

    // TOP / ワースト投稿
    const topFeed = feed_ranking.length > 0
      ? { title: feed_ranking[0].title, eng_rate: feed_ranking[0].eng_rate }
      : { title: "データなし", eng_rate: "0%" };

    const topReel = reel_ranking.length > 0
      ? { title: reel_ranking[0].title, eng_rate: reel_ranking[0].eng_rate }
      : { title: "データなし", eng_rate: "0%" };

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
