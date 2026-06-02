import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import type {
  ExcelParseResult,
  ExcelSummary,
  MonthlyTrend,
  PostRanking,
  PostDetail,
  Demographics,
  AgeGender,
  RegionData,
} from "@/lib/types";

// ==========================================
// Phase 3.7.1
// Instagram AI Pro のエクスポートExcelに合わせた固定構造パーサ
// 全クライアントが同一フォーマットを使うため、シート別に固定カラム位置で読む
// ==========================================

// ==========================================
// 共通ヘルパー
// ==========================================

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,%¥\s]/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
  }
  return String(v).trim();
}

/**
 * Instagram AI Pro 投稿本文からタイトルを抽出。
 * 投稿本文は「.\n投稿固有のリード\n固有のサブリード\n━━━...\n以降は共通ボイラープレート」という構造。
 * ボイラープレート内には『残し続ける1ページ』のような共通カッコ書きが含まれるため、
 * 『...』検出ではなく ━ 区切りの直前までを採用する。
 */
function extractTitle(raw: string): string {
  if (!raw) return "";
  const lines = raw.split(/\r?\n/);
  const titleLines: string[] = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (started) break;
      continue;
    }
    if (t === ".") continue;
    if (/^━+$/.test(t)) {
      if (started) break;
      continue;
    }
    started = true;
    titleLines.push(t);
    if (titleLines.length >= 3) break;
  }
  return titleLines.join(" ");
}

function rowsOf(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];
}

/**
 * 任意のセル値を "YYYY/MM" に正規化。失敗時は空文字。
 */
