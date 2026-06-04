"use client";

// ==========================================
// Phase 4a:【1】サマリー
// Phase 4a6: 当月実績テーブルを FMT 準拠の5列構成へ拡張
//   指標 / 目標 / 実績 / 前月比 / 要因 / 次月対策
//   - 実績・前月比: 自動（kpi_summary / 前月レコード）
//   - 目標: 手入力（kpi_summary.goals に保存）
//   - 要因 / 次月対策: AI生成 → 手編集（kpi_summary.factors / next_actions に保存）
// KPI推移表（直近1年）・総括考察テキストは従来通り（別管理）。
// ==========================================

import type { KpiHistoryPoint } from "@/lib/report/types";
import { pickKpiNumber } from "@/lib/report/kpi-history";
import { SUMMARY_METRICS } from "@/lib/report/summary-metrics";
import KpiHistoryTable from "@/components/report/KpiHistoryTable";

function diffRate(current: number | null, prev: number | null): string {
  if (current === null || prev === null) return "-";
  if (prev === 0) return current === 0 ? "0.0%" : "+∞%";
  const rate = ((current - prev) / prev) * 100;
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`;
}

export interface SummaryMetaHandlers {
  goals: Record<string, string>;
  factors: Record<string, string>;
  nextActions: Record<string, string>;
  onGoalChange: (key: string, value: string) => void;
  onFactorChange: (key: string, value: string) => void;
  onNextActionChange: (key: string, value: string) => void;
  onGenerateMetrics: () => void;
  generatingMetrics: boolean;
  onSaveMeta: () => void;
  savingMeta: boolean;
  metaMessage: string | null;
  metaError: string | null;
  canGenerateMetrics: boolean;
}

export default function SummarySection({
  points,
  targetMonth,
  meta,
}: {
  points: KpiHistoryPoint[];
  targetMonth: string; // "YYYY/MM"（空なら指標テーブルは省略）
  meta: SummaryMetaHandlers;
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
        {/* points は対象月起点の直近13ヶ月へ絞り込み済み。全範囲を表示する */}
        <KpiHistoryTable points={points} months={13} />
      </div>

      {targetMonth && (
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <p className="text-xs font-medium text-gray-700">
              当月実績（{targetMonth}）— 指標 / 目標 / 実績 / 前月比 / 要因 / 次月対策
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={meta.onGenerateMetrics}
                disabled={meta.generatingMetrics || !meta.canGenerateMetrics}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                  !meta.generatingMetrics && meta.canGenerateMetrics
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {meta.generatingMetrics ? "生成中..." : "要因・次月対策をAI生成"}
              </button>
              <button
                type="button"
                onClick={meta.onSaveMeta}
                disabled={meta.savingMeta}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                  !meta.savingMeta
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {meta.savingMeta ? "保存中..." : "目標・要因・対策を保存"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs w-full whitespace-nowrap">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="text-left py-2 px-2 font-medium">指標</th>
                  <th className="text-left py-2 px-2 font-medium w-40">目標</th>
                  <th className="text-right py-2 px-2 font-medium">実績</th>
                  <th className="text-right py-2 px-2 font-medium">
                    前月比{prev ? `（${prev.year_month}比）` : ""}
                  </th>
                  <th className="text-left py-2 px-2 font-medium w-56">要因</th>
                  <th className="text-left py-2 px-2 font-medium w-56">次月対策</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_METRICS.map((m) => {
                  const cur = current ? pickKpiNumber(current.kpi, m.key) : null;
                  const prevValue = prev ? pickKpiNumber(prev.kpi, m.key) : null;
                  const rate = diffRate(cur, prevValue);
                  return (
                    <tr key={m.key} className="border-b last:border-b-0 align-top">
                      <td className="py-1.5 px-2 text-gray-700">{m.label}</td>
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          value={meta.goals[m.key] ?? ""}
                          disabled={meta.savingMeta}
                          placeholder="目標を入力"
                          onChange={(e) => meta.onGoalChange(m.key, e.target.value)}
                          className="w-40 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:border-blue-400"
                        />
                      </td>
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
                      <td className="py-1 px-1">
                        <textarea
                          rows={2}
                          value={meta.factors[m.key] ?? ""}
                          disabled={meta.savingMeta}
                          placeholder="（AI生成 or 手入力）"
                          onChange={(e) => meta.onFactorChange(m.key, e.target.value)}
                          className="w-56 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:border-blue-400 leading-snug"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <textarea
                          rows={2}
                          value={meta.nextActions[m.key] ?? ""}
                          disabled={meta.savingMeta}
                          placeholder="（AI生成 or 手入力）"
                          onChange={(e) =>
                            meta.onNextActionChange(m.key, e.target.value)
                          }
                          className="w-56 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white focus:border-blue-400 leading-snug"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {meta.metaMessage && (
            <p className="text-xs text-emerald-700 mt-2">✅ {meta.metaMessage}</p>
          )}
          {meta.metaError && (
            <p className="text-xs text-red-600 mt-2">⚠ {meta.metaError}</p>
          )}
        </div>
      )}
    </div>
  );
}
