import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

const VALID_PLANS = ["standard", "advance"] as const;

function normalizePlan(value: unknown): "standard" | "advance" {
  return VALID_PLANS.includes(value as "standard" | "advance")
    ? (value as "standard" | "advance")
    : "advance";
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, area, hp_url, operator_memo, auto_memo, plan } = body;

  if (!name) {
    return NextResponse.json({ error: "会社名は必須です" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      area: area ?? null,
      hp_url: hp_url ?? null,
      operator_memo: operator_memo ?? null,
      auto_memo: auto_memo ?? null,
      plan: normalizePlan(plan),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "idは必須です" }, { status: 400 });
  }

  if (updates.plan !== undefined) {
    updates.plan = normalizePlan(updates.plan);
  }

  const { data, error } = await supabase
    .from("clients")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
