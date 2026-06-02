import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

// ==========================================
// DELETE: ナレッジレコードを物理削除
// best_practices は ON DELETE CASCADE で連動削除される
// 不可逆な破壊的操作のため、サーバー側で APP_PASSWORD を検証する
// ==========================================

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("knowledge_base")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json(
      { error: "対象のナレッジレコードが見つかりません" },
      { status: 404 }
    );
  }

  const { error: deleteErr } = await supabase
    .from("knowledge_base")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
