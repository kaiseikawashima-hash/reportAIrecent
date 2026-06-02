import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

// ==========================================
// Phase 4a: レポート保存 API（UPSERT）
// 同一 client_id + year_month の既存レコードを削除してから INSERT し、
// 重複登録（例: ノコス2026/03 が2件入っていた問題）の再発を防ぐ。
// ※ /api/knowledge POST（本番の追記型保存）は変更せずそのまま残す
// ==========================================

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const {
      client_id,
      year_month,
      fmt_version,
      kpi_summary,
      top_posts,
      excel_parsed,
      report_text,
    } = body;

    if (!client_id || !year_month || fmt_version == null || !report_text) {
      return NextResponse.json(
        { error: "client_id, year_month, fmt_version, report_text は必須です" },
        { status: 400 }
      );
    }
    if (!/^\d{4}\/(0[1-9]|1[0-2])$/.test(year_month)) {
      return NextResponse.json(
        { error: "year_month は YYYY/MM 形式で指定してください（例: 2026/03）" },
        { status: 400 }
      );
    }
    if (typeof fmt_version !== "number" || !Number.isInteger(fmt_version)) {
      return NextResponse.json(
        { error: "fmt_version は整数で指定してください" },
        { status: 400 }
      );
    }

    // 既存レコードを削除（UPSERT: 重複INSERT防止）
    // best_practices は ON DELETE CASCADE で連動削除される
    const { data: deleted, error: deleteErr } = await supabase
      .from("knowledge_base")
      .delete()
      .eq("client_id", client_id)
      .eq("year_month", year_month)
      .select("id");

    if (deleteErr) {
      return NextResponse.json(
        { error: `既存レコードの削除に失敗しました: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("knowledge_base")
      .insert({
        client_id,
        year_month,
        fmt_version,
        kpi_summary: kpi_summary ?? {},
        top_posts: top_posts ?? {},
        excel_parsed: excel_parsed ?? {},
        report_text,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const deletedCount = deleted?.length ?? 0;
    return NextResponse.json(
      { ...data, replaced: deletedCount > 0, deleted_count: deletedCount },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "レポート保存中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
