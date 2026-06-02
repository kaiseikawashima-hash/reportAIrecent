"use client";

// ==========================================
// Phase 4a:【1】サマリー
// KPI推移表（直近1年）+ 当月実績テーブル（実績/前月比 自動）
// ※ 目標/要因/次月対策の編集列は Phase 4b で対応
// ==========================================

import type { KpiHistoryPoint } from "@/lib/report/types";
import { pickKpiNumber } from "@/lib/report/kpi-history";
import KpiHistoryTable from "@/components/report/KpiHistoryTable";

const METRIC_ROWS: Array<{ key: string; label: string }> = [
  { key: "follower", label: "フォロワー" },
  { key: "view", label: "ビュー" },
  { key: "reach", label: "リーチ" },
  { key: "engagement", label: "エンゲージメント" },
  { key: "profile_access", label: "プロフィールアクセス" },
  { key: "link_clicks", label: "リンククリック" },
  { key: "post_count", label: "投稿数" },
];

function diffRate(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return "-";
  if (prev === 0) return current === 0 ? "0.0%" : "+∞%";
  const rate = ((current - prev) / prev) * 100;
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`;
}

export default function SummarySection({
  points,
  targetMonth,
}: {
  points: KpiHistoryPoint[];
  targetMonth: string; // "YYYY/MM"（空なら当月実績テーブルは省略）
}) {
  const targetIdx = points.findIndex((p) => p.year_month === targetMonth);
  const current = targetIdx >= 0 ? points[targetIdx] : null;
  const prev = targetIdx > 0 ? points[targetIdx - 1] : null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">
          KPI推移表（直近1年・蓄積月のみ）
        </p>
        <KpiHistoryTable points={points} months={12} />
      </div>

      {current && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-2">
            当月実績（{targetMonth}）
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full whitespace-nowrap">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="text-left py-2 px-2 font-medium">指標</th>
                  <th className="text-right py-2 px-2 font-medium">実績</th>
                  <th className="text-right py-2 px-2 font-medium">
                    前月比{prev ? `（${prev.year_month}比）` : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((m) => {
                  const cur = pickKpiNumber(current.kpi, m.key);
                  const prevValue = prev ? pickKpiNumber(prev.kpi, m.key) : null;
                  const rate = diffRate(cur, prevValue);
                  return (
                    <tr key={m.key} className="border-b last:border-b-0">
                      <td className="py-1.5 px-2 text-gray-700">{m.label}</td>
                      <td className="py-1.5 px-2 text-right text-gray-900">
                        {cur === null ? "-" : cur.toLocaleString()}
                      </td>
                      <td
                        className={`py-1.5 px-2 text-right ${
                          rate.startsWith("+")
                            ? "text-emerald-600"
                            : rate.startsWith("-")
                            ? "text-red-600"
                            : "text-gray-500"
                        }`}
                      >
                        {rate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
