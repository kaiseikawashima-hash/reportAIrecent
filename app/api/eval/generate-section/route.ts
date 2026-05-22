import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { callGemini } from "@/lib/gemini";
import type { GeminiMessage } from "@/lib/gemini";
import type {
  ClientPlan,
  DiffCalcResult,
  ExcelParseResult,
} from "@/lib/types";
import type { EvalSection } from "@/lib/eval/types";
import {
  buildDiffContextText,
  buildExcelDetailText,
  fillPrompt,
  prevYearMonth,
  toSlashYearMonth,
  type PromptPlaceholders,
} from "@/lib/eval/promptResolver";

const VALID_SECTIONS: EvalSection[] = ["summary", "follower", "reach", "account"];

function isSection(v: unknown): v is EvalSection {
  return typeof v === "string" && (VALID_SECTIONS as string[]).includes(v);
}

const OPERATOR_MEMO_DEFAULT = "（特記事項なし）";
const PREV_REPORT_FALLBACK = "※ 参照できる前月レポートがありませんでした";
const EXPRESSION_FALLBACK = "※ 参照できる表現ナレッジがありませんでした";

// ==========================================
// 参照状況の型
// ==========================================

interface PrevReportReferenced {
  referenced: true;
  knowledge_base_id: string;
  year_month: string;
}

interface PrevReportSkipped {
  referenced: false;
  reason: string;
}

type PrevReportRef = PrevReportReferenced | PrevReportSkipped;

interface ExpressionReferenced {
  referenced: true;
  best_practice_id: string;
  knowledge_base_id: string;
  year_month: string;
}

interface ExpressionSkipped {
  referenced: false;
  reason: string;
}

type ExpressionRef = ExpressionReferenced | ExpressionSkipped;

interface ReferenceStatus {
  prev_report: PrevReportRef;
  expression_knowledge: ExpressionRef;
}

// ==========================================
// 内部API呼び出し
// ==========================================

async function parseExcelInternal(file: File, request: NextRequest): Promise<ExcelParseResult> {
  const fd = new FormData();
  fd.append("file", file);
  const url = new URL("/api/parse-excel", request.url);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "Excel解析に失敗しました" }));
    throw new Error(errBody.error ?? "Excel解析に失敗しました");
  }
  return (await res.json()) as ExcelParseResult;
}

async function calcDiffInternal(
  excel: ExcelParseResult,
  request: NextRequest
): Promise<DiffCalcResult> {
  const url = new URL("/api/calc-diff", request.url);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(excel),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: "差分計算に失敗しました" }));
    throw new Error(errBody.error ?? "差分計算に失敗しました");
  }
  return (await res.json()) as DiffCalcResult;
}

// ==========================================
// Layer 4 テキスト構築（過去レポート1件 + 表現ナレッジ1件）
// ==========================================

function buildKnowledgeText(params: {
  prevReportText: string | null;
  prevYearMonth: string;
  expressionText: string | null;
  expressionYearMonth: string | null;
  expressionReason: string | null;
}): string {
  const lines: string[] = [];

  lines.push(
    "※ AI考察用注記: 過去レポートは前月までの文脈把握用です。トーン・切り口に影響されないこと"
  );
  lines.push("");
  lines.push(`# 直前月（${params.prevYearMonth}）の正解レポート`);
  if (params.prevReportText && params.prevReportText.trim()) {
    lines.push(params.prevReportText.trim());
  } else {
    lines.push(PREV_REPORT_FALLBACK);
  }
  lines.push("");
  lines.push("# 表現/文体ナレッジ（best_practices）");
  if (params.expressionText && params.expressionText.trim()) {
    if (params.expressionYearMonth) lines.push(`対象月: ${params.expressionYearMonth}`);
    if (params.expressionReason) lines.push(`登録理由: ${params.expressionReason}`);
    lines.push("");
    lines.push(params.expressionText.trim());
  } else {
    lines.push(EXPRESSION_FALLBACK);
  }

  return lines.join("\n");
}

// ==========================================
// Gemini レスポンスからテキスト抽出
// ==========================================

