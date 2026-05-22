"use client";

import { useRef, useState } from "react";
import type { Client } from "@/lib/types";
import type { EvalTestCase } from "@/lib/eval/types";

export type TestCaseFormMode =
  | { kind: "create" }
  | { kind: "edit"; testCase: EvalTestCase };

interface Props {
  mode: TestCaseFormMode;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  client_id: string;
  target_month: string;
  excelFile: File | null;
  newScreenshots: File[];
  existingScreenshots: string[];
  operator_memo: string;
  reference_author: string;
  reference_report_text: string;
  reference_summary: string;
  reference_follower: string;
  reference_reach: string;
  reference_account: string;
  notes: string;
}

const EMPTY: FormState = {
  name: "",
  client_id: "",
  target_month: "",
  excelFile: null,
  newScreenshots: [],
  existingScreenshots: [],
  operator_memo: "",
  reference_author: "",
  reference_report_text: "",
  reference_summary: "",
  reference_follower: "",
  reference_reach: "",
  reference_account: "",
  notes: "",
};

const YEAR_MONTH_REGEX = /^\d{4}\/(0[1-9]|1[0-2])$/;

function fromTestCase(tc: EvalTestCase): FormState {
  return {
    name: tc.name,
    client_id: tc.client_id,
    target_month: tc.target_month,
    excelFile: null,
    newScreenshots: [],
    existingScreenshots: Array.isArray(tc.input_screenshots) ? [...tc.input_screenshots] : [],
    operator_memo: tc.input_operator_memo ?? "",
    reference_author: tc.reference_author ?? "",
    reference_report_text: tc.reference_report_text ?? "",
    reference_summary: tc.reference_summary ?? "",
    reference_follower: tc.reference_follower ?? "",
    reference_reach: tc.reference_reach ?? "",
    reference_account: tc.reference_account ?? "",
    notes: tc.notes ?? "",
  };
}

