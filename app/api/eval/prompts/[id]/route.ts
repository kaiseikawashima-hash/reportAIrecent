import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DEFAULT_REFERENCE_CONFIG, type PromptReferenceConfig } from "@/lib/eval/types";

// ==========================================
// GET: 単一プロンプト
// ==========================================

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("eval_prompt_versions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "プロンプトが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ==========================================
// PUT: 編集
// ==========================================
// 編集可能: prompt_template, description, reference_config, is_active
// 不変: section, version_label

const EDITABLE_FIELDS = ["prompt_template", "description", "is_active"] as const;

function normalizeReferenceConfig(input: unknown): PromptReferenceConfig {
  if (input == null || typeof input !== "object") {
    return { ...DEFAULT_REFERENCE_CONFIG };
  }
  const v = input as Record<string, unknown>;
  return {
    same_client_limit:
      typeof v.same_client_limit === "number" ? v.same_client_limit : DEFAULT_REFERENCE_CONFIG.same_client_limit,
    other_client_limit:
      typeof v.other_client_limit === "number" ? v.other_client_limit : DEFAULT_REFERENCE_CONFIG.other_client_limit,
    use_best_practice:
      typeof v.use_best_practice === "boolean" ? v.use_best_practice : DEFAULT_REFERENCE_CONFIG.use_best_practice,
  };
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};

    for (const key of EDITABLE_FIELDS) {
      if (key in body) updates[key] = body[key];
    }

    if ("reference_config" in body) {
      updates.reference_config = normalizeReferenceConfig(body.reference_config);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("eval_prompt_versions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "プロンプトが見つかりません" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==========================================
// DELETE: ソフトデリート
// ==========================================

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("eval_prompt_versions")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "プロンプトが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