function formatYearMonth(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    return `${y}/${m}`;
  }
  if (typeof v === "number") {
    if (v > 30000 && v < 80000) {
      const utcDays = v - 25569;
      const date = new Date(utcDays * 86400 * 1000);
      if (!Number.isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, "0");
        return `${y}/${m}`;
      }
    }
    return "";
  }
  const s = String(v).trim();
  if (!s) return "";

  let match = s.match(/^(\d{4})[\/\-年.](\d{1,2})/);
  if (match) return `${match[1]}/${match[2].padStart(2, "0")}`;
  match = s.match(/^(\d{1,2})[\/\-月.](\d{4})/);
  if (match) return `${match[2]}/${match[1].padStart(2, "0")}`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}/${m}`;
  }
  return "";
}

/** Excel の比率(%) セルを "<値>%" 文字列にする（数値変換せず、Excel値をそのまま使う） */
function ratioString(v: unknown): string {
  if (v == null || v === "") return "0%";
  const s = String(v).trim();
  if (!s) return "0%";
  if (s.endsWith("%")) return s;
  return `${s}%`;
}

// ==========================================
// 1. ホーム-数値サマリー
// 縦持ち: [指標, 値, 変化率]
// ==========================================

const EMPTY_SUMMARY: ExcelSummary = {
  follower: 0,
  view: 0,
  reach: 0,
  engagement: 0,
  post_count: 0,
  comments: 0,
  profile_access: 0,
  link_clicks: 0,
  view_reel: 0,
  view_feed: 0,
  reach_reel: 0,
  reach_feed: 0,
  engagement_reel: 0,
  engagement_feed: 0,
};

function parseSummary(wb: XLSX.WorkBook): ExcelSummary {
  const rows = rowsOf(wb, "ホーム-数値サマリー");
  const result: ExcelSummary = { ...EMPTY_SUMMARY };
  if (rows.length < 2) return result;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = str(row[0]);
    const value = num(row[1]);
    if (label === "フォロワー数") result.follower = value;
    else if (label === "ビュー数") result.view = value;
    else if (label === "リーチ数") result.reach = value;
    else if (label === "エンゲージメント") result.engagement = value;
    else if (label === "投稿数") result.post_count = value;
  }
  return result;
}

// ==========================================
// 2. ホーム-推移データ
// 横持ち、14カラム固定
// ==========================================

function parseMonthlyTrends(wb: XLSX.WorkBook): { trends: MonthlyTrend[]; targetMonth: string } {
  const rows = rowsOf(wb, "ホーム-推移データ");
  if (rows.length < 2) return { trends: [], targetMonth: "" };

  const trends: MonthlyTrend[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const year_month = formatYearMonth(row[1]);
    if (!/^\d{4}\/(0[1-9]|1[0-2])$/.test(year_month)) continue;

    trends.push({
      year_month,
      follower: num(row[2]),
      view_total: num(row[3]),
      view_reel: num(row[4]),
      view_feed: num(row[5]),
      reach_total: num(row[6]),
      reach_reel: num(row[7]),
      reach_feed: num(row[8]),
      engagement_total: num(row[9]),
      engagement_reel: num(row[10]),
      engagement_feed: num(row[11]),
      profile_access: num(row[12]),
      link_clicks: num(row[13]),
    });
  }

  // 古い順に並べて、最後の要素が当月
  trends.sort((a, b) => a.year_month.localeCompare(b.year_month));
  const targetMonth = trends.length > 0 ? trends[trends.length - 1].year_month : "";
  return { trends, targetMonth };
}

// ==========================================
// 3. ホーム-フィードランキング / リールランキング TOP5
// 横持ち: [順位, タイトル, リーチ数, エンゲージメント, エンゲージメント率, 投稿URL]
// ==========================================

function parseRanking(wb: XLSX.WorkBook, sheetName: string): PostRanking[] {
  const rows = rowsOf(wb, sheetName);
  if (rows.length < 2) return [];

  const out: PostRanking[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const titleRaw = str(row[1]);
    const url = str(row[5]);
    if (!titleRaw && !url) continue;

    out.push({
      rank: num(row[0]) || i,
      title: extractTitle(titleRaw),
      reach: num(row[2]),
      engagement: num(row[3]),
      eng_rate: str(row[4]) || "0%",
      url,
    });
  }
  return out;
}

// ==========================================
// 4. 投稿分析-フィード / リール
// 横持ち、11カラム固定
// [No., 投稿タイトル, 投稿日, タイプ, ビュー数, リーチ数, ENG数, ENG率(%), いいね数, コメント数, 保存数]
// ==========================================

function parsePosts(wb: XLSX.WorkBook, sheetName: string): PostDetail[] {
  const rows = rowsOf(wb, sheetName);
  if (rows.length < 2) return [];

  const posts: PostDetail[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const titleRaw = str(row[1]);
    const postDate = str(row[2]);
    if (!titleRaw && !postDate) continue;

    posts.push({
      title: extractTitle(titleRaw),
      post_date: postDate,
      view: num(row[4]),
      reach: num(row[5]),
      engagement: num(row[6]),
      eng_rate: num(row[7]), // 数値（例: 35.6）
      likes: num(row[8]),
      comments: num(row[9]),
      saves: num(row[10]),
    });
  }
  return posts;
}

// ==========================================
// 5. デモグラフィック分析-年齢・性別分析（フォロワー数）
// 横持ち: [No., 年齢層, 男性, 女性, 合計]
// ==========================================

function parseAgeGender(wb: XLSX.WorkBook): AgeGender[] {
  const rows = rowsOf(wb, "デモグラフィック分析-年齢・性別分析（フォロワー数）");
  if (rows.length < 2) return [];

  const out: AgeGender[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const age = str(row[1]);
    if (!age) continue;
    if (/^(合計|計|total)$/i.test(age)) continue;

    const male = num(row[2]);
    const female = num(row[3]);
    const total = num(row[4]);
    out.push({
      age,
      male,
      female,
      total: total || male + female,
    });
  }
  return out;
}

// ==========================================
// 6. デモグラフィック分析-都道府県 / 都市
// 横持ち: [No., 名称, 値, 比率(%)]
// 比率はExcel上の数値文字列にそのまま "%" を付ける（93.70 -> "93.70%"）
// ==========================================

function parseRegion(wb: XLSX.WorkBook, sheetName: string): RegionData[] {
  const rows = rowsOf(wb, sheetName);
  if (rows.length < 2) return [];

  const out: RegionData[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = str(row[1]);
    if (!name) continue;
    if (/^(合計|計|total|other|その他)$/i.test(name)) continue;

    out.push({
      name,
      value: num(row[2]),
      ratio: ratioString(row[3]),
    });
  }
  return out;
}

function parseDemographics(wb: XLSX.WorkBook): Demographics {
  return {
    age_gender: parseAgeGender(wb),
    prefectures: parseRegion(wb, "デモグラフィック分析-都道府県"),
    cities: parseRegion(wb, "デモグラフィック分析-都市"),
  };
}

// ==========================================
// メインハンドラ
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Excelファイル(.xlsx/.xls)をアップロードしてください" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

    const summary = parseSummary(wb);
    const { trends, targetMonth } = parseMonthlyTrends(wb);

    // 当月行から内訳・プロフィールクリック・リンククリックを補完
    const currentTrend =
      trends.find((t) => t.year_month === targetMonth) ?? trends[trends.length - 1] ?? null;
    if (currentTrend) {
      summary.view_reel = currentTrend.view_reel;
      summary.view_feed = currentTrend.view_feed;
      summary.reach_reel = currentTrend.reach_reel;
      summary.reach_feed = currentTrend.reach_feed;
      summary.engagement_reel = currentTrend.engagement_reel;
      summary.engagement_feed = currentTrend.engagement_feed;
      summary.profile_access = currentTrend.profile_access;
      summary.link_clicks = currentTrend.link_clicks;
    }

    const feedRanking = parseRanking(wb, "ホーム-フィードランキング TOP5");
    const reelRanking = parseRanking(wb, "ホーム-リールランキング TOP5");
    const feedPosts = parsePosts(wb, "投稿分析-フィード");
    const reelPosts = parsePosts(wb, "投稿分析-リール");
    const demographics = parseDemographics(wb);

    // post_count が 0 で投稿明細が取れている場合はそれを採用
    if (summary.post_count === 0) {
      summary.post_count = feedPosts.length + reelPosts.length;
    }

    // 総コメント数を投稿明細から集計（数値サマリーに項目がないため）
    if (summary.comments === 0) {
      const feedComments = feedPosts.reduce((acc, p) => acc + p.comments, 0);
      const reelComments = reelPosts.reduce((acc, p) => acc + p.comments, 0);
      summary.comments = feedComments + reelComments;
    }

    const result: ExcelParseResult = {
      summary,
      monthly_trends: trends,
      feed_ranking: feedRanking,
      reel_ranking: reelRanking,
      feed_posts: feedPosts,
      reel_posts: reelPosts,
      demographics,
      target_month: targetMonth,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Excel解析中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
