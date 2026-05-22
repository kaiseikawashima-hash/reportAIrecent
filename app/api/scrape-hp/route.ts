import { NextRequest, NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";
import type { GeminiMessage } from "@/lib/gemini";

interface ScrapeRequest {
  name?: string;
  area?: string;
  hp_url?: string;
  operator_memo?: string;
}

const HP_FETCH_TIMEOUT_MS = 15000;
const MAX_HP_TEXT_LENGTH = 12000;

async function fetchHpText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HP_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SnsReportBot/1.0; +https://example.com/bot)",
      },
    });

    if (!res.ok) {
      throw new Error(`HP取得失敗: HTTP ${res.status}`);
    }

    const html = await res.text();
    return stripHtml(html).slice(0, MAX_HP_TEXT_LENGTH);
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrompt(input: {
  name: string;
  area: string;
  operatorMemo: string;
  hpText: string;
}): string {
  return [
    "あなたはInstagram運用代行のリサーチ担当です。",
    "以下の情報からクライアントの「特徴メモ（auto_memo）」を1〜2文でまとめてください。",
    "",
    "【出力フォーマット（厳守）】",
    "「{会社の強み・特徴}。{エリア}エリアの{ターゲット層}向け。{担当者メモから読み取れる運用上の特徴}」",
    "",
    "【ルール】",
    "・出力は完成した文章のみ。前置き・補足・改行は不要",
    "・最大200字程度",
    "・HP情報がない場合は会社名・エリア・担当者メモから推測してよい",
    "",
    `■ 会社名: ${input.name || "(未設定)"}`,
    `■ エリア: ${input.area || "(未設定)"}`,
    `■ 担当者メモ: ${input.operatorMemo || "(なし)"}`,
    "",
    "■ HPテキスト（抜粋）:",
    input.hpText || "(取得できず)",
  ].join("\n");
}

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
  return parts
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeRequest = await request.json();
    const name = (body.name ?? "").trim();
    const area = (body.area ?? "").trim();
    const hpUrl = (body.hp_url ?? "").trim();
    const operatorMemo = (body.operator_memo ?? "").trim();

    if (!name && !hpUrl && !operatorMemo) {
      return NextResponse.json(
        { error: "会社名・HP URL・担当者メモのいずれかは必須です" },
        { status: 400 }
      );
    }

    let hpText = "";
    let hpError: string | null = null;
    if (hpUrl) {
      try {
        hpText = await fetchHpText(hpUrl);
      } catch (error) {
        hpError = error instanceof Error ? error.message : "HP取得に失敗しました";
      }
    }

    const prompt = buildPrompt({ name, area, operatorMemo, hpText });
    const messages: GeminiMessage[] = [{ role: "user", parts: [{ text: prompt }] }];

    const response = await callGemini(messages, { stream: false });
    const autoMemo = await extractGeminiText(response);

    return NextResponse.json({
      auto_memo: autoMemo,
      hp_fetched: !!hpText,
      hp_error: hpError,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "属性自動生成中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
