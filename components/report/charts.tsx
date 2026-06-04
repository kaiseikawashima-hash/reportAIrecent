"use client";

// ==========================================
// Phase 4a: レポート画面のグラフ部品（Recharts）
// - 折れ線（推移）/ 棒（月次比較）/ ドーナツ（構成比）
// - 推移系はデータが1〜2点しかない場合「データ蓄積中」表示にする
// ==========================================

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendChartRow } from "@/lib/report/kpi-history";
import { countDataPoints } from "@/lib/report/kpi-history";
import type { TrendKpiKey } from "@/lib/report/types";
import type { DailyAccount } from "@/lib/types";

export const CHART_COLORS = [
  "#2563eb", // blue-600
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1", // indigo-500
  "#84cc16", // lime-500
];

export interface TrendSeries {
  key: TrendKpiKey;
  label: string;
  color?: string;
}

const MIN_TREND_POINTS = 3;

function formatNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

// ------------------------------------------
// データ蓄積中表示（点が少ない推移グラフの代替）
// ------------------------------------------

function AccumulatingNotice({
  rows,
  series,
}: {
  rows: TrendChartRow[];
  series: TrendSeries[];
}) {
  const available = rows.filter((r) =>
    series.some((s) => typeof r[s.key] === "number")
  );
  return (
    <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 px-4 py-6 text-center">
      <p className="text-sm text-gray-500 font-medium">📈 データ蓄積中</p>
      <p className="text-xs text-gray-400 mt-1">
        推移グラフは3ヶ月分以上のデータが貯まると表示されます（現在
        {available.length}ヶ月分）
      </p>
      {available.length > 0 && (
        <table className="text-xs mx-auto mt-3">
          <thead>
            <tr className="text-gray-500">
              <th className="px-2 py-1 font-medium text-left">年月</th>
              {series.map((s) => (
                <th key={s.key} className="px-2 py-1 font-medium text-right">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {available.map((r) => (
              <tr key={r.year_month} className="border-t">
                <td className="px-2 py-1 text-left text-gray-700">{r.year_month}</td>
                {series.map((s) => (
                  <td key={s.key} className="px-2 py-1 text-right text-gray-900">
                    {formatNumber(r[s.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------
// 折れ線（推移グラフ）
// ------------------------------------------

export function TrendLineChart({
  rows,
  series,
  height = 260,
}: {
  rows: TrendChartRow[];
  series: TrendSeries[];
  height?: number;
}) {
  if (countDataPoints(rows, series.map((s) => s.key)) < MIN_TREND_POINTS) {
    return <AccumulatingNotice rows={rows} series={series} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="year_month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
        <Tooltip formatter={(value) => formatNumber(value)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------
// 棒グラフ（月次比較）
// ------------------------------------------

export function TrendBarChart({
  rows,
  series,
  height = 260,
}: {
  rows: TrendChartRow[];
  series: TrendSeries[];
  height?: number;
}) {
  if (countDataPoints(rows, series.map((s) => s.key)) < MIN_TREND_POINTS) {
    return <AccumulatingNotice rows={rows} series={series} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="year_month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
        <Tooltip formatter={(value) => formatNumber(value)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------
// 日別折れ線（当月のアカウント分析: プロフィールアクセス / リンククリック）
// X軸 = 当月の日付（1〜末日）、線2本。月次推移とは別物。
// ------------------------------------------

export function DailyAccountLineChart({
  data,
  height = 260,
}: {
  data: DailyAccount[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm text-gray-500 font-medium">日別データなし</p>
        <p className="text-xs text-gray-400 mt-1">
          当月Excelに「アカウント分析-日別クリック集計」シートがある月で表示されます
        </p>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
          tickFormatter={(v: string) => String(v).split("/").pop() ?? v}
        />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} />
        <Tooltip formatter={(value) => formatNumber(value)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="profile_access"
          name="プロフィールアクセス"
          stroke={CHART_COLORS[0]}
          strokeWidth={2}
          dot={{ r: 2 }}
        />
        <Line
          type="monotone"
          dataKey="link_clicks"
          name="リンククリック"
          stroke={CHART_COLORS[1]}
          strokeWidth={2}
          dot={{ r: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------
// ドーナツ（構成比: 性別・年齢層・都道府県・都市）
// ------------------------------------------

export interface DonutDatum {
  name: string;
  value: number;
}

export function DonutChart({
  title,
  data,
  height = 240,
}: {
  title: string;
  data: DonutDatum[];
  height?: number;
}) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs font-medium text-gray-700 mb-1">{title}</p>
      {filtered.length === 0 || total === 0 ? (
        <p className="text-xs text-gray-400 py-8 text-center">データなし</p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={filtered}
              dataKey="value"
              nameKey="name"
              innerRadius="50%"
              outerRadius="75%"
              paddingAngle={1}
              label={({ name, value }) =>
                `${name} ${total > 0 ? Math.round(((value as number) / total) * 100) : 0}%`
              }
              labelLine={false}
              fontSize={10}
            >
              {filtered.map((d, i) => (
                <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatNumber(value)} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
