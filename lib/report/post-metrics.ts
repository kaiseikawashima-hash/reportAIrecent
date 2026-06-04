// ==========================================
// Phase 4a5: 投稿明細（feed_posts / reel_posts）の平均値算出
// リーチ分析の「先月実績・当月実績・前月比」テーブル用。
// 投稿が0件の月は全項目 null（= N/A 表示）にする。
// ==========================================

import type { PostDetail } from "@/lib/types";

export interface PostAverages {
  view: number | null;
  reach: number | null;
  likes: number | null;
  saves: number | null;
  eng_rate: number | null; // %値（例: 35.6）
}

export const EMPTY_POST_AVERAGES: PostAverages = {
  view: null,
  reach: null,
  likes: null,
  saves: null,
  eng_rate: null,
};

function avg(posts: PostDetail[], pick: (p: PostDetail) => unknown): number {
  const sum = posts.reduce((acc, p) => {
    const v = pick(p);
    return acc + (typeof v === "number" && Number.isFinite(v) ? v : 0);
  }, 0);
  return sum / posts.length;
}

/** 投稿明細から5指標の平均を計算。0件なら全項目 null */
export function averagePostMetrics(
  posts: PostDetail[] | null | undefined
): PostAverages {
  if (!posts || posts.length === 0) return { ...EMPTY_POST_AVERAGES };
  return {
    view: avg(posts, (p) => p.view),
    reach: avg(posts, (p) => p.reach),
    likes: avg(posts, (p) => p.likes),
    saves: avg(posts, (p) => p.saves),
    eng_rate: avg(posts, (p) => p.eng_rate),
  };
}

/** jsonb の excel_parsed から feed_posts / reel_posts を安全に取り出す */
export function extractPosts(
  excelParsed: Record<string, unknown> | null | undefined,
  key: "feed_posts" | "reel_posts"
): PostDetail[] {
  if (!excelParsed) return [];
  const v = excelParsed[key];
  return Array.isArray(v) ? (v as PostDetail[]) : [];
}
