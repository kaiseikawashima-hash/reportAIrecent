"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EVAL_SECTIONS,
  SECTION_LABELS,
  type EvalPromptVersion,
  type EvalSection,
} from "@/lib/eval/types";
import { PromptList } from "@/components/eval/PromptList";
import { PromptForm, type PromptFormMode } from "@/components/eval/PromptForm";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<EvalPromptVersion[] | null>(null);
  const [activeTab, setActiveTab] = useState<EvalSection>("summary");
  const [modal, setModal] = useState<PromptFormMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/eval/prompts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: EvalPromptVersion[]) => {
        if (!cancelled) setPrompts(Array.isArray(data) ? data : []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchPrompts() {
    const res = await fetch("/api/eval/prompts");
    if (res.ok) setPrompts(await res.json());
  }

  const loading = prompts === null;

  const filtered = useMemo(
    () => (prompts ?? []).filter((p) => p.section === activeTab),
    [prompts, activeTab]
  );

  async function handleDelete(p: EvalPromptVersion) {
    if (!confirm(`${p.section} / ${p.version_label} を削除しますか？\n（過去のRunとの整合性のため物理削除はされません）`)) {
      return;
    }
    const res = await fetch(`/api/eval/prompts/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchPrompts();
    } else {
      const body = await res.json().catch(() => ({ error: "削除に失敗しました" }));
      alert(body.error ?? "削除に失敗しました");
    }
  }

  function handleSaved() {
    setModal(null);
    void fetchPrompts();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/eval" className="text-sm text-blue-600 hover:text-blue-800">
              ← /admin/eval
            </Link>
            <h1 className="text-lg font-bold text-gray-900">プロンプト管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4">
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 border-b border-gray-200 -mb-px">
              {EVAL_SECTIONS.map((s) => {
                const isActive = s === activeTab;
                return (
                  <button
                    key={s}
                    onClick={() => setActiveTab(s)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                      isActive
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {SECTION_LABELS[s]}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setModal({ kind: "create", section: activeTab })}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              + 新規追加
            </button>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">読み込み中...</p>
          ) : (
            <PromptList
              prompts={filtered}
              onEdit={(p) => setModal({ kind: "edit", prompt: p })}
              onDuplicate={(p) =>
                setModal({ kind: "create", section: p.section, preset: p })
              }
              onDelete={handleDelete}
            />
          )}
        </section>
      </div>

      {modal && (
        <PromptForm
          mode={modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
