// ==========================================
// Phase 4a: レポート生成用の Layer 4（ナレッジ）コンテキスト構築
// /api/eval/generate-section と同等の参照ロジック
// （直前月レポート1件 + 表現/文体ナレッジ best_practices 1件）
// ==========================================

import { supabase } from "@/lib/supabase";

const PREV_REPORT_FALLBACK = "※ 参照できる前月レポートがありませんでした";
const EXPRESSION_FALLBACK = "※ 参照できる表現ナレッジがありませんでした";

export interface PrevReportRef {
  referenced: boolean;
  year_month: string;
  reason?: string;
}

export interface ExpressionRef {
  referenced: boolean;
  year_month?: string;
  reason?: string;
}

export interface KnowledgeContext {
  knowledgeText: string;
  prevReport: PrevReportRef;
  expression: ExpressionRef;
}

/**
 * 直前月の正解レポートと表現ナレッジを取得し、
 * プロンプトの {knowledge_text} に入れるテキストを構築する。
 */
export async function buildKnowledgeContext(
  clientId: string,
  prevMonthSlash: string
): Promise<KnowledgeContext> {
  // 直前月の正解レポート（重複月は最新 created_at を採用）
  const { data: prevRow } = await supabase
    .from("knowledge_base")
    .select("id, year_month, report_text")
    .eq("client_id", clientId)
    .eq("year_month", prevMonthSlash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevReportText = prevRow?.report_text?.trim() ?? null;
  const prevReport: PrevReportRef = prevReportText
    ? { referenced: true, year_month: prevMonthSlash }
    : {
        referenced: false,
        year_month: prevMonthSlash,
        reason: prevRow
          ? `${prevMonthSlash} のレコードに report_text がありません`
          : `${prevMonthSlash} のレコードが見つかりません`,
      };

  // 表現/文体ナレッジ（best_practices 最新1件 → 紐づく knowledge_base.report_text）
  const { data: bpRow } = await supabase
    .from("best_practices")
    .select("id, knowledge_base_id, year_month, reason")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let expressionText: string | null = null;
  let expression: ExpressionRef;

  if (!bpRow?.knowledge_base_id) {
    expression = {
      referenced: false,
      reason: bpRow
        ? "best_practices に knowledge_base_id が紐付いていません"
        : "best_practices にレコードが存在しません",
    };
  } else {
    const { data: bpKb } = await supabase
      .from("knowledge_base")
      .select("id, year_month, report_text")
      .eq("id", bpRow.knowledge_base_id)
      .maybeSingle();

    const text = bpKb?.report_text?.trim() ?? null;
    if (bpKb && text) {
      expressionText = text;
      expression = { referenced: true, year_month: bpKb.year_month };
    } else {
      expression = {
        referenced: false,
        reason: bpKb
          ? "best_practices に紐づく report_text が空です"
          : "best_practices に紐づくレコードが見つかりません",
      };
    }
  }

  const lines: string[] = [
    "※ AI考察用注記: 過去レポートは前月までの文脈把握用です。トーン・切り口に影響されないこと",
    "",
    `# 直前月（${prevMonthSlash}）の正解レポート`,
    prevReportText ?? PREV_REPORT_FALLBACK,
    "",
    "# 表現/文体ナレッジ（best_practices）",
  ];
  if (expressionText) {
    if (expression.year_month) lines.push(`対象月: ${expression.year_month}`);
    if (bpRow?.reason) lines.push(`登録理由: ${bpRow.reason}`);
    lines.push("", expressionText);
  } else {
    lines.push(EXPRESSION_FALLBACK);
  }

  return {
    knowledgeText: lines.join("\n"),
    prevReport,
    expression,
  };
}