export function TestCaseForm({ mode, clients, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(
    mode.kind === "edit" ? fromTestCase(mode.testCase) : EMPTY
  );
  const [stage, setStage] = useState<"idle" | "parsing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const isEdit = mode.kind === "edit";
  const busy = stage !== "idle";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter((f) => f.type.startsWith("image/"));
    if (valid.length !== files.length) {
      setError("画像ファイルのみアップロードできます");
    }
    setForm((f) => ({ ...f, newScreenshots: [...f.newScreenshots, ...valid] }));
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = "";
    }
  }

  function removeNewScreenshot(index: number) {
    setForm((f) => ({
      ...f,
      newScreenshots: f.newScreenshots.filter((_, i) => i !== index),
    }));
  }

  function removeExistingScreenshot(url: string) {
    setForm((f) => ({
      ...f,
      existingScreenshots: f.existingScreenshots.filter((u) => u !== url),
    }));
  }

  // 名前の自動生成（新規時のみ、ユーザーが触っていなければ）
  function autofillName(nextClientId: string, nextMonth: string) {
    if (isEdit) return;
    if (form.name.trim() !== "") return;
    if (!nextClientId || !nextMonth) return;
    const client = clients.find((c) => c.id === nextClientId);
    if (!client) return;
    setForm((f) => ({ ...f, name: `${client.name}_${nextMonth}` }));
  }

  async function handleSave() {
    setError(null);

    if (!form.name.trim()) {
      setError("名前は必須です");
      return;
    }
    if (!form.client_id) {
      setError("クライアントは必須です");
      return;
    }
    if (!YEAR_MONTH_REGEX.test(form.target_month)) {
      setError("対象月は YYYY/MM 形式で入力してください");
      return;
    }

    if (!isEdit) {
      if (!form.excelFile) {
        setError("Excelファイルをアップロードしてください");
        return;
      }
      setStage("parsing");
      try {
        const fd = new FormData();
        fd.append("name", form.name.trim());
        fd.append("client_id", form.client_id);
        fd.append("target_month", form.target_month);
        fd.append("excel_file", form.excelFile);
        for (const file of form.newScreenshots) {
          fd.append("screenshots", file);
        }
        if (form.operator_memo) fd.append("operator_memo", form.operator_memo);
        if (form.reference_author) fd.append("reference_author", form.reference_author);
        if (form.reference_report_text) fd.append("reference_report_text", form.reference_report_text);
        if (form.reference_summary) fd.append("reference_summary", form.reference_summary);
        if (form.reference_follower) fd.append("reference_follower", form.reference_follower);
        if (form.reference_reach) fd.append("reference_reach", form.reference_reach);
        if (form.reference_account) fd.append("reference_account", form.reference_account);
        if (form.notes) fd.append("notes", form.notes);

        setStage("saving");
        const res = await fetch("/api/eval/test-cases", { method: "POST", body: fd });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "保存に失敗しました" }));
          setError(body.error ?? "保存に失敗しました");
          setStage("idle");
          return;
        }
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存中にエラーが発生しました");
        setStage("idle");
      }
      return;
    }

    // 編集（FormDataで送信して画像の追加/削除に対応）
    setStage("saving");
    try {
      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("input_operator_memo", form.operator_memo);
      fd.append("reference_author", form.reference_author);
      fd.append("reference_report_text", form.reference_report_text);
      fd.append("reference_summary", form.reference_summary);
      fd.append("reference_follower", form.reference_follower);
      fd.append("reference_reach", form.reference_reach);
      fd.append("reference_account", form.reference_account);
      fd.append("notes", form.notes);
      fd.append("existing_screenshots", JSON.stringify(form.existingScreenshots));
      for (const file of form.newScreenshots) {
        fd.append("new_screenshots", file);
      }

      const res = await fetch(`/api/eval/test-cases/${mode.testCase.id}`, {
        method: "PUT",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "保存に失敗しました" }));
        setError(body.error ?? "保存に失敗しました");
        setStage("idle");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存中にエラーが発生しました");
      setStage("idle");
    }
  }

  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => !busy && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">
            {isEdit ? "テストケース編集" : "新規テストケース"}
          </h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>名前 *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="例: FMT株式会社_2026/03"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>クライアント *</label>
              <select
                value={form.client_id}
                onChange={(e) => {
                  update("client_id", e.target.value);
                  autofillName(e.target.value, form.target_month);
                }}
                disabled={isEdit}
                className={inputClass + (isEdit ? " bg-gray-100" : "")}
              >
                <option value="">選択してください</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {isEdit && (
                <p className="text-xs text-gray-400 mt-1">編集時はクライアントを変更できません</p>
              )}
            </div>
            <div>
              <label className={labelClass}>対象月 * (YYYY/MM)</label>
              <input
                value={form.target_month}
                onChange={(e) => {
                  update("target_month", e.target.value);
                  autofillName(form.client_id, e.target.value);
                }}
                disabled={isEdit}
                className={inputClass + (isEdit ? " bg-gray-100" : "")}
                placeholder="2026/03"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Excelファイル {isEdit ? "（編集時は再アップロード不可）" : "*"}
            </label>
            {isEdit ? (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                ※ 入力データの変更は新規ケース作成で対応してください
              </p>
            ) : (
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => update("excelFile", e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            )}
          </div>

          <div>
            <label className={labelClass}>スクショ（投稿サムネイル画像・任意）</label>
            <p className="text-xs text-gray-400 mb-2">
              フィードTOP3・ワースト3のサムネイル画像を複数枚アップロードできます
            </p>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleScreenshotChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            {(form.existingScreenshots.length > 0 || form.newScreenshots.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.existingScreenshots.map((url) => (
                  <div key={`existing-${url}`} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="screenshot"
                      className="w-20 h-20 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingScreenshot(url)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="削除"
                    >
                      x
                    </button>
                  </div>
                ))}
                {form.newScreenshots.map((img, i) => (
                  <div key={`new-${img.name}-${i}`} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(img)}
                      alt={img.name}
                      className="w-20 h-20 object-cover rounded-lg border ring-2 ring-green-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewScreenshot(i)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="削除"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>担当者メモ</label>
            <textarea
              value={form.operator_memo}
              onChange={(e) => update("operator_memo", e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="運用上の感覚値・特記事項など"
            />
          </div>

          <div className="border rounded-lg p-4 bg-amber-50/40 space-y-3">
            <p className="text-xs font-bold text-amber-900">正解レポート（既存運用者が書いたもの）</p>
            <div>
              <label className={labelClass}>既存運用者名</label>
              <input
                value={form.reference_author}
                onChange={(e) => update("reference_author", e.target.value)}
                className={inputClass}
                placeholder="例: 松さん"
              />
            </div>
            <div>
              <label className={labelClass}>全文</label>
              <textarea
                value={form.reference_report_text}
                onChange={(e) => update("reference_report_text", e.target.value)}
                rows={4}
                className={inputClass + " font-mono"}
                placeholder="4セクションを連結したレポート全文（任意）"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>サマリー</label>
                <textarea
                  value={form.reference_summary}
                  onChange={(e) => update("reference_summary", e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>フォロワー分析</label>
                <textarea
                  value={form.reference_follower}
                  onChange={(e) => update("reference_follower", e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>リーチ分析</label>
                <textarea
                  value={form.reference_reach}
                  onChange={(e) => update("reference_reach", e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>アカウント分析</label>
                <textarea
                  value={form.reference_account}
                  onChange={(e) => update("reference_account", e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>メモ</label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="このケースの特徴・注意点など"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              ⚠ {error}
            </p>
          )}

          {stage === "parsing" && (
            <p className="text-xs text-blue-700 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
              Excelを解析中...
            </p>
          )}
          {stage === "saving" && (
            <p className="text-xs text-blue-700 flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
              保存中...
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            {busy ? "処理中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
