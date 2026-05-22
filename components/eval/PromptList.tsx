"use client";

import { useState } from "react";
import type { EvalPromptVersion } from "@/lib/eval/types";

interface Props {
  prompts: EvalPromptVersion[];
  onEdit: (p: EvalPromptVersion) => void;
  onDuplicate: (p: EvalPromptVersion) => void;
  onDelete: (p: EvalPromptVersion) => void;
}

export function PromptList({ prompts, onEdit, onDuplicate, onDelete }: Props) {
  const [previewing, setPreviewing] = useState<EvalPromptVersion | null>(null);

  if (prompts.length === 0) {
    return (
      <p className="text-center text-gray-400 py-12 text-sm">
        このセクションにはまだプロンプトが登録されていません
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {prompts.map((p) => (
          <Card
            key={p.id}
            prompt={p}
            onPreview={() => setPreviewing(p)}
            onEdit={() => onEdit(p)}
            onDuplicate={() => onDuplicate(p)}
            onDelete={() => onDelete(p)}
          />
        ))}
      </div>

      {previewing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setPreviewing(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {previewing.section} / {previewing.version_label}
              </h3>
              <button
                onClick={() => setPreviewing(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <pre className="whitespace-pre-wrap text-xs font-mono bg-gray-50 border rounded p-3 max-h-[60vh] overflow-y-auto">
                {previewing.prompt_template}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Card({
  prompt: p,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  prompt: EvalPromptVersion;
  onPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const cfg = p.reference_config;
  const refSummary = `同社${cfg.same_client_limit}件 / 他社${cfg.other_client_limit}件 / BP${cfg.use_best_practice ? "使用" : "なし"}`;

  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-bold text-sm text-gray-900">
            {p.section} {p.version_label}
          </h3>
          {p.description && (
            <p className="text-xs text-gray-600 mt-1">{p.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">参照: {refSummary}</p>
          <p className="text-xs text-gray-400">
            作成: {new Date(p.created_at).toLocaleString("ja-JP")}
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button
            onClick={onPreview}
            className="text-xs px-3 py-1 border border-gray-400 text-gray-600 rounded hover:bg-gray-50"
          >
            本文を表示
          </button>
          <button
            onClick={onEdit}
            className="text-xs px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
          >
            編集
          </button>
          <button
            onClick={onDuplicate}
            className="text-xs px-3 py-1 border border-purple-600 text-purple-600 rounded hover:bg-purple-50"
          >
            複製してv2作成
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1 border border-red-500 text-red-500 rounded hover:bg-red-50"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
