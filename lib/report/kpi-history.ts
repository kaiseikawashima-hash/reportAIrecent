// ==========================================
// Phase 4a: knowledge_base の kpi_summary から
// 推移グラフ・KPI推移表用のデータを組み立てるヘルパー
// ==========================================

import type { MonthlyTrend } from "@/lib/types";
import type {
  KpiHistoryPoint,
  ManualKpiEntry,
  TrendKpiKey,
} from "@/lib/report/types";

/**
 * jsonb の kpi_summary から数値を安全に取り出す。
 * 過去レコードはキー欠落・文字列混入があり得るため null 許容。
 */
export function pickKpiNumber(
  kpi: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  if (!kpi) return null;
  const v = kpi[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,%]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

interface RawKnowledgeRow {
  year_month: string;
  kpi_summary: Record<string, unknown> | null;
  report_text: string | null;
  created_at: string;
}

/**
 * 同一 year_month の重複レコードは created_at が最新のものを採用し、
 * 年月昇順の履歴ポイント配列へ変換する。
 */
export function buildHistoryPoints(rows: RawKnowledgeRow[]): KpiHistoryPoint[] {
  const byMonth = new Map<string, RawKnowledgeRow>();
  for (const row of rows) {
    const existing = byMonth.get(row.year_month);
    if (!existing || row.created_at > existing.created_at) {
      byMonth.set(row.year_month, row);
    }
  }
  return [...byMonth.values()]
    .sort((a, b) => a.year_month.localeCompare(b.year_month))
    .map((row) => ({
      year_month: row.year_month,
      kpi: row.kpi_summary ?? {},
      has_report: Boolean(row.report_text?.trim()),
    }));
}

/** Recharts に渡す1行分のデータ（値が無い月のキーは省略 = 線が繋がらない） */
export type TrendChartRow = { year_month: string } & Partial<
  Record<TrendKpiKey, number>
>;

/**
 * 履歴ポイントから指定キーの推移系列を作る。
 * knowledge_base に存在する月だけを点とし、値が無い月のキーは undefined のまま。
 */
export function buildTrendRows(
  points: KpiHistoryPoint[],
  keys: TrendKpiKey[]
): TrendChartRow[] {
  return points.map((p) => {
    const row: TrendChartRow = { year_month: p.year_month };
    for (const key of keys) {
      const v = pickKpiNumber(p.kpi, key);
      if (v !== null) row[key] = v;
    }
    return row;
  });
}

/** 指定キーについて値を持つ点の数（「データ蓄積中」判定用） */
export function countDataPoints(
  rows: TrendChartRow[],
  keys: TrendKpiKey[]
): number {
  return rows.filter((r) => keys.some((k) => typeof r[k] === "number")).length;
}

/** 直近 n ヶ月分に絞る（KPI推移表の「直近1年」用） */
export function lastNMonths(
  points: KpiHistoryPoint[],
  n: number
): KpiHistoryPoint[] {
  return points.slice(-n);
}

/** "YYYY/MM" を月通し番号（year*12 + month）に変換。形式不正なら null */
export function monthIndex(yearMonth: string): number | null {
  const m = yearMonth.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 12 + Number(m[2]);
}

/**
 * 対象月（targetMonth）を終点に、そこから遡って monthsInclusive ヶ月分の範囲へ絞る。
 * - 対象月より未来の月は除外
 * - 範囲内でも knowledge_base に存在する月だけを残す（欠月は枠を作らない）
 * - targetMonth が "YYYY/MM" でない場合は窓化せず元の配列を返す（フォールバック）
 *
 * 例: targetMonth="2026/05", monthsInclusive=13 → 2025/06〜2026/05 の存在月のみ
 */
export function windowByTargetMonth(
  points: KpiHistoryPoint[],
  targetMonth: string,
  monthsInclusive = 13
): KpiHistoryPoint[] {
  const end = monthIndex(targetMonth);
  if (end === null) return points;
  const start = end - (monthsInclusive - 1);
  return points.filter((p) => {
    const idx = monthIndex(p.year_month);
    return idx !== null && idx >= start && idx <= end;
  });
}

/**
 * フォロワー純増（当月 − 前月）を月ごとに計算する。
 * 前月の値が履歴に無い月は null（既知の課題: kpi_summary 上の
 * follower_net_increase は 0 のままのため、ここで明示的に算出する）。
 */
export function computeNetIncrease(
  points: KpiHistoryPoint[]
): Map<string, number | null> {
  const result = new Map<string, number | null>();
  for (let i = 0; i < points.length; i++) {
    const current = pickKpiNumber(points[i].kpi, "follower");
    const prev = i > 0 ? pickKpiNumber(points[i - 1].kpi, "follower") : null;
    const isConsecutive =
      i > 0 && isPrevMonth(points[i - 1].year_month, points[i].year_month);
    if (current !== null && prev !== null && isConsecutive) {
      result.set(points[i].year_month, current - prev);
    } else {
      result.set(points[i].year_month, null);
    }
  }
  return result;
}

/**
 * Excel の monthly_trends（複数月入りエクスポート）を
 * 手打ち入力APIと同じ ManualKpiEntry[] へ変換する。
 * - 12キーは MonthlyTrend と1対1対応（view_total→view 等）
 * - excludeMonth（通常は当月。レポート保存側で完全な kpi_summary が入るため）を除外
 * - 同一月が複数行ある場合は後の行を採用
 */
export function monthlyTrendsToManualEntries(
  trends: MonthlyTrend[],
  excludeMonth?: string
): ManualKpiEntry[] {
  const byMonth = new Map<string, ManualKpiEntry>();
  for (const t of trends) {
    if (!/^\d{4}\/(0[1-9]|1[0-2])$/.test(t.year_month)) continue;
    if (excludeMonth && t.year_month === excludeMonth) continue;
    byMonth.set(t.year_month, {
      year_month: t.year_month,
      values: {
        follower: t.follower,
        view: t.view_total,
        view_reel: t.view_reel,
        view_feed: t.view_feed,
        reach: t.reach_total,
        reach_reel: t.reach_reel,
        reach_feed: t.reach_feed,
        engagement: t.engagement_total,
        engagement_reel: t.engagement_reel,
        engagement_feed: t.engagement_feed,
        profile_access: t.profile_access,
        link_clicks: t.link_clicks,
      },
    });
  }
  return [...byMonth.values()].sort((a, b) =>
    a.year_month.localeCompare(b.year_month)
  );
}

/** a が b の直前月（"2026/02" → "2026/03"）かを判定 */
function isPrevMonth(a: string, b: string): boolean {
  const ma = a.match(/^(\d{4})\/(\d{2})$/);
  const mb = b.match(/^(\d{4})\/(\d{2})$/);
  if (!ma || !mb) return false;
  const monthsA = Number(ma[1]) * 12 + Number(ma[2]);
  const monthsB = Number(mb[1]) * 12 + Number(mb[2]);
  return monthsB - monthsA === 1;
}
