import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { upsertKnowledgeRow } from "@/lib/report/knowledge-upsert";

// ==========================================
// Phase 4a2: レポート保存 API（マージ UPSERT に統一）
// 同一 client_id + year_month は upsertKnowledgeRow で1レコードへ収束させる。
// - report_text 付きの保存 → 当月の数値・デモグラ・本文を更新
// - 過去に手打ちで入れた推移数値（別月レコード）はそのまま保持される
// ※ 重複INSERT（例: ノコス2026/03）の再発防止。/api/knowledge POST と共通ロジック。
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

    const result = await upsertKnowledgeRow({
      client_id,
      year_month,
      fmt_version,
      kpi_summary: kpi_summary ?? {},
      top_posts: top_posts ?? {},
      excel_parsed: excel_parsed ?? {},
      report_text,
    });

    // 既存レコードを更新した、または重複を削除した場合は「置き換え」扱いで表示する
    const replaced = result.action === "updated";
    const deletedCount = result.deleted_count;
    return NextResponse.json(
      {
        id: result.id,
        action: result.action,
        replaced,
        deleted_count: deletedCount,
      },
      { status: result.action === "created" ? 201 : 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "レポート保存中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
