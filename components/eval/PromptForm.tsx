"use client";

import { useState } from "react";
import {
  DEFAULT_REFERENCE_CONFIG,
  EVAL_SECTIONS,
  SECTION_LABELS,
  type EvalPromptVersion,
  type EvalSection,
  type PromptReferenceConfig,
} from "@/lib/eval/types";

export type PromptFormMode =
  | { kind: "create"; section: EvalSection; preset?: EvalPromptVersion }
  | { kind: "edit"; prompt: EvalPromptVersion };

interface Props {
  mode: PromptFormMode;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  section: EvalSection;
  version_label: string;
  prompt_template: string;
  description: string;
  parent_version_id: string | null;
  reference_config: PromptReferenceConfig;
  is_active: boolean;
}

function initialState(mode: PromptFormMode): FormState {
  if (mode.kind === "edit") {
    return {
      section: mode.prompt.section,
      version_label: mode.prompt.version_label,
      prompt_template: mode.prompt.prompt_template,
      description: mode.prompt.description ?? "",
      parent_version_id: mode.prompt.parent_version_id,
      reference_config: { ...mode.prompt.reference_config },
      is_active: mode.prompt.is_active,
    };
  }
  if (mode.preset) {
    return {
      section: mode.preset.section,
      version_label: "",
      prompt_template: mode.preset.prompt_template,
      description: "",
      parent_version_id: mode.preset.id,
      reference_config: { ...mode.preset.reference_config },
      is_active: true,
    };
  }
  return {
    section: mode.section,
    version_label: "",
    prompt_template: "",
    description: "",
    parent_version_id: null,
    reference_config: { ...DEFAULT_REFERENCE_CONFIG },
    is_active: true,
  };
}

export function PromptForm({ mode, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(initialState(mode));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode.kind === "edit";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateRef<K extends keyof PromptReferenceConfig>(
    key: K,
    value: PromptReferenceConfig[K]
  ) {
    setForm((f) => ({ ...f, reference_config: { ...f.reference_config, [key]: value } }));
  }

  async function handleSave() {
    setError(null);

    if (!form.version_label.trim()) {
      setError("バージョンラベルは必須です");
      return;
    }
    if (!form.prompt_template.trim()) {
      setError("プロンプト本文は必須です");
      return;
    }
    if (form.reference_config.same_client_limit < 0 || form.reference_config.other_client_limit < 0) {
      setError("参照件数は0以上で入力してください");
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const payload = {
          prompt_template: form.prompt_template,
          description: form.description || null,
          reference_config: form.reference_config,
          is_active: form.is_active,
        };
        const res = await fetch(`/api/eval/prompts/${mode.prompt.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "保存に失敗しました" }));
          setError(body.error ?? "保存に失敗しました");
          return;
        }
      } else {
        const payload = {
          section: form.section,
          version_label: form.version_label.trim(),
          prompt_template: form.prompt_template,
          description: form.description || null,
          parent_version_id: form.parent_version_id,
          reference_config: form.reference_config,
        };
        const res = await fetch("/api/eval/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "保存に失敗しました" }));
          setError(body.error ?? "保存に失敗しました");
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">
            {isEdit
              ? `プロンプト編集 [${SECTION_LABELS[form.section]} / ${form.version_label}]`
              : mode.preset
                ? `新規プロンプト（${mode.preset.version_label} を複製）`
                : `新規プロンプト [${SECTION_LABELS[form.section]}]`}
          </h3>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>セクション *</label>
              <select
                value={form.section}
                onChange={(e) => update("section", e.target.value as EvalSection)}
                disabled={isEdit}
                className={inputClass + (isEdit ? " bg-gray-100" : "")}
              >
                {EVAL_SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SECTION_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>バージョンラベル *</label>
              <input
                value={form.version_label}
                onChange={(e) => update("version_label", e.target.value)}
                disabled={isEdit}
                className={inputClass + (isEdit ? " bg-gray-100" : "")}
                placeholder="例: v2, v2-causality-strengthened"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>プロンプト本文 *</label>
            <textarea
              value={form.prompt_template}
              onChange={(e) => update("prompt_template", e.target.value)}
              rows={16}
              className={inputClass + " font-mono text-xs"}
              placeholder="プロンプトテンプレート..."
            />
            <p className="text-xs text-gray-400 mt-1">
              ※ {"{master_fmt}"}, {"{client_name}"}, {"{diff_text}"} 等のプレースホルダはそのまま記述してください
            </p>
          </div>

          <div>
            <label className={labelClass}>説明（このバージョンの設計意図）</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="例: 因果の妥当性を強化するため、Layer 3-b に過去2ヶ月の施策履歴を追加"
            />
          </div>

          <div className="border rounded-lg p-4 bg-gray-50/60 space-y-3">
            <p className="text-xs font-bold text-gray-700">参照設定</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>同クライアント参照件数</label>
                <input
                  type="number"
                  min={0}
                  value={form.reference_config.same_client_limit}
                  onChange={(e) => updateRef("same_client_limit", Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>他クライアントランダム参照件数</label>
                <input
                  type="number"
                  min={0}
                  value={form.reference_config.other_client_limit}
                  onChange={(e) => updateRef("other_client_limit", Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm pb-2">
                  <input
                    type="checkbox"
                    checked={form.reference_config.use_best_practice}
                    onChange={(e) => updateRef("use_best_practice", e.target.checked)}
                  />
                  ベストプラクティスを使用
                </label>
              </div>
            </div>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update("is_active", e.target.checked)}
              />
              アクティブ（一覧に表示）
            </label>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              ⚠ {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
