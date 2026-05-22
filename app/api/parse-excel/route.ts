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
// ヘルパー関数
// ==========================================

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,%¥\s]/g, "").trim();
    const n = Number(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function str(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

/** 『タイトル』形式から中身だけ抽出。なければ元テキスト */
function extractTitle(raw: string): string {
  const match = raw.match(/『(.+?)』/);
  return match ? match[1] : raw.trim();
}

function findSheetByPartialName(wb: XLSX.WorkBook, keyword: string): unknown[][] | null {
  const sheetName = wb.SheetNames.find((n) => n.includes(keyword));
  if (!sheetName) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: true }) as unknown[][];
}

/**
 * Excel シリアル値（1900-01-01 起算の日数）を YYYY/MM 形式に変換
 */
function excelSerialToYearMonth(serial: number): string {
  // Excel epoch quirk: 1900-01-01 = 1, 1900-02-29 doesn't actually exist
  const utcDays = serial - 25569;
  const utcMs = utcDays * 86400 * 1000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}/${m}`;
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
    // 30000 ≈ 1982, 80000 ≈ 2119 — Excel シリアル日付の妥当範囲
    if (v > 30000 && v < 80000) return excelSerialToYearMonth(v);
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

/**
 * 先頭数行を走査してヘッダー行を特定。
 * minMatches 個以上のキーワードがいずれかのセルに含まれる行をヘッダーとみなす。
 */
function detectHeader(
  rows: unknown[][],
  keywords: string[],
  minMatches = 2
): { headerIdx: number; header: string[] } {
  const scanLimit = Math.min(rows.length, 10);
  for (let r = 0; r < scanLimit; r++) {
    const row = (rows[r] as unknown[]) ?? [];
    const cells = row.map((c) => str(c).toLowerCase());
    const matchCount = keywords.filter((kw) =>
      cells.some((c) => c.includes(kw.toLowerCase()))
    ).length;
    if (matchCount >= Math.min(minMatches, keywords.length)) {
      return { headerIdx: r, header: cells };
    }
  }
  const fallback = ((rows[0] as unknown[]) ?? []).map((c) => str(c).toLowerCase());
  return { headerIdx: 0, header: fallback };
}

/** ヘッダー配列から、いずれかのキーワードを含む列のインデックスを返す（OR） */
function findCol(header: string[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (!h) continue;
    if (keywords.some((kw) => kw && h.includes(kw.toLowerCase()))) return i;
  }
  return -1;
}

/** ヘッダー配列から、すべてのキーワードを含む列のインデックスを返す（AND） */
function findColAll(header: string[], keywords: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (!h) continue;
    if (keywords.every((kw) => h.includes(kw.toLowerCase()))) return i;
  }
  return -1;
}

// ==========================================
// パーサー: サマリー
// ==========================================

function parseSummary(wb: XLSX.WorkBook): ExcelSummary {
  const rows = findSheetByPartialName(wb, "数値サマリー") ?? findSheetByPartialName(wb, "サマリー");
  if (!rows) return { follower: 0, view: 0, reach: 0, engagement: 0, post_count: 0 };

  const result: ExcelSummary = { follower: 0, view: 0, reach: 0, engagement: 0, post_count: 0 };

  // サマリーシートは「項目: 値」の縦並びが多い。各行から最初の数値セルを値として採用する。
  for (const row of rows) {
    const r = row as unknown[];
    const label = str(r[0]).toLowerCase();
    if (!label) continue;
    let value = 0;
    for (let c = 1; c < r.length; c++) {
      const v = r[c];
      if (typeof v === "number") { value = v; break; }
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v.replace(/[,%]/g, "")))) {
        value = num(v); break;
      }
    }

    if (label.includes("フォロワー")) result.follower = value;
    else if (label.includes("リーチ")) result.reach = value;
    else if (label.includes("エンゲージ")) result.engagement = value;
    else if (label.includes("投稿数") || label.includes("投稿回数") || label.includes("投稿本数")) result.post_count = value;
    else if (label.includes("表示") || label.includes("view") || label.includes("インプレッション") || label.includes("閲覧")) result.view = value;
  }

  return result;
}

// ==========================================
// パーサー: 月次推移
// ==========================================

function parseMonthlyTrends(wb: XLSX.WorkBook): { trends: MonthlyTrend[]; targetMonth: string } {
  const rows = findSheetByPartialName(wb, "推移");
  if (!rows || rows.length < 2) return { trends: [], targetMonth: "" };

  const { headerIdx, header } = detectHeader(
    rows,
    ["年月", "月", "フォロワー", "リーチ", "リール", "フィード"]
  );

  let colYM = findCol(header, ["年月", "対象月", "月度", "month"]);
  // 「月」単独はリーチ等と衝突しない位置のみ採用したいので最後の手段
  if (colYM < 0) {
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (h === "月" || h === "対象") { colYM = i; break; }
    }
  }
  const colFollower = findCol(header, ["フォロワー"]);
  const colReach = findCol(header, ["リーチ"]);
  const colEng = findCol(header, ["エンゲージ"]);
  const colViewReel =
    findColAll(header, ["リール", "表示"]) >= 0
      ? findColAll(header, ["リール", "表示"])
      : findColAll(header, ["リール", "view"]);
  const colViewFeed =
    findColAll(header, ["フィード", "表示"]) >= 0
      ? findColAll(header, ["フィード", "表示"])
      : findColAll(header, ["フィード", "view"]);

  // 合計表示列（リール／フィードのプレフィックスがない表示・閲覧）
  let colViewTotal = -1;
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (!h || i === colViewReel || i === colViewFeed) continue;
    if ((h.includes("表示") || h.includes("閲覧") || h.includes("インプレッション") || h.includes("view")) &&
        !h.includes("リール") && !h.includes("フィード")) {
      colViewTotal = i;
      break;
    }
  }

  const trends: MonthlyTrend[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] as unknown[]) ?? [];

    let year_month = "";
    if (colYM >= 0) year_month = formatYearMonth(row[colYM]);
    if (!year_month) {
      // フォールバック: 各セルを試して "YYYY/MM" に正規化できる最初のセルを採用
      for (let c = 0; c < row.length; c++) {
        const ym = formatYearMonth(row[c]);
        if (ym) { year_month = ym; break; }
      }
    }
    if (!/^\d{4}\/(0[1-9]|1[0-2])$/.test(year_month)) continue;

    const trend: MonthlyTrend = {
      year_month,
      follower: colFollower >= 0 ? num(row[colFollower]) : 0,
      view_total: colViewTotal >= 0 ? num(row[colViewTotal]) : 0,
      view_reel: colViewReel >= 0 ? num(row[colViewReel]) : 0,
      view_feed: colViewFeed >= 0 ? num(row[colViewFeed]) : 0,
      reach_total: colReach >= 0 ? num(row[colReach]) : 0,
      engagement_total: colEng >= 0 ? num(row[colEng]) : 0,
    };

    if (trend.view_total === 0 && (trend.view_feed > 0 || trend.view_reel > 0)) {
      trend.view_total = trend.view_feed + trend.view_reel;
    }

    trends.push(trend);
  }

  // 古い順（昇順）にソート（最後の要素が当月）
  trends.sort((a, b) => a.year_month.localeCompare(b.year_month));

  const targetMonth = trends.length > 0 ? trends[trends.length - 1].year_month : "";
  return { trends, targetMonth };
}

// ==========================================
// パーサー: 投稿ランキング
// ==========================================

function parsePostRanking(wb: XLSX.WorkBook, keyword: string): PostRanking[] {
  const rows = findSheetByPartialName(wb, keyword);
  if (!rows || rows.length < 2) return [];

  const { headerIdx, header } = detectHeader(
    rows,
    ["タイトル", "投稿", "リーチ", "エンゲージ", "順位"]
  );

  const colRank = findCol(header, ["順位", "rank"]);
  // URL 系は title より先に拾う（"投稿URL" が "投稿" にマッチしてタイトル扱いになるのを防ぐ）
  const colUrl = findCol(header, ["url", "リンク", "permalink"]);
  // タイトル列: "タイトル" が最優先。それが無ければ "投稿" を含む列のうち URL 列以外
  let colTitle = findCol(header, ["タイトル", "title"]);
  if (colTitle < 0) {
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (!h || i === colUrl) continue;
      if (h.includes("投稿") && !h.includes("url") && !h.includes("リンク") && !h.includes("permalink")) {
        colTitle = i; break;
      }
    }
  }
  const colEngRate = findCol(header, ["エンゲージメント率", "エンゲージ率", "eng率", "eng_rate"]);
  // エンゲージメント (率以外)
  let colEngagement = -1;
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (!h || i === colEngRate) continue;
    if (h.includes("エンゲージ") && !h.includes("率") && !h.includes("rate")) { colEngagement = i; break; }
  }
  const colReach = findCol(header, ["リーチ"]);

  const rankings: PostRanking[] = [];
  let runningRank = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] as unknown[]) ?? [];
    // 行が空ならスキップ
    const hasAny = row.some((c) => c != null && str(c) !== "");
    if (!hasAny) continue;
    // タイトル/URL のいずれも空ならスキップ
    const titleRaw = colTitle >= 0 ? str(row[colTitle]) : "";
    const urlRaw = colUrl >= 0 ? str(row[colUrl]) : "";
    if (!titleRaw && !urlRaw) continue;

    runningRank++;
    rankings.push({
      rank: colRank >= 0 ? num(row[colRank]) || runningRank : runningRank,
      title: extractTitle(titleRaw),
      reach: colReach >= 0 ? num(row[colReach]) : 0,
      engagement: colEngagement >= 0 ? num(row[colEngagement]) : 0,
      eng_rate: colEngRate >= 0 ? str(row[colEngRate]) : "0%",
      url: urlRaw,
    });
  }

  return rankings;
}

// ==========================================
// パーサー: 投稿詳細
// ==========================================

function parsePostDetails(wb: XLSX.WorkBook, keyword: string): PostDetail[] {
  const rows = findSheetByPartialName(wb, keyword);
  if (!rows || rows.length < 2) return [];

  const { headerIdx, header } = detectHeader(
    rows,
    ["タイトル", "投稿", "リーチ", "いいね", "保存", "日付"]
  );

  const colUrl = findCol(header, ["url", "リンク", "permalink"]);
  let colTitle = findCol(header, ["タイトル", "title"]);
  if (colTitle < 0) {
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (!h || i === colUrl) continue;
      if (h.includes("投稿") && !h.includes("url") && !h.includes("リンク") && !h.includes("permalink")) {
        colTitle = i; break;
      }
    }
  }
  const colDate = findCol(header, ["日付", "date", "投稿日"]);
  const colReach = findCol(header, ["リーチ"]);
  const colEngRate = findCol(header, ["エンゲージメント率", "エンゲージ率", "eng率"]);
  let colEngagement = -1;
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (!h || i === colEngRate) continue;
    if (h.includes("エンゲージ") && !h.includes("率") && !h.includes("rate")) { colEngagement = i; break; }
  }
  const colView = findCol(header, ["表示", "閲覧", "view", "インプレッション"]);
  const colLikes = findCol(header, ["いいね", "like"]);
  const colSaves = findCol(header, ["保存", "save"]);

  const posts: PostDetail[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] as unknown[]) ?? [];
    const titleRaw = colTitle >= 0 ? str(row[colTitle]) : "";
    const urlRaw = colUrl >= 0 ? str(row[colUrl]) : "";
    if (!titleRaw && !urlRaw) continue;

    posts.push({
      title: extractTitle(titleRaw || urlRaw),
      post_date: colDate >= 0 ? str(row[colDate]) : "",
      view: colView >= 0 ? num(row[colView]) : 0,
      reach: colReach >= 0 ? num(row[colReach]) : 0,
      engagement: colEngagement >= 0 ? num(row[colEngagement]) : 0,
      eng_rate: colEngRate >= 0 ? num(row[colEngRate]) : 0,
      likes: colLikes >= 0 ? num(row[colLikes]) : 0,
      saves: colSaves >= 0 ? num(row[colSaves]) : 0,
    });
  }

  return posts;
}

// ==========================================
// パーサー: デモグラフィクス
// ==========================================

function isIntegerLikeLabel(s: string): boolean {
  return /^\d+$/.test(s.trim());
}

function parseAgeGender(wb: XLSX.WorkBook): AgeGender[] {
  const rows = findSheetByPartialName(wb, "年齢") ?? findSheetByPartialName(wb, "性別");
  if (!rows || rows.length < 2) return [];

  const { headerIdx, header } = detectHeader(
    rows,
    ["年齢", "区分", "年代", "男", "女", "合計"]
  );

  let colAge = findCol(header, ["年齢", "年代", "区分"]);
  // 「区分」が見つからなくても、男/女列の左隣を年齢列とみなす
  const colMale = findCol(header, ["男"]);
  const colFemale = findCol(header, ["女"]);
  const colTotal = findCol(header, ["合計", "計", "total"]);

  if (colAge < 0 && colMale > 0) colAge = colMale - 1;
  if (colAge < 0) return [];

  const result: AgeGender[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] as unknown[]) ?? [];
    const ageRaw = str(row[colAge]);
    if (!ageRaw) continue;
    if (/^合計|^計$|total/i.test(ageRaw)) continue;
    if (isIntegerLikeLabel(ageRaw)) continue; // 連番インデックス除外

    const male = colMale >= 0 ? num(row[colMale]) : 0;
    const female = colFemale >= 0 ? num(row[colFemale]) : 0;
    const totalRaw = colTotal >= 0 ? num(row[colTotal]) : 0;
    result.push({
      age: ageRaw,
      male,
      female,
      total: totalRaw || male + female,
    });
  }
  return result;
}

function parseRegion(
  wb: XLSX.WorkBook,
  primaryKeyword: string,
  fallbackKeyword?: string
): RegionData[] {
  const rows =
    findSheetByPartialName(wb, primaryKeyword) ??
    (fallbackKeyword ? findSheetByPartialName(wb, fallbackKeyword) : null);
  if (!rows || rows.length < 2) return [];

  const headerKeywords = [primaryKeyword, "地域", "名", "県", "市", "割合", "比率", "人数", "件数", "数", "ユーザー"];
  const { headerIdx, header } = detectHeader(rows, headerKeywords);

  // 名前列: primary/fallbackKeyword をまずヘッダーに探す
  let colName = findCol(
    header,
    [primaryKeyword, fallbackKeyword ?? "", "地域", "県名", "市名"].filter(Boolean) as string[]
  );

  // ratio列
  const colRatio = findCol(header, ["割合", "比率", "%", "rate", "シェア"]);

  // value（人数・件数等）列: ratio列以外で数値系キーワード
  let colValue = -1;
  for (let i = 0; i < header.length; i++) {
    if (i === colName || i === colRatio) continue;
    const h = header[i];
    if (!h) continue;
    if (h.includes("人数") || h.includes("件数") || h.includes("ユーザー") ||
        h.includes("follower") || h.includes("フォロワー") || h.includes("人") ||
        h.includes("数値") || h === "数" || h === "値") {
      colValue = i;
      break;
    }
  }

  // ヘッダーから名前列が見つからない場合、データを見て推定する:
  // - 先頭列が連番数字なら2番目を名前列とみなす
  // - そうでなければ先頭列を名前列とする
  if (colName < 0) {
    const firstDataRow = (rows[headerIdx + 1] as unknown[]) ?? [];
    let foundNameCol = -1;
    for (let c = 0; c < firstDataRow.length; c++) {
      const v = firstDataRow[c];
      const s = str(v);
      if (!s) continue;
      if (typeof v === "number" || isIntegerLikeLabel(s)) continue;
      foundNameCol = c;
      break;
    }
    colName = foundNameCol >= 0 ? foundNameCol : 0;
  }

  // valueが特定できなかった場合、name列の次の数値列をvalueとする
  if (colValue < 0) {
    for (let c = colName + 1; c < header.length; c++) {
      if (c === colRatio) continue;
      const sample = (rows[headerIdx + 1] as unknown[])?.[c];
      if (typeof sample === "number") { colValue = c; break; }
      if (typeof sample === "string" && sample !== "" && !Number.isNaN(Number(sample.replace(/[,%]/g, "")))) {
        colValue = c; break;
      }
    }
  }

  // value合計（割合補完用）
  const result: RegionData[] = [];
  let valueSum = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = (rows[i] as unknown[]) ?? [];
    const name = str(row[colName]);
    if (!name) continue;
    if (isIntegerLikeLabel(name)) continue;
    if (/^合計|^総|^計$|total|other|その他/i.test(name)) continue;

    const value = colValue >= 0 ? num(row[colValue]) : 0;
    valueSum += value;

    let ratio = colRatio >= 0 ? str(row[colRatio]) : "";
    if (ratio) {
      if (!ratio.endsWith("%")) {
        const n = Number(ratio.replace(/[,\s]/g, ""));
        if (Number.isFinite(n)) {
          ratio = n <= 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
        }
      }
    }
    result.push({ name, value, ratio: ratio || "0%" });
  }

  // ratio が全部 "0%" のままで value 合計が >0 なら、value から ratio を計算
  const ratiosEmpty = result.every((r) => r.ratio === "0%" || r.ratio === "");
  if (ratiosEmpty && valueSum > 0) {
    for (const r of result) {
      r.ratio = `${((r.value / valueSum) * 100).toFixed(1)}%`;
    }
  }

  return result;
}

function parseDemographics(wb: XLSX.WorkBook): Demographics {
  return {
    age_gender: parseAgeGender(wb),
    prefectures: parseRegion(wb, "都道府県", "地域"),
    cities: parseRegion(wb, "市区町村", "市町村"),
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
      return NextResponse.json({ error: "Excelファイル(.xlsx/.xls)をアップロードしてください" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

    const summary = parseSummary(wb);
    const { trends, targetMonth } = parseMonthlyTrends(wb);
    const feedRanking = parsePostRanking(wb, "フィード");
    const reelRanking = parsePostRanking(wb, "リール");
    const feedPosts = parsePostDetails(wb, "フィード投稿");
    const reelPosts = parsePostDetails(wb, "リール投稿");
    const demographics = parseDemographics(wb);

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
