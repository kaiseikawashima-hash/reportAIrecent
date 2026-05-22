import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { callGemini } from "@/lib/gemini";
import type { GeminiMessage, GeminiPart } from "@/lib/gemini";
import type { ClientPlan, DiffCalcResult, ExcelParseResult, KnowledgeBase, MasterFmt } from "@/lib/types";

// ==========================================
// 型定義
// ==========================================

interface GenerateRequest {
  client_id: string;
  diff_context: DiffCalcResult;
  knowledge_refs: {
    same_client: KnowledgeBase[];
    random_others: KnowledgeBase[];
  };
  operator_memo?: string;
  excel_raw: ExcelParseResult;
  screenshot_images?: string[]; // base64エンコード画像
}

interface ClientInfo {
  name: string;
  area: string | null;
  auto_memo: string | null;
  plan: ClientPlan;
}

const SECTIONS = [
  { key: "summary", label: "サマリー" },
  { key: "follower", label: "フォロワー分析" },
  { key: "reach", label: "リーチ分析" },
  { key: "account", label: "アカウント分析" },
] as const;

// ==========================================
// プロンプト構築
// ==========================================

function buildDiffContextText(diff: DiffCalcResult): string {
  const lines: string[] = [
    `対象月: ${diff.current_month}（前月: ${diff.prev_month}）`,
    "",
    "【KPI前月比】",
  ];

  const kpiLabels: Record<string, string> = {
    view: "表示回数",
    reach: "リーチ",
    follower: "フォロワー",
    engagement: "エンゲージメント",
  };

  for (const [key, label] of Object.entries(kpiLabels)) {
    const item = diff.kpi_diff[key as keyof typeof diff.kpi_diff];
    lines.push(
      `・${label}: ${item.current.toLocaleString()} (前月${item.prev.toLocaleString()}, ${item.diff_rate}) [${item.trend}]`
    );
  }

  lines.push(
    "",
    "【注目投稿】",
    `・フィードTOP: 『${diff.top_feed.title}』 ENG率${diff.top_feed.eng_rate}`,
    `・リールTOP: 『${diff.top_reel.title}』 ENG率${diff.top_reel.eng_rate}`,
    `・フィードワースト: 『${diff.worst_feed.title}』 ENG率${diff.worst_feed.eng_rate}`,
    "",
    "【フォロワー属性】",
    diff.demographics_summary
  );

  return lines.join("\n");
}

function pickTopAndWorst<T>(items: T[], count: number): { top: T[]; worst: T[] } {
  if (items.length === 0) return { top: [], worst: [] };
  const top = items.slice(0, count);
  const worst = items.slice(-count).reverse();
  return { top, worst };
}

