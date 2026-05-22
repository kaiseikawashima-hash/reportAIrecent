import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DEFAULT_REFERENCE_CONFIG, type EvalSection, type PromptReferenceConfig } from "@/lib/eval/types";

const VALID_SECTIONS: EvalSection[] = ["summary", "follower", "reach", "account"];

function isSection(v: unknown): v is EvalSection {
  return typeof v === "string" && (VALID_SECTIONS as string[]).includes(v);
}

// ==========================================
// GET: プロンプト一覧
// ==========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section");
  const isActiveParam = searchParams.get("is_active");

  let isActiveFilter: boolean | null = true;
  if (isActiveParam === "false") isActiveFilter = false;
  else if (isActiveParam === "all") isActiveFilter = null;

  let query = supabase
    .from("eval_prompt_versions")
    .select("*")
    .order("section", { ascending: true })
    .order("created_at", { ascending: false });

  if (isActiveFilter !== null) query = query.eq("is_active", isActiveFilter);
  if (section) {
    if (!isSection(section)) {
      return NextResponse.json({ error: "section が不正です" }, { status: 400 });
    }
    query = query.eq("section", section);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ==========================================
// POST: 新規作成
// ==========================================

interface CreateBody {
  section: EvalSection;
  version_label: string;
  prompt_template: string;
  description?: string | null;
  parent_version_id?: string | null;
  reference_config?: Partial<PromptReferenceConfig>;
}

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    if (!isSection(body.section)) {
      return NextResponse.json({ error: "section は summary/follower/reach/account のいずれかです" }, { status: 400 });
    }
    if (!body.version_label || typeof body.version_label !== "string") {
      return NextResponse.json({ error: "version_label は必須です" }, { status: 400 });
    }
    if (!body.prompt_template || typeof body.prompt_template !== "string") {
      return NextResponse.json({ error: "prompt_template は必須です" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("eval_prompt_versions")
      .insert({
        section: body.section,
        version_label: body.version_label.trim(),
        prompt_template: body.prompt_template,
        description: body.description ?? null,
        parent_version_id: body.parent_version_id ?? null,
        reference_config: normalizeReferenceConfig(body.reference_config),
      })
      .select()
      .single();

    if (error) {
      // unique(section, version_label) 制約違反
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `同じセクション(${body.section})に同名のバージョンラベル(${body.version_label})が既に存在します` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "プロンプト作成中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
