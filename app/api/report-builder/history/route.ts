import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildHistoryPoints } from "@/lib/report/kpi-history";

// ==========================================
// Phase 4a: KPI履歴取得 API
// knowledge_base からクライアントの全月分 kpi_summary を取得し、
// 同一月の重複は最新 created_at を採用して年月昇順で返す。
// レポート画面の KPI推移表・推移グラフのデータソース。
// ==========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("client_id");

    if (!clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("knowledge_base")
      .select("year_month, kpi_summary, report_text, created_at")
      .eq("client_id", clientId)
      .order("year_month", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const points = buildHistoryPoints(
      (data ?? []).map((row) => ({
        year_month: row.year_month,
        kpi_summary: (row.kpi_summary as Record<string, unknown> | null) ?? null,
        report_text: row.report_text,
        created_at: row.created_at,
      }))
    );

    return NextResponse.json({ points });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "KPI履歴の取得中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
