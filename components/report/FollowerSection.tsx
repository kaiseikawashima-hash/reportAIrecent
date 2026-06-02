"use client";

// ==========================================
// Phase 4a:【2】フォロワー分析
// フォロワー推移（折れ線）+ エリア/属性ドーナツ（当月 kpi_summary から）
// ※ 男女別年齢ピラミッドは Phase 4b
// ==========================================

import type { KpiSummary, RegionData } from "@/lib/types";
import type { TrendChartRow } from "@/lib/report/kpi-history";
import { DonutChart, TrendLineChart, type DonutDatum } from "@/components/report/charts";

const DONUT_REGION_LIMIT = 6;

function genderData(kpi: KpiSummary): DonutDatum[] {
  return [
    { name: "男性", value: kpi.gender_ratio?.male ?? 0 },
    { name: "女性", value: kpi.gender_ratio?.female ?? 0 },
  ];
}

function ageData(kpi: KpiSummary): DonutDatum[] {
  const dist = kpi.age_distribution;
  if (!dist) return [];
  return Object.entries(dist).map(([age, value]) => ({
    name: age,
    value: typeof value === "number" ? value : 0,
  }));
}

function regionData(regions: RegionData[] | undefined): DonutDatum[] {
  if (!regions) return [];
  return regions
    .slice(0, DONUT_REGION_LIMIT)
    .map((r) => ({ name: r.name, value: r.value }));
}

export default function FollowerSection({
  rows,
  currentKpi,
}: {
  rows: TrendChartRow[];
  currentKpi: KpiSummary | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">フォロワー推移</p>
        <TrendLineChart
          rows={rows}
          series={[{ key: "follower", label: "フォロワー" }]}
        />
      </div>

      {currentKpi ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <DonutChart title="性別比率" data={genderData(currentKpi)} />
          <DonutChart title="年齢層分布" data={ageData(currentKpi)} />
          <DonutChart
            title={`都道府県 TOP${DONUT_REGION_LIMIT}`}
            data={regionData(currentKpi.top_prefectures)}
          />
          <DonutChart
            title={`市区町村 TOP${DONUT_REGION_LIMIT}`}
            data={regionData(currentKpi.top_cities)}
          />
        </div>
      ) : (
        <p className="text-xs text-gray-400 border border-dashed rounded-lg px-4 py-6 text-center">
          当月Excelをアップロードすると性別・年齢・エリアの構成比グラフが表示されます
        </p>
      )}
    </div>
  );
}
