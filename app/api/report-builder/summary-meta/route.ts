import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { upsertKnowledgeRow } from "@/lib/report/knowledge-upsert";
import { compactStringMap } from "@/lib/report/summary-metrics";

// ==========================================
// Phase 4a6: サマリー指標テーブルの「目標 / 要因 / 次月対策」保存 API
// kpi_summary 内の goals / factors / next_actions（指標キー→文字列）だけを
// merge upsert で保存する。report_text を渡さないため、
// 考察本文・数値・デモグラ・fmt_version は保持される（Phase 4a2 のマージ仕様）。
// ==========================================

const YEAR_MONTH_RE = /^\d{4}\/(0[1-9]|1[0-2])$/;

async function fetchActiveFmtVersion(): Promise<number> {
  const { data } = await supabase
    .from("master_fmt")
    .select("version")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.version === "number" ? data.version : 1;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const clientId = body.client_id;
    const yearMonth = body.year_month;

    if (typeof clientId !== "string" || !clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }
    if (typeof yearMonth !== "string" || !YEAR_MONTH_RE.test(yearMonth)) {
      return NextResponse.json(
        { error: "year_month は YYYY/MM 形式で指定してください" },
        { status: 400 }
      );
    }

    // 入力された3マップだけを正規化（空文字は落とす）
    const goals = compactStringMap((body.goals as Record<string, string>) ?? {});
    const factors = compactStringMap((body.factors as Record<string, string>) ?? {});
    const nextActions = compactStringMap(
      (body.next_actions as Record<string, string>) ?? {}
    );

    // kpi_summary のトップレベルキーとしてマージ（数値・デモグラ・考察は保持）
    const kpiSummary: Record<string, unknown> = {
      goals,
      factors,
      next_actions: nextActions,
    };

    const fmtVersion = await fetchActiveFmtVersion();
    const result = await upsertKnowledgeRow({
      client_id: clientId,
      year_month: yearMonth,
      fmt_version: fmtVersion,
      kpi_summary: kpiSummary,
    });

    return NextResponse.json(
      { id: result.id, action: result.action },
      { status: result.action === "created" ? 201 : 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "サマリー目標等の保存中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
