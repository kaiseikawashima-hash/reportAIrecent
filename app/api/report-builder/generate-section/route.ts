import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callGemini } from "@/lib/gemini";
import type { GeminiMessage } from "@/lib/gemini";
import type { ClientPlan, DiffCalcResult, ExcelParseResult } from "@/lib/types";
import type { EvalSection } from "@/lib/eval/types";
import {
  buildDiffContextText,
  buildExcelDetailText,
  fillPrompt,
  prevYearMonth,
  toSlashYearMonth,
  type PromptPlaceholders,
} from "@/lib/eval/promptResolver";
import { buildKnowledgeContext } from "@/lib/report/knowledge-context";

// ==========================================
// Phase 4a: レポート作成画面用のセクション生成 API
// /api/eval/generate-section との違い:
// - プロンプトは各セクションの is_active 最新版を自動選択（IDの指定不要）
// - Excel は解析済み JSON で受け取る（画面側で /api/parse-excel 済み）
// - previous_sections / operator_memo を受け取る（順次生成の文脈引き継ぎ）
// - eval_runs への記録は行わない（検証用ではないため）
// ==========================================

const VALID_SECTIONS: EvalSection[] = ["summary", "follower", "reach", "account"];

function isSection(v: unknown): v is EvalSection {
  return typeof v === "string" && (VALID_SECTIONS as string[]).includes(v);
}

function isExcelParseResult(v: unknown): v is ExcelParseResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.summary === "object" &&
    o.summary !== null &&
    Array.isArray(o.monthly_trends) &&
    Array.isArray(o.feed_ranking) &&
    typeof o.demographics === "object"
  );
}

async function calcDiffInternal(
  excel: ExcelParseResult,
  request: NextRequest,
  clientId: string,
  targetMonth: string
): Promise<DiffCalcResult> {
  const url = new URL("/api/calc-diff", request.url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...excel,
      client_id: clientId,
      target_month_override: targetMonth,
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "差分計算に失敗しました" }));
    throw new Error(errBody.error ?? "差分計算に失敗しました");
  }
  return (await res.json()) as DiffCalcResult;
}

async function extractGeminiText(response: Response): Promise<string> {
  const json = await response.json();
  const parts = json.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("Geminiからの応答が空です");
  }
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      section,
      client_id: clientId,
      year_month: yearMonth,
      excel_parsed: excelParsed,
      operator_memo: operatorMemo,
      previous_sections: previousSections,
    } = body as Record<string, unknown>;

    if (!isSection(section)) {
      return NextResponse.json(
        { error: "section は summary/follower/reach/account のいずれかです" },
        { status: 400 }
      );
    }
    if (typeof clientId !== "string" || !clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }
    if (
      typeof yearMonth !== "string" ||
      !/^\d{4}[-/](0[1-9]|1[0-2])$/.test(yearMonth)
    ) {
      return NextResponse.json(
        { error: "year_month は YYYY-MM 形式で入力してください" },
        { status: 400 }
      );
    }
    if (!isExcelParseResult(excelParsed)) {
      return NextResponse.json(
        { error: "excel_parsed（Excel解析結果）が不正です" },
        { status: 400 }
      );
    }

    // 1. プロンプト自動選択（is_active を優先し、最新 created_at の版を使う）
    const { data: promptRow, error: promptErr } = await supabase
      .from("eval_prompt_versions")
      .select("id, section, version_label, prompt_template")
      .eq("section", section)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (promptErr || !promptRow) {
      return NextResponse.json(
        { error: `セクション ${section} のプロンプトが見つかりません` },
        { status: 404 }
      );
    }

    // 2. master_fmt（is_active=true の最新）
    const { data: fmtData, error: fmtErr } = await supabase
      .from("master_fmt")
      .select("version, content")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (fmtErr || !fmtData) {
      return NextResponse.json(
        { error: "アクティブなマスターFMTが見つかりません" },
        { status: 500 }
      );
    }

    // 3. クライアント情報
    const { data: clientData, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, area, auto_memo, plan")
      .eq("id", clientId)
      .single();

    if (clientErr || !clientData) {
      return NextResponse.json({ error: "クライアントが見つかりません" }, { status: 404 });
    }
    const plan: ClientPlan = clientData.plan === "standard" ? "standard" : "advance";

    // 4. 差分計算（knowledge_base 参照型）
    const targetMonthSlash = toSlashYearMonth(yearMonth);
    const prevMonthSlash = prevYearMonth(yearMonth);
    const diffContext = await calcDiffInternal(
      excelParsed,
      request,
      clientId,
      targetMonthSlash
    );

    // 5. ナレッジコンテキスト（直前月レポート + 表現ナレッジ）
    const knowledge = await buildKnowledgeContext(clientId, prevMonthSlash);

    // 6. プレースホルダ置換 → Gemini
    const placeholders: PromptPlaceholders = {
      master_fmt: fmtData.content,
      client_name: clientData.name,
      client_area: clientData.area ?? "未設定",
      client_auto_memo: clientData.auto_memo ?? "未設定",
      diff_text: buildDiffContextText(diffContext),
      detail_text: buildExcelDetailText(excelParsed, section, plan),
      knowledge_text: knowledge.knowledgeText,
      operator_memo:
        typeof operatorMemo === "string" && operatorMemo.trim()
          ? operatorMemo.trim()
          : "（特記事項なし）",
      previous_sections:
        typeof previousSections === "string" ? previousSections : "",
    };

    const filledPrompt = fillPrompt(promptRow.prompt_template, placeholders);
    const messages: GeminiMessage[] = [{ role: "user", parts: [{ text: filledPrompt }] }];
    const geminiRes = await callGemini(messages, { stream: false });
    const generatedText = await extractGeminiText(geminiRes);

    return NextResponse.json({
      section,
      generated_text: generatedText,
      prompt_version_label: promptRow.version_label,
      fmt_version: fmtData.version,
      current_month: targetMonthSlash,
      prev_month: prevMonthSlash,
      reference_status: {
        prev_report: knowledge.prevReport,
        expression_knowledge: knowledge.expression,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "セクション生成中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
