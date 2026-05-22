import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("master_fmt")
    .select("*")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json(null);
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { content } = body;

  if (!content) {
    return NextResponse.json({ error: "contentは必須です" }, { status: 400 });
  }

  // 現在のアクティブFMTを取得してバージョン番号を決定
  const { data: current } = await supabase
    .from("master_fmt")
    .select("version")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const newVersion = (current?.version ?? 0) + 1;

  // 既存のアクティブFMTを非アクティブ化
  await supabase
    .from("master_fmt")
    .update({ is_active: false })
    .eq("is_active", true);

  // 新バージョンを挿入
  const { data, error } = await supabase
    .from("master_fmt")
    .insert({ version: newVersion, content, is_active: true })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