async function extractGeminiText(response: Response): Promise<string> {
  const json = await response.json();
  const candidates = json.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("Geminiからの応答が空です");
  }
  const parts = candidates[0].content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("Geminiからのコンテンツが空です");
  }
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

// ==========================================
// POST: セクション単体生成
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const section = form.get("section");
    const promptVersionId = form.get("prompt_version_id");
    const clientId = form.get("client_id");
    const yearMonth = form.get("year_month");
    const excelFile = form.get("excel_file");

    if (!isSection(section)) {
      return NextResponse.json(
        { error: "section は summary/follower/reach/account のいずれかです" },
        { status: 400 }
      );
    }
    if (typeof promptVersionId !== "string" || !promptVersionId) {
      return NextResponse.json({ error: "prompt_version_id は必須です" }, { status: 400 });
    }
    if (typeof clientId !== "string" || !clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }
    if (typeof yearMonth !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "year_month は YYYY-MM 形式で入力してください" },
        { status: 400 }
      );
    }
    if (!(excelFile instanceof File)) {
      return NextResponse.json({ error: "excel_file は必須です" }, { status: 400 });
    }

    // 1. プロンプト取得
    const { data: promptRow, error: promptErr } = await supabase
      .from("eval_prompt_versions")
      .select("id, section, version_label, prompt_template")
      .eq("id", promptVersionId)
      .single();

    if (promptErr || !promptRow) {
      return NextResponse.json({ error: "指定したプロンプトが見つかりません" }, { status: 404 });
    }
    if (promptRow.section !== section) {
      return NextResponse.json(
        { error: `プロンプトのセクション(${promptRow.section})と指定セクション(${section})が一致しません` },
        { status: 400 }
      );
    }

    // 2. master_fmt 取得（is_active=true の最新）
    const { data: fmtData, error: fmtErr } = await supabase
      .from("master_fmt")
      .select("version, content")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (fmtErr || !fmtData) {
      return NextResponse.json({ error: "アクティブなマスターFMTが見つかりません" }, { status: 500 });
    }

    // 3. クライアント情報取得
    const { data: clientData, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, area, auto_memo, plan")
      .eq("id", clientId)
      .single();

    if (clientErr || !clientData) {
      return NextResponse.json({ error: "クライアントが見つかりません" }, { status: 404 });
    }

    const plan: ClientPlan = clientData.plan === "standard" ? "standard" : "advance";

    // 4. Excel パース
    const excelData = await parseExcelInternal(excelFile, request);

    // 5. 差分計算
    const diffContext = await calcDiffInternal(excelData, request);

    // 6. 直前月の正解レポート取得（過去レポート1件）
    const targetMonthSlash = toSlashYearMonth(yearMonth);
    const prevMonthSlash = prevYearMonth(yearMonth);

    const { data: prevKnowledgeRow } = await supabase
      .from("knowledge_base")
      .select("id, year_month, report_text")
      .eq("client_id", clientId)
      .eq("year_month", prevMonthSlash)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevReportText = prevKnowledgeRow?.report_text?.trim() ?? null;
    const prevReportRef: PrevReportRef = prevReportText && prevKnowledgeRow
      ? {
          referenced: true,
          knowledge_base_id: prevKnowledgeRow.id,
          year_month: prevKnowledgeRow.year_month,
        }
      : {
          referenced: false,
          reason: prevKnowledgeRow
            ? `${prevMonthSlash} の knowledge_base レコードに report_text がありません`
            : `${prevMonthSlash} の knowledge_base レコードが見つかりません`,
        };

    // 6-b. 表現/文体ナレッジ取得（best_practices 1件 → 紐づく knowledge_base.report_text）
    const { data: bpRow } = await supabase
      .from("best_practices")
      .select("id, knowledge_base_id, year_month, reason")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let expressionReportText: string | null = null;
    let expressionYearMonth: string | null = null;
    let expressionRef: ExpressionRef;

    if (!bpRow) {
      expressionRef = {
        referenced: false,
        reason: "best_practices テーブルにレコードが存在しません",
      };
    } else if (!bpRow.knowledge_base_id) {
      expressionRef = {
        referenced: false,
        reason: "best_practices レコードに knowledge_base_id が紐付いていません",
      };
    } else {
      const { data: bpKb } = await supabase
        .from("knowledge_base")
        .select("id, year_month, report_text")
        .eq("id", bpRow.knowledge_base_id)
        .maybeSingle();

      const text = bpKb?.report_text?.trim() ?? null;
      if (bpKb && text) {
        expressionReportText = text;
        expressionYearMonth = bpKb.year_month;
        expressionRef = {
          referenced: true,
          best_practice_id: bpRow.id,
          knowledge_base_id: bpRow.knowledge_base_id,
          year_month: bpKb.year_month,
        };
      } else {
        expressionRef = {
          referenced: false,
          reason: bpKb
            ? "best_practices に紐づく knowledge_base.report_text が空です"
            : "best_practices に紐づく knowledge_base レコードが見つかりません",
        };
      }
    }

    const referenceStatus: ReferenceStatus = {
      prev_report: prevReportRef,
      expression_knowledge: expressionRef,
    };

    const knowledgeText = buildKnowledgeText({
      prevReportText,
      prevYearMonth: prevMonthSlash,
      expressionText: expressionReportText,
      expressionYearMonth,
      expressionReason: bpRow?.reason ?? null,
    });

    // 7. プレースホルダ置換
    const diffText = buildDiffContextText(diffContext);
    const detailText = buildExcelDetailText(excelData, section, plan);

    const placeholders: PromptPlaceholders = {
      master_fmt: fmtData.content,
      client_name: clientData.name,
      client_area: clientData.area ?? "未設定",
      client_auto_memo: clientData.auto_memo ?? "未設定",
      diff_text: diffText,
      detail_text: detailText,
      knowledge_text: knowledgeText,
      operator_memo: OPERATOR_MEMO_DEFAULT,
      previous_sections: "",
    };

    const filledPrompt = fillPrompt(promptRow.prompt_template, placeholders);

    // 8. Gemini 呼び出し
    const messages: GeminiMessage[] = [{ role: "user", parts: [{ text: filledPrompt }] }];
    const geminiRes = await callGemini(messages, { stream: false });
    const generatedText = await extractGeminiText(geminiRes);

    // 9. 該当テストケースを検索（client_id + target_month "/" 形式）
    const { data: testCaseRow } = await supabase
      .from("eval_test_cases")
      .select("id")
      .eq("client_id", clientId)
      .eq("target_month", targetMonthSlash)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const testCaseId = testCaseRow?.id ?? null;

    // 10. eval_runs 保存
    const actualReferences = {
      prompt_template: promptRow.prompt_template,
      filled_prompt: filledPrompt,
      master_fmt_version: fmtData.version,
      master_fmt_content: fmtData.content,
      knowledge_text: knowledgeText,
      reference_status: referenceStatus,
      prev_report_text: prevReportText,
      expression_knowledge_text: expressionReportText,
      client_info: {
        name: clientData.name,
        area: clientData.area,
        auto_memo: clientData.auto_memo,
      },
      excel_parsed: excelData,
      diff_context: diffContext,
      operator_memo: OPERATOR_MEMO_DEFAULT,
    };

    const { data: runRow, error: runErr } = await supabase
      .from("eval_runs")
      .insert({
        test_case_id: testCaseId,
        prompt_version_id: promptRow.id,
        section,
        generated_text: generatedText,
        generation_model: "gemini-2.5-flash",
        actual_references: actualReferences,
        status: "generated",
      })
      .select("id")
      .single();

    if (runErr) {
      return NextResponse.json(
        { error: `生成は成功しましたが eval_runs への保存に失敗しました: ${runErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      run_id: runRow.id,
      section,
      generated_text: generatedText,
      knowledge_text: knowledgeText,
      reference_status: referenceStatus,
      prev_report_text: prevReportText,
      expression_knowledge_text: expressionReportText,
      test_case_id: testCaseId,
      actual_references: actualReferences,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "セクション生成中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
