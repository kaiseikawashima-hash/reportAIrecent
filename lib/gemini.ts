const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export async function callGemini(
  messages: GeminiMessage[],
  options?: { stream?: boolean }
): Promise<Response> {
  const endpoint = options?.stream ? "streamGenerateContent" : "generateContent";
  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:${endpoint}?key=${GEMINI_API_KEY}${options?.stream ? "&alt=sse" : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: messages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  return response;
}
