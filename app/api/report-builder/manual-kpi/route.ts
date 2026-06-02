import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { TREND_KPI_KEYS, type TrendKpiKey } from "@/lib/report/types";

// ==========================================
// Phase 4a: 過去月数値の手打ち入力 API
// 推移グラフに必要な数値（monthly_trends 相当）だけを
// knowledge_base.kpi_summary に保存する。
// - 既存月: kpi_summary に入力キーのみマージ更新（最新 created_at の行）
// - 新規月: report_text=null のレコードを INSERT（数値のみの月）
// ==========================================

const YEAR_MONTH_RE = /^\d{4}\/(0[1-9]|1[0-2])$/;

interface ManualEntry {
  year_month: string;
  values: Partial<Record<TrendKpiKey, number>>;
}

function parseEntries(raw: unknown): { entries: ManualEntry[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "entries は1件以上の配列で指定してください" };
  }
  const entries: ManualEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { error: "entries の要素が不正です" };
    }
    const { year_month, values } = item as Record<string, unknown>;
    if (typeof year_month !== "string" || !YEAR_MONTH_RE.test(year_month)) {
      return { error: `year_month は YYYY/MM 形式で指定してください（${String(year_month)}）` };
    }
    if (typeof values !== "object" || values === null) {
      return { error: `${year_month}: values が不正です` };
    }
    const cleaned: Partial<Record<TrendKpiKey, number>> = {};
    for (const key of TREND_KPI_KEYS) {
      const v = (values as Record<string, unknown>)[key];
      if (v === undefined || v === null || v === "") continue;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0) {
        return { error: `${year_month}: ${key} は0以上の数値で入力してください` };
      }
      cleaned[key] = n;
    }
    if (Object.keys(cleaned).length === 0) {
      return { error: `${year_month}: 入力された数値がありません` };
    }
    entries.push({ year_month, values: cleaned });
  }
  // 同一月の重複入力を検出
  const months = entries.map((e) => e.year_month);
  const dup = months.find((m, i) => months.indexOf(m) !== i);
  if (dup) {
    return { error: `同じ年月（${dup}）が複数行入力されています` };
  }
  return { entries };
}

async function fetchActiveFmtVersion(): Promise<number> {
  const { data } = await supabase
    .from("master_fmt")
    .select("version")
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.version === "number" ? data.version : 1;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const clientId = body.client_id;
    if (typeof clientId !== "string" || !clientId) {
      return NextResponse.json({ error: "client_id は必須です" }, { status: 400 });
    }

    const parsed = parseEntries(body.entries);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const fmtVersion = await fetchActiveFmtVersion();
    const results: Array<{ year_month: string; action: "updated" | "created" }> = [];

    for (const entry of parsed.entries) {
      // 既存レコード（重複月は最新 created_at を採用）
      const { data: existing, error: selectErr } = await supabase
        .from("knowledge_base")
        .select("id, kpi_summary")
        .eq("client_id", clientId)
        .eq("year_month", entry.year_month)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (selectErr) {
        return NextResponse.json(
          { error: `${entry.year_month}: 既存レコードの確認に失敗しました（${selectErr.message}）`, results },
          { status: 500 }
        );
      }

      if (existing) {
        const mergedKpi = {
          ...((existing.kpi_summary as Record<string, unknown> | null) ?? {}),
          ...entry.values,
        };
        const { error: updateErr } = await supabase
          .from("knowledge_base")
          .update({ kpi_summary: mergedKpi })
          .eq("id", existing.id);

        if (updateErr) {
          return NextResponse.json(
            { error: `${entry.year_month}: 更新に失敗しました（${updateErr.message}）`, results },
            { status: 500 }
          );
        }
        results.push({ year_month: entry.year_month, action: "updated" });
      } else {
        const { error: insertErr } = await supabase.from("knowledge_base").insert({
          client_id: clientId,
          year_month: entry.year_month,
          fmt_version: fmtVersion,
          kpi_summary: entry.values,
          top_posts: {},
          excel_parsed: {},
          report_text: null,
        });

        if (insertErr) {
          return NextResponse.json(
            { error: `${entry.year_month}: 登録に失敗しました（${insertErr.message}）`, results },
            { status: 500 }
          );
        }
        results.push({ year_month: entry.year_month, action: "created" });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "手打ち数値の保存中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
