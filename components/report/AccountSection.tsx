"use client";

// ==========================================
// Phase 4a4:【4】アカウント分析（FMT 準拠）
// - 当月サマリーカード（プロフィールアクセス / リンククリック）※従来通り
// - 先月vs当月の比較テーブル（当月実績 / 前月実績 / 前月比）
// - 当月の日別折れ線（プロフィールアクセス / リンククリック）
// ※ 月次13ヶ月推移折れ線は廃止（当該指標は過去がほぼ0で実態・FMTに合わないため）
// ==========================================

import type { DailyAccount, KpiSummary } from "@/lib/types";
import { pickKpiNumber } from "@/lib/report/kpi-history";
import { DailyAccountLineChart } from "@/components/report/charts";

const COMPARE_ROWS: Array<{ key: "profile_access" | "link_clicks"; label: string }> = [
  { key: "profile_access", label: "プロフィールアクセス" },
  { key: "link_clicks", label: "リンククリック" },
];

function diffRate(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return "N/A";
  if (prev === 0) return current === 0 ? "0.0%" : "+∞%";
  const rate = ((current - prev) / prev) * 100;
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`;
}

export default function AccountSection({
  currentKpi,
  prevKpi,
  prevMonth,
  daily,
}: {
  currentKpi: KpiSummary | null;
  prevKpi: Record<string, unknown> | null; // 前月レコードの kpi_summary
  prevMonth: string | null; // 前月ラベル "YYYY/MM"
  daily: DailyAccount[];
}) {
  return (
    <div className="space-y-4">
      {currentKpi && (
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500">プロフィールアクセス</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {currentKpi.profile_access.toLocaleString()}
            </p>
          </div>
          <div className="border rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500">リンククリック</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {currentKpi.link_clicks.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* 先月vs当月 比較テーブル（FMT「アクセスクリック数」相当） */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">
          アクセス・クリック数（先月比）
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full whitespace-nowrap">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="text-left py-2 px-2 font-medium">指標</th>
                <th className="text-right py-2 px-2 font-medium">当月実績</th>
                <th className="text-right py-2 px-2 font-medium">
                  前月実績{prevMonth ? `（${prevMonth}）` : ""}
                </th>
                <th className="text-right py-2 px-2 font-medium">前月比</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((m) => {
                const cur = currentKpi
                  ? pickKpiNumber(currentKpi as unknown as Record<string, unknown>, m.key)
                  : null;
                const prev = prevKpi ? pickKpiNumber(prevKpi, m.key) : null;
                const rate = diffRate(cur, prev);
                return (
                  <tr key={m.key} className="border-b last:border-b-0">
                    <td className="py-1.5 px-2 text-gray-700">{m.label}</td>
                    <td className="py-1.5 px-2 text-right text-gray-900">
                      {cur === null ? "-" : cur.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-600">
                      {prev === null ? "-" : prev.toLocaleString()}
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
        {!prevKpi && (
          <p className="text-[11px] text-gray-400 mt-1">
            前月レコードがないため前月比は N/A です
          </p>
        )}
      </div>

      {/* 当月の日別推移 */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">
          プロフィールアクセス / リンククリック 当月日別推移
        </p>
        <DailyAccountLineChart data={daily} />
      </div>
    </div>
  );
}
