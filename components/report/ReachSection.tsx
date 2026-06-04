"use client";

// ==========================================
// Phase 4a:【3】リーチ分析
// Phase 4a5: フィード/リール別の「先月実績・当月実績・前月比」比較テーブルを追加。
//  - ビュー/リーチ月次推移グラフ（直近13ヶ月）は残す（テーブルはグラフの下）
//  - 投稿一覧は当月分のみ表示（現状維持）
// ※ 投稿サムネイル画像は Phase 4c、リール考察は当面スコープ外
// ==========================================

import type { ExcelParseResult, PostDetail } from "@/lib/types";
import type { TrendChartRow } from "@/lib/report/kpi-history";
import { averagePostMetrics, type PostAverages } from "@/lib/report/post-metrics";
import { TrendBarChart } from "@/components/report/charts";

// 比較テーブルの5指標（ENG率だけ率指標 = 前月比はpt差表記）
const METRICS: Array<{
  key: keyof PostAverages;
  label: string;
  kind: "num" | "rate";
}> = [
  { key: "view", label: "平均ビュー", kind: "num" },
  { key: "reach", label: "平均リーチ", kind: "num" },
  { key: "likes", label: "平均いいね数", kind: "num" },
  { key: "saves", label: "平均保存数", kind: "num" },
  { key: "eng_rate", label: "平均ENG率", kind: "rate" },
];

function formatValue(v: number | null, kind: "num" | "rate"): string {
  if (v === null) return "-";
  if (kind === "rate") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}

/** 前月比。実数指標は%、率指標(ENG率)はpt差。算出不能は N/A */
function formatDiff(
  current: number | null,
  prev: number | null,
  kind: "num" | "rate"
): string {
  if (current === null || prev === null) return "N/A";
  if (kind === "rate") {
    const pt = current - prev;
    return `${pt >= 0 ? "+" : ""}${pt.toFixed(1)}pt`;
  }
  if (prev === 0) return current === 0 ? "0.0%" : "+∞%";
  const rate = ((current - prev) / prev) * 100;
  return `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`;
}

function diffClass(diff: string): string {
  if (diff === "N/A") return "text-gray-400";
  if (diff.startsWith("+")) return "text-emerald-600";
  if (diff.startsWith("-")) return "text-red-600";
  return "text-gray-500";
}

function ComparisonTable({
  title,
  current,
  prev,
  prevMonth,
  hasPrev,
}: {
  title: string;
  current: PostDetail[];
  prev: PostDetail[];
  prevMonth: string | null;
  hasPrev: boolean;
}) {
  const curAvg = averagePostMetrics(current);
  const prevAvg = averagePostMetrics(prev);

  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-2">{title}</p>
      <div className="overflow-x-auto">
        <table className="text-xs w-full whitespace-nowrap">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-600">
              <th className="text-left py-2 px-2 font-medium">指標</th>
              <th className="text-right py-2 px-2 font-medium">
                先月実績{prevMonth ? `（${prevMonth}）` : ""}
              </th>
              <th className="text-right py-2 px-2 font-medium">当月実績</th>
              <th className="text-right py-2 px-2 font-medium">前月比</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const cur = curAvg[m.key];
              const pv = prevAvg[m.key];
              const diff = formatDiff(cur, pv, m.kind);
              return (
                <tr key={m.key} className="border-b last:border-b-0">
                  <td className="py-1.5 px-2 text-gray-700">{m.label}</td>
                  <td className="py-1.5 px-2 text-right text-gray-600">
                    {formatValue(pv, m.kind)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-gray-900">
                    {formatValue(cur, m.kind)}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${diffClass(diff)}`}>
                    {diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!hasPrev && (
        <p className="text-[11px] text-gray-400 mt-1">
          前月レコードがないため先月実績・前月比は N/A です
        </p>
      )}
    </div>
  );
}

function PostsTable({ title, posts }: { title: string; posts: PostDetail[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-700 mb-2">{title}</p>
      {posts.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">データなし</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs w-full whitespace-nowrap">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600">
                <th className="text-left py-2 px-2 font-medium">タイトル</th>
                <th className="text-left py-2 px-2 font-medium">投稿日</th>
                <th className="text-right py-2 px-2 font-medium">ビュー</th>
                <th className="text-right py-2 px-2 font-medium">リーチ</th>
                <th className="text-right py-2 px-2 font-medium">ENG</th>
                <th className="text-right py-2 px-2 font-medium">ENG率</th>
                <th className="text-right py-2 px-2 font-medium">いいね</th>
                <th className="text-right py-2 px-2 font-medium">保存</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p, i) => (
                <tr key={`${p.title}-${i}`} className="border-b last:border-b-0">
                  <td
                    className="py-1.5 px-2 text-gray-900 max-w-[240px] truncate"
                    title={p.title}
                  >
                    {p.title || "(タイトルなし)"}
                  </td>
                  <td className="py-1.5 px-2 text-gray-600">{p.post_date}</td>
                  <td className="py-1.5 px-2 text-right">{p.view.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right">{p.reach.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right">
                    {p.engagement.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right">{p.eng_rate}%</td>
                  <td className="py-1.5 px-2 text-right">{p.likes.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right">{p.saves.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReachSection({
  rows,
  excel,
  prevFeedPosts,
  prevReelPosts,
  prevMonth,
  prevFound,
}: {
  rows: TrendChartRow[];
  excel: ExcelParseResult | null;
  prevFeedPosts: PostDetail[];
  prevReelPosts: PostDetail[];
  prevMonth: string | null;
  prevFound: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">ビュー / リーチ 月次推移</p>
        <TrendBarChart
          rows={rows}
          series={[
            { key: "view", label: "ビュー" },
            { key: "reach", label: "リーチ" },
          ]}
        />
      </div>

      {/* 3-1 フィード / 3-2 リール 比較テーブル */}
      <div className="space-y-4">
        <ComparisonTable
          title="3-1 フィード（先月実績・当月実績・前月比）"
          current={excel?.feed_posts ?? []}
          prev={prevFeedPosts}
          prevMonth={prevMonth}
          hasPrev={prevFound}
        />
        <ComparisonTable
          title="3-2 リール（先月実績・当月実績・前月比）"
          current={excel?.reel_posts ?? []}
          prev={prevReelPosts}
          prevMonth={prevMonth}
          hasPrev={prevFound}
        />
      </div>

      {/* 当月の投稿一覧（現状維持） */}
      {excel ? (
        <div className="space-y-4">
          <PostsTable
            title={`フィード投稿一覧（当月・${excel.feed_posts.length}件）`}
            posts={excel.feed_posts}
          />
          <PostsTable
            title={`リール投稿一覧（当月・${excel.reel_posts.length}件）`}
            posts={excel.reel_posts}
          />
        </div>
      ) : (
        <p className="text-xs text-gray-400 border border-dashed rounded-lg px-4 py-6 text-center">
          当月Excelをアップロードすると投稿一覧が表示されます
        </p>
      )}
    </div>
  );
}
