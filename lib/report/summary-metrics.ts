// ==========================================
// Phase 4a6: サマリーの指標テーブル（FMT準拠 5列構成）共通定義
// 指標 / 目標 / 実績 / 前月比 / 要因 / 次月対策
// - 目標(goals) / 要因(factors) / 次月対策(next_actions) は kpi_summary 内に
//   指標キー → 文字列 の object として保存する（merge upsert でマージ）。
// ==========================================

export const SUMMARY_METRICS = [
  { key: "follower", label: "フォロワー" },
  { key: "view", label: "ビュー" },
  { key: "reach", label: "リーチ" },
  { key: "engagement", label: "エンゲージメント" },
  { key: "profile_access", label: "プロフィールアクセス" },
  { key: "link_clicks", label: "リンククリック" },
  { key: "post_count", label: "投稿数" },
] as const;

export type SummaryMetricKey = (typeof SUMMARY_METRICS)[number]["key"];

export const SUMMARY_METRIC_KEYS: SummaryMetricKey[] = SUMMARY_METRICS.map(
  (m) => m.key
);

/** kpi_summary 内の goals/factors/next_actions を「指標キー→文字列」マップへ正規化 */
export function asStringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const key of SUMMARY_METRIC_KEYS) {
    const raw = (v as Record<string, unknown>)[key];
    if (typeof raw === "string") out[key] = raw;
    else if (typeof raw === "number") out[key] = String(raw);
  }
  return out;
}

/** 空文字を除いた指標キー→文字列マップ（保存用に余計な空キーを落とす） */
export function compactStringMap(
  map: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SUMMARY_METRIC_KEYS) {
    const v = map[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
  }
  return out;
}