function buildExcelDetailText(
  excel: ExcelParseResult,
  sectionKey: string,
  plan: ClientPlan
): string {
  const lines: string[] = [];

  if (sectionKey === "summary") {
    lines.push("【数値サマリー】");
    lines.push(`フォロワー: ${excel.summary.follower.toLocaleString()}`);
    lines.push(`表示回数: ${excel.summary.view.toLocaleString()}`);
    lines.push(`リーチ: ${excel.summary.reach.toLocaleString()}`);
    lines.push(`エンゲージメント: ${excel.summary.engagement.toLocaleString()}`);
    lines.push(`投稿数: ${excel.summary.post_count}`);
  }

  if (sectionKey === "follower") {
    lines.push("【月次推移データ】");
    for (const t of excel.monthly_trends) {
      lines.push(
        `${t.year_month}: フォロワー${t.follower.toLocaleString()} / 表示${t.view_total.toLocaleString()} / リーチ${t.reach_total.toLocaleString()} / ENG${t.engagement_total.toLocaleString()}`
      );
    }
    lines.push("");
    lines.push("【デモグラフィクス - 年齢性別】");
    for (const ag of excel.demographics.age_gender) {
      lines.push(`${ag.age}: 男性${ag.male} / 女性${ag.female} / 合計${ag.total}`);
    }
    lines.push("");
    lines.push("【デモグラフィクス - 地域】");
    for (const p of excel.demographics.prefectures) {
      lines.push(`${p.name}: ${p.value.toLocaleString()} (${p.ratio})`);
    }
  }

  if (sectionKey === "reach") {
    const count = plan === "advance" ? 3 : 1;
    lines.push(`【プラン: ${plan === "advance" ? "アドバンス" : "スタンダード"}】`);
    lines.push(
      `※ フィード・リールそれぞれTOP${count}とワースト${count}を考察対象とすること`
    );
    lines.push("");

    const feedSorted = [...excel.feed_ranking].sort((a, b) => a.rank - b.rank);
    const feedPosts = [...excel.feed_posts].sort((a, b) => b.eng_rate - a.eng_rate);
    const reelSorted = [...excel.reel_ranking].sort((a, b) => a.rank - b.rank);
    const reelPosts = [...excel.reel_posts].sort((a, b) => b.eng_rate - a.eng_rate);

    const feedRanking = pickTopAndWorst(feedSorted, count);
    const reelRanking = pickTopAndWorst(reelSorted, count);
    const feedPostPick = pickTopAndWorst(feedPosts, count);
    const reelPostPick = pickTopAndWorst(reelPosts, count);

    lines.push(`【フィードTOP${count}（ランキング）】`);
    for (const f of feedRanking.top) {
      lines.push(
        `${f.rank}位: 『${f.title}』 リーチ${f.reach.toLocaleString()} ENG${f.engagement.toLocaleString()} ENG率${f.eng_rate}`
      );
    }
    lines.push("");
    lines.push(`【フィードワースト${count}（ランキング）】`);
    for (const f of feedRanking.worst) {
      lines.push(
        `${f.rank}位: 『${f.title}』 リーチ${f.reach.toLocaleString()} ENG${f.engagement.toLocaleString()} ENG率${f.eng_rate}`
      );
    }
    lines.push("");
    lines.push(`【リールTOP${count}（ランキング）】`);
    for (const r of reelRanking.top) {
      lines.push(
        `${r.rank}位: 『${r.title}』 リーチ${r.reach.toLocaleString()} ENG${r.engagement.toLocaleString()} ENG率${r.eng_rate}`
      );
    }
    lines.push("");
    lines.push(`【リールワースト${count}（ランキング）】`);
    for (const r of reelRanking.worst) {
      lines.push(
        `${r.rank}位: 『${r.title}』 リーチ${r.reach.toLocaleString()} ENG${r.engagement.toLocaleString()} ENG率${r.eng_rate}`
      );
    }
    lines.push("");
    lines.push(`【フィード投稿詳細 TOP${count}】`);
    for (const p of feedPostPick.top) {
      lines.push(
        `『${p.title}』 ${p.post_date} / 表示${p.view.toLocaleString()} / リーチ${p.reach.toLocaleString()} / ENG${p.engagement.toLocaleString()} / ENG率${p.eng_rate}% / いいね${p.likes} / 保存${p.saves}`
      );
    }
    lines.push("");
    lines.push(`【フィード投稿詳細 ワースト${count}】`);
    for (const p of feedPostPick.worst) {
      lines.push(
        `『${p.title}』 ${p.post_date} / 表示${p.view.toLocaleString()} / リーチ${p.reach.toLocaleString()} / ENG${p.engagement.toLocaleString()} / ENG率${p.eng_rate}% / いいね${p.likes} / 保存${p.saves}`
      );
    }
    lines.push("");
    lines.push(`【リール投稿詳細 TOP${count}】`);
    for (const p of reelPostPick.top) {
      lines.push(
        `『${p.title}』 ${p.post_date} / 表示${p.view.toLocaleString()} / リーチ${p.reach.toLocaleString()} / ENG${p.engagement.toLocaleString()} / ENG率${p.eng_rate}% / いいね${p.likes} / 保存${p.saves}`
      );
    }
    lines.push("");
    lines.push(`【リール投稿詳細 ワースト${count}】`);
    for (const p of reelPostPick.worst) {
      lines.push(
        `『${p.title}』 ${p.post_date} / 表示${p.view.toLocaleString()} / リーチ${p.reach.toLocaleString()} / ENG${p.engagement.toLocaleString()} / ENG率${p.eng_rate}% / いいね${p.likes} / 保存${p.saves}`
      );
    }
  }

  if (sectionKey === "account") {
    lines.push("【アカウント全体データ】");
    lines.push(`フォロワー: ${excel.summary.follower.toLocaleString()}`);
    lines.push(`総表示: ${excel.summary.view.toLocaleString()}`);
    lines.push(`総リーチ: ${excel.summary.reach.toLocaleString()}`);
    lines.push(`総エンゲージメント: ${excel.summary.engagement.toLocaleString()}`);
    lines.push("");
    lines.push("【都道府県TOP】");
    for (const p of excel.demographics.prefectures.slice(0, 5)) {
      lines.push(`${p.name}: ${p.value.toLocaleString()} (${p.ratio})`);
    }
    lines.push("");
    lines.push("【市区町村TOP】");
    for (const c of excel.demographics.cities.slice(0, 5)) {
      lines.push(`${c.name}: ${c.value.toLocaleString()} (${c.ratio})`);
    }
  }

  return lines.join("\n");
}

