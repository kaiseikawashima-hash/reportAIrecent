import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { callGemini, type GeminiMessage } from "@/lib/gemini";
import type { ExcelParseResult } from "@/lib/types";
import { excelToKpiSummary } from "@/lib/excel-to-kpi";
import { pickKpiNumber, prevYearMonth } from "@/lib/report/kpi-history";
import { SUMMARY_METRICS, SUMMARY_METRIC_KEYS } from "@/lib/report/summary-metrics";

// ==========================================
// Phase 4a6: サマリー指標テーブルの「要因 / 次月対策」AI生成 API
// 指標ごとに { factor, next_action } を JSON で返すよう Gemini に指示する
// （構造化を優先。narrative なサマリー考察は従来の generate-section が担当）。
// 生成結果は画面側で各セルに入り、手編集・保存できる。
// ==========================================

function isExcelParseResult(v: unknown): v is ExcelParseResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.summary === "object" && Array.isArray(o.monthly_trends);
}

function diffText(current: number | null, prev: number | null): string {
  if (current === null) return "データなし";
  if (prev === null) return `${current.toLocaleString()}（前月データなし）`;
  if (prev === 0) {
    return `${current.toLocaleString()}（前月0）`;
  }
  const rate = ((current - prev) / prev) * 100;
  const sign = rate >= 0 ? "+" : "";
  return `${current.toLocaleString()}（前月${prev.toLocaleString()} / ${sign}${rate.toFixed(1)}%）`;
}

/** Gemini 応答からコードフェンスを除去して最初の JSON オブジェクトを取り出す */
function parseJsonObject(text: string): Record<string, unknown> | null {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function extractGeminiText(response: Response): Promise<string> {
  const json = await response.json();
  const parts = json.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) throw new Error("Geminiからの応答が空です");
  return parts.map((p: { text?: string }) => p.text ?? "").join("");
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const clientId = body.client_id;
    const yearMonth = body.year_month; // "YYYY/MM"
    const excelParsed = body.excel_parsed;
    const operatorMemo = typeof body.operator_memo === "string" ? body.operator_memo.trim() : "";

    if (typeof clientId !== "string" || !clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }
    if (typeof yearMonth !== "string" || !/^\d{4}\/(0[1-9]|1[0-2])$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "year_month は YYYY/MM 形式で指定してください" },
        { status: 400 }
      );
    }
    if (!isExcelParseResult(excelParsed)) {
      return NextResponse.json({ error: "excel_parsed が不正です" }, { status: 400 });
    }

    const currentKpi = excelToKpiSummary(excelParsed) as unknown as Record<string, unknown>;

    // クライアント属性
    const { data: clientData } = await supabase
      .from("clients")
      .select("name, area, auto_memo")
      .eq("id", clientId)
      .maybeSingle();

    // 前月レコードの kpi_summary（前月比の文脈用）
    const prevMonth = prevYearMonth(yearMonth);
    let prevKpi: Record<string, unknown> | null = null;
    if (prevMonth) {
      const { data: prevRow } = await supabase
        .from("knowledge_base")
        .select("kpi_summary")
        .eq("client_id", clientId)
        .eq("year_month", prevMonth)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      prevKpi = (prevRow?.kpi_summary as Record<string, unknown> | null) ?? null;
    }

    const metricLines = SUMMARY_METRICS.map((m) => {
      const cur = pickKpiNumber(currentKpi, m.key);
      const prev = prevKpi ? pickKpiNumber(prevKpi, m.key) : null;
      return `- ${m.label}（${m.key}）: ${diffText(cur, prev)}`;
    }).join("\n");

    const prompt = `あなたはInstagram運用代行のアナリストです。以下の月次データをもとに、各指標ごとに「要因」（なぜその実績になったかの分析・1〜2文）と「次月対策」（来月の具体的な打ち手・1〜2文）を日本語で簡潔に作成してください。

# クライアント
会社名: ${clientData?.name ?? "（不明）"}
エリア: ${clientData?.area ?? "未設定"}
属性メモ: ${clientData?.auto_memo ?? "未設定"}

# 対象月
${yearMonth}（前月: ${prevMonth ?? "なし"}）

# 担当者メモ
${operatorMemo || "（特記事項なし）"}

# 指標データ（当月 / 前月 / 前月比）
${metricLines}

# 出力形式（厳守）
次のキーを持つ JSON オブジェクトのみを出力してください。各値は {"factor": "...", "next_action": "..."} の形。
キー: ${SUMMARY_METRIC_KEYS.join(", ")}
コードフェンス・前置き・後置きは一切付けないこと。前月データがない指標は要因に「前月比較不可」と明記してよい。`;

    const messages: GeminiMessage[] = [{ role: "user", parts: [{ text: prompt }] }];
    const geminiRes = await callGemini(messages, { stream: false });
    const text = await extractGeminiText(geminiRes);
    const parsed = parseJsonObject(text);

    if (!parsed) {
      return NextResponse.json(
        { error: "AI応答をJSONとして解釈できませんでした", raw: text },
        { status: 502 }
      );
    }

    const factors: Record<string, string> = {};
    const nextActions: Record<string, string> = {};
    for (const key of SUMMARY_METRIC_KEYS) {
      const entry = parsed[key];
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        if (typeof e.factor === "string") factors[key] = e.factor.trim();
        if (typeof e.next_action === "string") nextActions[key] = e.next_action.trim();
      }
    }

    return NextResponse.json({
      factors,
      next_actions: nextActions,
      prev_month: prevMonth,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "要因・次月対策の生成中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
