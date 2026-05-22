import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { ExcelParseResult, DiffCalcResult } from "@/lib/types";

const SCREENSHOT_BUCKET = "eval-screenshots";

function sanitizeFilename(name: string): string {
  // Storage キーで安全な文字だけにする
  const base = name.replace(/[^A-Za-z0-9._-]/g, "_");
  return base.length > 0 ? base : "file";
}

async function uploadScreenshot(file: File, testCaseId: string): Promise<string> {
  const safeName = sanitizeFilename(file.name);
  const path = `${testCaseId}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`画像アップロードに失敗しました: ${uploadError.message}`);
  }
  const { data: pub } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

// ==========================================
// GET: テストケース一覧
// ==========================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const targetMonth = searchParams.get("target_month");
  const isActiveParam = searchParams.get("is_active");

  // デフォルトは is_active = true。"all" 指定時はフィルタしない
  let isActiveFilter: boolean | null = true;
  if (isActiveParam === "false") isActiveFilter = false;
  else if (isActiveParam === "all") isActiveFilter = null;

  let query = supabase
    .from("eval_test_cases")
    .select("*, client:clients(id, name)")
    .order("created_at", { ascending: false });

  if (isActiveFilter !== null) query = query.eq("is_active", isActiveFilter);
  if (clientId) query = query.eq("client_id", clientId);
  if (targetMonth) query = query.eq("target_month", targetMonth);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ==========================================
// POST: テストケース新規作成
// ==========================================

interface CreatePayload {
  name: string;
  client_id: string;
  target_month: string;
  excel_data: ExcelParseResult;
  diff_context: DiffCalcResult;
  operator_memo: string | null;
  reference_report_text: string | null;
  reference_summary: string | null;
  reference_follower: string | null;
  reference_reach: string | null;
  reference_account: string | null;
  reference_author: string | null;
  notes: string | null;
}

function getString(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function getRequiredString(form: FormData, key: string): string {
  const v = getString(form, key);
  if (!v) throw new Error(`${key} は必須です`);
  return v;
}

function isYearMonth(v: string): boolean {
  return /^\d{4}\/(0[1-9]|1[0-2])$/.test(v);
}

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

async function calcDiffInternal(excel: ExcelParseResult, request: NextRequest): Promise<DiffCalcResult> {
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

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const name = getRequiredString(form, "name");
    const clientId = getRequiredString(form, "client_id");
    const targetMonth = getRequiredString(form, "target_month");

    if (!isYearMonth(targetMonth)) {
      return NextResponse.json(
        { error: "対象月は YYYY/MM 形式で入力してください" },
        { status: 400 }
      );
    }

    const excelFile = form.get("excel_file");
    if (!(excelFile instanceof File)) {
      return NextResponse.json({ error: "Excelファイルが必要です" }, { status: 400 });
    }

    const screenshotEntries = form
      .getAll("screenshots")
      .filter((v): v is File => v instanceof File && v.size > 0);
    for (const f of screenshotEntries) {
      if (!f.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "screenshots には画像ファイルのみアップロードできます" },
          { status: 400 }
        );
      }
    }

    // 既存 /api/parse-excel と /api/calc-diff を内部呼び出し
    const excelData = await parseExcelInternal(excelFile, request);
    const diffContext = await calcDiffInternal(excelData, request);

    const payload: CreatePayload = {
      name,
      client_id: clientId,
      target_month: targetMonth,
      excel_data: excelData,
      diff_context: diffContext,
      operator_memo: getString(form, "operator_memo"),
      reference_report_text: getString(form, "reference_report_text"),
      reference_summary: getString(form, "reference_summary"),
      reference_follower: getString(form, "reference_follower"),
      reference_reach: getString(form, "reference_reach"),
      reference_account: getString(form, "reference_account"),
      reference_author: getString(form, "reference_author"),
      notes: getString(form, "notes"),
    };

    // まず DB に挿入して id を取得
    const { data, error } = await supabase
      .from("eval_test_cases")
      .insert({
        name: payload.name,
        client_id: payload.client_id,
        target_month: payload.target_month,
        input_excel_data: payload.excel_data,
        input_diff_context: payload.diff_context,
        input_screenshots: [],
        input_operator_memo: payload.operator_memo,
        reference_report_text: payload.reference_report_text,
        reference_summary: payload.reference_summary,
        reference_follower: payload.reference_follower,
        reference_reach: payload.reference_reach,
        reference_account: payload.reference_account,
        reference_author: payload.reference_author,
        notes: payload.notes,
      })
      .select("*, client:clients(id, name)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (screenshotEntries.length > 0) {
      try {
        const urls = await Promise.all(
          screenshotEntries.map((f) => uploadScreenshot(f, data.id))
        );
        const { data: updated, error: updateError } = await supabase
          .from("eval_test_cases")
          .update({ input_screenshots: urls })
          .eq("id", data.id)
          .select("*, client:clients(id, name)")
          .single();
        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
        return NextResponse.json(updated, { status: 201 });
      } catch (uploadErr) {
        const message =
          uploadErr instanceof Error ? uploadErr.message : "画像アップロード中にエラーが発生しました";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "テストケース作成中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