function buildKnowledgeText(refs: GenerateRequest["knowledge_refs"]): string {
  const lines: string[] = [];

  if (refs.same_client.length > 0) {
    lines.push("【同クライアント過去レポート】");
    for (const k of refs.same_client) {
      lines.push(`--- ${k.year_month} ---`);
      lines.push(k.report_text ?? "(テキストなし)");
      lines.push("");
    }
  }

  if (refs.random_others.length > 0) {
    lines.push("【他社レポート参考】");
    for (const k of refs.random_others) {
      lines.push(`--- ${k.year_month} ---`);
      lines.push(k.report_text ?? "(テキストなし)");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildPrompt(
  masterFmt: string,
  client: ClientInfo,
  diffText: string,
  detailText: string,
  knowledgeText: string,
  operatorMemo: string | undefined,
  sectionLabel: string,
  previousSections: string,
  includeImages: boolean
): string {
  const parts: string[] = [
    `[Layer 1] マスターFMT`,
    masterFmt,
    "",
    `[Layer 2] クライアント属性`,
    `会社名: ${client.name}`,
    `エリア: ${client.area ?? "未設定"}`,
    `特徴メモ: ${client.auto_memo ?? "未設定"}`,
    "",
    `[Layer 3] 今月の構造化数値`,
    diffText,
    "",
    `[Layer 3-b] 詳細データ`,
    detailText,
    "",
    `[Layer 4] 過去レポート参照（文体・施策の参考）`,
    `※ マスターFMTと矛盾する場合はマスターFMTを優先すること`,
    knowledgeText || "(過去レポートなし)",
    "",
  ];

  if (operatorMemo) {
    parts.push(`[Layer 5] 担当者メモ`, operatorMemo, "");
  }

  if (includeImages) {
    parts.push(
      `[Layer 6] 投稿サムネイル画像`,
      `※ 添付画像はフィードTOP3・ワースト3のサムネイル`,
      `※ テーマ・デザイン傾向を考察に活かすこと`,
      ""
    );
  }

  if (previousSections) {
    parts.push(
      `[既に生成済みのセクション（文脈として参照）]`,
      previousSections,
      ""
    );
  }

  parts.push(
    `---`,
    `上記をもとに「${sectionLabel}」セクションのみを生成してください`,
    `Markdown形式で出力すること`
  );

  return parts.join("\n");
}

// ==========================================
// Geminiレスポンスからテキストを抽出
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
// メインハンドラ
// ==========================================

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { client_id, diff_context, knowledge_refs, operator_memo, excel_raw, screenshot_images } = body;

    // クライアント情報取得
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("name, area, auto_memo, plan")
      .eq("id", client_id)
      .single();

    if (clientError || !clientData) {
      return new Response(JSON.stringify({ error: "クライアントが見つかりません" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // アクティブなマスターFMT取得
    const { data: fmtData, error: fmtError } = await supabase
      .from("master_fmt")
      .select("content, version")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (fmtError || !fmtData) {
      return new Response(JSON.stringify({ error: "マスターFMTが見つかりません" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const client: ClientInfo = {
      name: clientData.name,
      area: clientData.area ?? null,
      auto_memo: clientData.auto_memo ?? null,
      plan: clientData.plan === "standard" ? "standard" : "advance",
    };
    const diffText = buildDiffContextText(diff_context);
    const knowledgeText = buildKnowledgeText(knowledge_refs);

    // ストリーミングレスポンス
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const generatedSections: string[] = [];

        for (const section of SECTIONS) {
          // セクション開始シグナル
          controller.enqueue(
            encoder.encode(`\n--- ${section.label} 生成中 ---\n\n`)
          );

          try {
            const detailText = buildExcelDetailText(excel_raw, section.key, client.plan);
            const previousSections = generatedSections.join("\n\n");
            const includeImages = section.key === "reach" && !!screenshot_images?.length;

            const prompt = buildPrompt(
              fmtData.content,
              client,
              diffText,
              detailText,
              knowledgeText,
              operator_memo,
              section.label,
              previousSections,
              includeImages
            );

            // メッセージ構築
            const parts: GeminiPart[] = [{ text: prompt }];

            // リーチ分析のみ画像を添付
            if (includeImages && screenshot_images) {
              for (const img of screenshot_images) {
                parts.push({
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: img,
                  },
                });
              }
            }

            const messages: GeminiMessage[] = [{ role: "user", parts }];

            const response = await callGemini(messages, { stream: false });
            const text = await extractGeminiText(response);

            controller.enqueue(encoder.encode(text));
            generatedSections.push(`## ${section.label}\n${text}`);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "生成エラー";
            const fallback = `\n> ⚠ ${section.label}の生成中にエラーが発生しました: ${errMsg}\n`;
            controller.enqueue(encoder.encode(fallback));
            generatedSections.push(`## ${section.label}\n${fallback}`);
          }
        }

        // 完了シグナル
        controller.enqueue(encoder.encode("\n--- 生成完了 ---\n"));

        // メタデータ（フロント側でDB保存に使用）
        const meta = JSON.stringify({
          __meta: true,
          fmt_version: fmtData.version,
          full_text: generatedSections.join("\n\n"),
        });
        controller.enqueue(encoder.encode(`\n<!--META:${meta}:META-->\n`));

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "レポート生成中にエラーが発生しました";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
