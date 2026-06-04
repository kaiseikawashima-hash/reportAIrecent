import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { extractPosts } from "@/lib/report/post-metrics";

// ==========================================
// Phase 4a5: 前月レコードの投稿明細取得 API
// リーチ分析の「先月実績」列用に、knowledge_base.excel_parsed から
// 指定 (client_id, year_month) の feed_posts / reel_posts を返す。
// calc-diff の前月取得と同じく最新 created_at を採用。
// レコード無し/明細無しは found=false・空配列で返す（落とさない）。
// ==========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("client_id");
    const yearMonth = searchParams.get("year_month");

    if (!clientId || !yearMonth) {
      return NextResponse.json(
        { error: "client_id と year_month は必須です" },
        { status: 400 }
      );
    }
    if (!/^\d{4}\/(0[1-9]|1[0-2])$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "year_month は YYYY/MM 形式で指定してください" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("knowledge_base")
      .select("excel_parsed")
      .eq("client_id", clientId)
      .eq("year_month", yearMonth)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({
        found: false,
        year_month: yearMonth,
        feed_posts: [],
        reel_posts: [],
      });
    }

    const excelParsed = (data.excel_parsed as Record<string, unknown> | null) ?? null;
    return NextResponse.json({
      found: true,
      year_month: yearMonth,
      feed_posts: extractPosts(excelParsed, "feed_posts"),
      reel_posts: extractPosts(excelParsed, "reel_posts"),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "前月投稿明細の取得中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
