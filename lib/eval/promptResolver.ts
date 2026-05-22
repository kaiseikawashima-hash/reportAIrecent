import type {
  ClientPlan,
  DiffCalcResult,
  ExcelParseResult,
} from "@/lib/types";
import type { EvalSection } from "@/lib/eval/types";

// ==========================================
// プレースホルダ
// ==========================================

export interface PromptPlaceholders {
  master_fmt: string;
  client_name: string;
  client_area: string;
  client_auto_memo: string;
  diff_text: string;
  detail_text: string;
  knowledge_text: string;
  operator_memo: string;
  previous_sections: string;
}

export function fillPrompt(
  template: string,
  placeholders: PromptPlaceholders
): string {
  let out = template;
  for (const [key, value] of Object.entries(placeholders)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

// ==========================================
// 差分テキスト（Layer 3）
// ==========================================

export function buildDiffContextText(diff: DiffCalcResult): string {
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

// ==========================================
// 詳細テキスト（Layer 3-b）
// ==========================================

function pickTopAndWorst<T>(items: T[], count: number): { top: T[]; worst: T[] } {
  if (items.length === 0) return { top: [], worst: [] };
  const top = items.slice(0, count);
  const worst = items.slice(-count).reverse();
  return { top, worst };
}

export function buildExcelDetailText(
  excel: ExcelParseResult,
  section: EvalSection,
  plan: ClientPlan
): string {
  const lines: string[] = [];

  if (section === "summary") {
    lines.push("【数値サマリー】");
    lines.push(`フォロワー: ${excel.summary.follower.toLocaleString()}`);
    lines.push(`表示回数: ${excel.summary.view.toLocaleString()}`);
    lines.push(`リーチ: ${excel.summary.reach.toLocaleString()}`);
    lines.push(`エンゲージメント: ${excel.summary.engagement.toLocaleString()}`);
    lines.push(`投稿数: ${excel.summary.post_count}`);
  }

  if (section === "follower") {
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

  if (section === "reach") {
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

  if (section === "account") {
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

// ==========================================
// 年月フォーマット変換
// ==========================================

/**
 * "2026-03" → "2026/03"
 * "2026/03" はそのまま通す
 */
export function toSlashYearMonth(input: string): string {
  return input.replace(/-/g, "/");
}

/**
 * "2026-03" or "2026/03" の直前月を "2026/02" 形式で返す
 */
export function prevYearMonth(yearMonth: string): string {
  const normalized = toSlashYearMonth(yearMonth);
  const match = normalized.match(/^(\d{4})\/(0[1-9]|1[0-2])$/);
  if (!match) {
    throw new Error(`年月の形式が不正です: ${yearMonth}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month === 1) {
    return `${year - 1}/12`;
  }
  return `${year}/${String(month - 1).padStart(2, "0")}`;
}
