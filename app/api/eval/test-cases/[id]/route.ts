import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const SCREENSHOT_BUCKET = "eval-screenshots";

// ==========================================
// GET: 単一テストケース
// ==========================================

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("eval_test_cases")
    .select("*, client:clients(id, name)")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "テストケースが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// ==========================================
// PUT: 編集
// ==========================================
// 編集可能: name, operator_memo, reference_*, notes, is_active, screenshots
// 不変: input_excel_data, input_diff_context, client_id, target_month

const EDITABLE_FIELDS = [
  "name",
  "input_operator_memo",
  "reference_report_text",
  "reference_summary",
  "reference_follower",
  "reference_reach",
  "reference_account",
  "reference_author",
  "notes",
  "is_active",
] as const;

type EditableField = typeof EDITABLE_FIELDS[number];

function sanitizeFilename(name: string): string {
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

function extractStoragePath(publicUrl: string): string | null {
  // https://<host>/storage/v1/object/public/eval-screenshots/<path>
  const marker = `/storage/v1/object/public/${SCREENSHOT_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return publicUrl.slice(idx + marker.length);
}

async function deleteFromStorage(urls: string[]): Promise<void> {
  const paths = urls
    .map(extractStoragePath)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(SCREENSHOT_BUCKET).remove(paths);
  if (error) {
    // 削除失敗は致命的ではないが、ログとして残す
    console.error("Storage削除に失敗", error.message);
  }
}

async function handleJsonUpdate(
  request: NextRequest,
  id: string
): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;

  const updates: Partial<Record<EditableField, unknown>> = {};

  for (const key of EDITABLE_FIELDS) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  // フロント側の互換: operator_memo を input_operator_memo にマップ
  if ("operator_memo" in body && updates.input_operator_memo === undefined) {
    updates.input_operator_memo = body.operator_memo;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新するフィールドがありません" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("eval_test_cases")
    .update(updates)
    .eq("id", id)
    .select("*, client:clients(id, name)")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "テストケースが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

async function handleFormDataUpdate(
  request: NextRequest,
  id: string
): Promise<NextResponse> {
  const form = await request.formData();

  // 既存レコードを取得（既存 input_screenshots の差分を計算するため）
  const { data: current, error: fetchError } = await supabase
    .from("eval_test_cases")
    .select("input_screenshots")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "テストケースが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const currentUrls: string[] = Array.isArray(current?.input_screenshots)
    ? (current.input_screenshots as string[])
    : [];

  // existing_screenshots: 残す既存URLの配列（JSON文字列）
  let existingUrls: string[] = currentUrls;
  const existingRaw = form.get("existing_screenshots");
  if (typeof existingRaw === "string") {
    try {
      const parsed = JSON.parse(existingRaw);
      if (
        Array.isArray(parsed) &&
        parsed.every((v): v is string => typeof v === "string")
      ) {
        existingUrls = parsed;
      } else {
        return NextResponse.json(
          { error: "existing_screenshots は文字列配列のJSONで指定してください" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "existing_screenshots のJSONが不正です" },
        { status: 400 }
      );
    }
  }

  // 削除対象 = 現在のURL のうち existing に含まれないもの
  const toDelete = currentUrls.filter((u) => !existingUrls.includes(u));

  // new_screenshots: 新規追加 File[]
  const newFiles = form
    .getAll("new_screenshots")
    .filter((v): v is File => v instanceof File && v.size > 0);
  for (const f of newFiles) {
    if (!f.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "new_screenshots には画像ファイルのみアップロードできます" },
        { status: 400 }
      );
    }
  }

  // テキスト系フィールドの更新
  const updates: Partial<Record<EditableField, unknown>> = {};
  for (const key of EDITABLE_FIELDS) {
    if (form.has(key)) {
      const v = form.get(key);
      if (typeof v === "string") {
        if (key === "is_active") {
          updates[key] = v === "true";
        } else {
          updates[key] = v === "" ? null : v;
        }
      }
    }
  }
  if (form.has("operator_memo") && updates.input_operator_memo === undefined) {
    const v = form.get("operator_memo");
    if (typeof v === "string") {
      updates.input_operator_memo = v === "" ? null : v;
    }
  }

  // 新規アップロード
  let uploadedUrls: string[] = [];
  try {
    uploadedUrls = await Promise.all(
      newFiles.map((f) => uploadScreenshot(f, id))
    );
  } catch (uploadErr) {
    const message =
      uploadErr instanceof Error ? uploadErr.message : "画像アップロード中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const finalUrls = [...existingUrls, ...uploadedUrls];

  const updatePayload = { ...updates, input_screenshots: finalUrls };

  const { data, error } = await supabase
    .from("eval_test_cases")
    .update(updatePayload)
    .eq("id", id)
    .select("*, client:clients(id, name)")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "テストケースが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // DB 更新成功後にStorageから削除（失敗しても致命的ではない）
  if (toDelete.length > 0) {
    await deleteFromStorage(toDelete);
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await handleFormDataUpdate(request, id);
    }

    return await handleJsonUpdate(request, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新中にエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ==========================================
// DELETE: ソフトデリート
// ==========================================

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("eval_test_cases")
    .update({ is_active: false })
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "テストケースが見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
