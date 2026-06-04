import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { upsertKnowledgeRow } from "@/lib/report/knowledge-upsert";

// ==========================================
// GET: 過去レポート参照
// ==========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("client_id");
    const limitSame = Number(searchParams.get("limit_same") || "6");
    const limitRandom = Number(searchParams.get("limit_random") || "4");

    if (!clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }

    // 同クライアントの直近N件
    const { data: sameClient, error: sameError } = await supabase
      .from("knowledge_base")
      .select("*")
      .eq("client_id", clientId)
      .order("year_month", { ascending: false })
      .limit(limitSame);

    if (sameError) {
      return NextResponse.json({ error: sameError.message }, { status: 500 });
    }

    // 他クライアントから多めに取得してランダムにN件選ぶ
    const { data: others, error: othersError } = await supabase
      .from("knowledge_base")
      .select("*")
      .neq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (othersError) {
      return NextResponse.json({ error: othersError.message }, { status: 500 });
    }

    const randomOthers = (others ?? [])
      .sort(() => Math.random() - 0.5)
      .slice(0, limitRandom);

    return NextResponse.json({
      same_client: sameClient ?? [],
      random_others: randomOthers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ナレッジ参照中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==========================================
// POST: レポート保存
// ==========================================

export async function POST(request: NextRequest) {
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
        { error: "year_month は YYYY/MM 形式で指定してください（例: 2025/12）" },
        { status: 400 }
      );
    }

    // マージ upsert に統一（同一 client_id × year_month は1レコードへ収束）
    const result = await upsertKnowledgeRow({
      client_id,
      year_month,
      fmt_version,
      kpi_summary: kpi_summary ?? {},
      top_posts: top_posts ?? {},
      excel_parsed: excel_parsed ?? {},
      report_text,
    });

    return NextResponse.json(
      {
        id: result.id,
        action: result.action,
        deleted_count: result.deleted_count,
      },
      { status: result.action === "created" ? 201 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "ナレッジ保存中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
