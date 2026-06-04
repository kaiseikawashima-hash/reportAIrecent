// ==========================================
// Phase 4a2: knowledge_base への保存を全経路で統一する
// マージ upsert ヘルパー（client_id × year_month を一意キー扱い）
//
// 方針:
// - 渡されたフィールドだけを上書きし、渡されていないフィールドは既存値を保持する
//   - kpi_summary は「キー単位」でマージ（数値だけ渡しても考察・デモグラを壊さない）
//   - report_text / top_posts / excel_parsed は「非空のときだけ」上書き
// - 同一 client_id × year_month の重複レコードは最新 created_at を基準に1件へ収束させ、
//   残りは削除する（過去のノコス2026/03 のような重複INSERTを構造的に解消）
// - fmt_version は report_text を伴う保存（レポート登録）のときだけ更新し、
//   数値だけの保存（手打ち・一括）では既存値を保持する
// ==========================================

import { supabase } from "@/lib/supabase";

export interface KnowledgeUpsertInput {
  client_id: string;
  year_month: string; // "YYYY/MM"
  fmt_version: number;
  /** マージ対象（キー単位で上書き）。未指定キーは既存値を保持 */
  kpi_summary?: Record<string, unknown> | null;
  /** 非空のときだけ上書き */
  top_posts?: Record<string, unknown> | null;
  /** 非空のときだけ上書き */
  excel_parsed?: Record<string, unknown> | null;
  /** 非空文字列のときだけ上書き（数値だけの保存では undefined を渡す） */
  report_text?: string | null;
}

export interface KnowledgeUpsertResult {
  id: string;
  action: "updated" | "created";
  /** 収束のために削除した重複レコード数 */
  deleted_count: number;
}

const YEAR_MONTH_RE = /^\d{4}\/(0[1-9]|1[0-2])$/;

function isNonEmptyObject(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v as Record<string, unknown>).length > 0
  );
}

function hasReportText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * knowledge_base へマージ upsert する。
 * - 既存レコードあり: 最新行をベースにマージ更新し、重複行は削除
 * - 既存レコードなし: 新規 INSERT
 *
 * @throws Error クエリ失敗時（呼び出し側で 500 応答に変換すること）
 */
export async function upsertKnowledgeRow(
  input: KnowledgeUpsertInput
): Promise<KnowledgeUpsertResult> {
  const { client_id, year_month, fmt_version } = input;

  if (!client_id) throw new Error("client_id は必須です");
  if (!YEAR_MONTH_RE.test(year_month)) {
    throw new Error("year_month は YYYY/MM 形式で指定してください");
  }

  const { data: existingRows, error: selectErr } = await supabase
    .from("knowledge_base")
    .select("id, kpi_summary, top_posts, excel_parsed, report_text, fmt_version, created_at")
    .eq("client_id", client_id)
    .eq("year_month", year_month)
    .order("created_at", { ascending: false });

  if (selectErr) {
    throw new Error(`既存レコードの確認に失敗しました: ${selectErr.message}`);
  }

  const rows = existingRows ?? [];
  const base = rows[0] ?? null;
  const duplicates = rows.slice(1);

  // --- マージ計算（渡されたフィールドだけ上書き） ---
  const mergedKpi: Record<string, unknown> = {
    ...((base?.kpi_summary as Record<string, unknown> | null) ?? {}),
    ...((input.kpi_summary as Record<string, unknown> | null) ?? {}),
  };
  const mergedTopPosts = isNonEmptyObject(input.top_posts)
    ? input.top_posts
    : (base?.top_posts as Record<string, unknown> | null) ?? {};
  const mergedExcel = isNonEmptyObject(input.excel_parsed)
    ? input.excel_parsed
    : (base?.excel_parsed as Record<string, unknown> | null) ?? {};
  const incomingHasReport = hasReportText(input.report_text);
  const mergedReport = incomingHasReport
    ? (input.report_text as string)
    : base?.report_text ?? null;
  // レポート本文を伴う保存のときだけ fmt_version を更新（数値だけの保存は既存維持）
  const mergedFmtVersion = incomingHasReport
    ? fmt_version
    : typeof base?.fmt_version === "number"
    ? base.fmt_version
    : fmt_version;

  if (base) {
    let deleted_count = 0;
    if (duplicates.length > 0) {
      const { error: delErr } = await supabase
        .from("knowledge_base")
        .delete()
        .in(
          "id",
          duplicates.map((r) => r.id)
        );
      if (delErr) {
        throw new Error(`重複レコードの削除に失敗しました: ${delErr.message}`);
      }
      deleted_count = duplicates.length;
    }

    const { data, error: updErr } = await supabase
      .from("knowledge_base")
      .update({
        fmt_version: mergedFmtVersion,
        kpi_summary: mergedKpi,
        top_posts: mergedTopPosts,
        excel_parsed: mergedExcel,
        report_text: mergedReport,
      })
      .eq("id", base.id)
      .select("id")
      .single();

    if (updErr) throw new Error(updErr.message);
    return { id: data.id as string, action: "updated", deleted_count };
  }

  const { data, error: insErr } = await supabase
    .from("knowledge_base")
    .insert({
      client_id,
      year_month,
      fmt_version: mergedFmtVersion,
      kpi_summary: mergedKpi,
      top_posts: mergedTopPosts,
      excel_parsed: mergedExcel,
      report_text: mergedReport,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(insErr.message);
  return { id: data.id as string, action: "created", deleted_count: 0 };
}
