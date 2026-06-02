"use client";

// ==========================================
// Phase 4a: KPI推移表（直近1年・knowledge_base 蓄積月から自動生成）
// 純増は kpi_summary の follower_net_increase が 0 のままの既知課題があるため
// 「当月フォロワー − 前月フォロワー」をここで明示的に計算して表示する
// ==========================================

import type { KpiHistoryPoint } from "@/lib/report/types";
import {
  computeNetIncrease,
  lastNMonths,
  pickKpiNumber,
} from "@/lib/report/kpi-history";

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "follower", label: "フォロワー" },
  { key: "net_increase", label: "純増" },
  { key: "view", label: "ビュー" },
  { key: "reach", label: "リーチ" },
  { key: "engagement", label: "ENG" },
  { key: "profile_access", label: "プロフアクセス" },
  { key: "link_clicks", label: "リンククリック" },
  { key: "post_count", label: "投稿数" },
];

function formatCell(value: number | null): string {
  return value === null ? "-" : value.toLocaleString();
}

export default function KpiHistoryTable({
  points,
  months = 12,
}: {
  points: KpiHistoryPoint[];
  months?: number;
}) {
  const recent = lastNMonths(points, months);
  const netIncrease = computeNetIncrease(points);

  if (recent.length === 0) {
    return (
      <p className="text-xs text-gray-400 py-4 text-center">
        まだ蓄積データがありません（保存すると推移表に反映されます）
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full whitespace-nowrap">
        <thead>
          <tr className="border-b bg-gray-50 text-gray-600">
            <th className="text-left py-2 px-2 font-medium">年月</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="text-right py-2 px-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recent.map((p) => (
            <tr key={p.year_month} className="border-b last:border-b-0">
              <td className="py-1.5 px-2 text-gray-900 font-medium">
                {p.year_month}
              </td>
              {COLUMNS.map((c) => {
                const value =
                  c.key === "net_increase"
                    ? netIncrease.get(p.year_month) ?? null
                    : pickKpiNumber(p.kpi, c.key);
                const positive = c.key === "net_increase" && value !== null && value > 0;
                const negative = c.key === "net_increase" && value !== null && value < 0;
                return (
                  <td
                    key={c.key}
                    className={`py-1.5 px-2 text-right ${
                      positive
                        ? "text-emerald-600"
                        : negative
                        ? "text-red-600"
                        : "text-gray-800"
                    }`}
                  >
                    {c.key === "net_increase" && value !== null && value > 0
                      ? `+${value.toLocaleString()}`
                      : formatCell(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
