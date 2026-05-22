import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("best_practices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { knowledge_base_id, reason } = body;

    if (!knowledge_base_id) {
      return NextResponse.json(
        { error: "knowledge_base_id は必須です" },
        { status: 400 }
      );
    }

    const { data: kb, error: kbError } = await supabase
      .from("knowledge_base")
      .select("client_id, year_month")
      .eq("id", knowledge_base_id)
      .single();

    if (kbError || !kb) {
      return NextResponse.json(
        { error: "対象のナレッジレコードが見つかりません" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("best_practices")
      .insert({
        knowledge_base_id,
        client_id: kb.client_id,
        year_month: kb.year_month,
        reason: reason ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ベストプラクティス登録中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const knowledgeBaseId = searchParams.get("knowledge_base_id");

    if (!knowledgeBaseId) {
      return NextResponse.json(
        { error: "knowledge_base_id は必須です" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("best_practices")
      .delete()
      .eq("knowledge_base_id", knowledgeBaseId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ベストプラクティス解除中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
