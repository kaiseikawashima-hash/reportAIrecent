"use client";

// ==========================================
// Phase 4a:【3】リーチ分析
// ビュー/リーチ月次グラフ（棒）+ フィード/リール投稿一覧（数値テーブル）
// ※ 投稿サムネイル画像は Phase 4c、リール考察は当面スコープ外
// ==========================================

import type { ExcelParseResult, PostDetail } from "@/lib/types";
import type { TrendChartRow } from "@/lib/report/kpi-history";
import { TrendBarChart } from "@/components/report/charts";

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
}: {
  rows: TrendChartRow[];
  excel: ExcelParseResult | null;
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

      {excel ? (
        <div className="space-y-4">
          <PostsTable
            title={`フィード投稿一覧（${excel.feed_posts.length}件）`}
            posts={excel.feed_posts}
          />
          <PostsTable
            title={`リール投稿一覧（${excel.reel_posts.length}件）`}
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
