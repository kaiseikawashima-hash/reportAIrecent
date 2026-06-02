"use client";

// ==========================================
// Phase 4a:【4】アカウント分析
// プロフィールアクセス / リンククリックの当月数値 + 推移（折れ線）
// ==========================================

import type { KpiSummary } from "@/lib/types";
import type { TrendChartRow } from "@/lib/report/kpi-history";
import { TrendLineChart } from "@/components/report/charts";

export default function AccountSection({
  rows,
  currentKpi,
}: {
  rows: TrendChartRow[];
  currentKpi: KpiSummary | null;
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

      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">
          プロフィールアクセス / リンククリック 推移
        </p>
        <TrendLineChart
          rows={rows}
          series={[
            { key: "profile_access", label: "プロフィールアクセス" },
            { key: "link_clicks", label: "リンククリック" },
          ]}
        />
      </div>
    </div>
  );
}
