"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BestPractice, Client, KnowledgeBase } from "@/lib/types";

type DeleteTarget = {
  id: string;
  clientName: string;
  yearMonth: string;
  fmtVersion: number;
};

type Toast =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export default function KnowledgePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [records, setRecords] = useState<KnowledgeBase[]>([]);
  const [bestPractices, setBestPractices] = useState<BestPractice[]>([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    fetchClients();
    fetchRecords();
    fetchBestPractices();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function fetchClients() {
    const res = await fetch("/api/clients");
    if (res.ok) setClients(await res.json());
  }

  async function fetchRecords() {
    const res = await fetch("/api/knowledge/list");
    if (res.ok) setRecords(await res.json());
  }

  async function fetchBestPractices() {
    const res = await fetch("/api/best-practices");
    if (res.ok) setBestPractices(await res.json());
  }

  async function registerBestPractice(knowledgeBaseId: string) {
    setBusyId(knowledgeBaseId);
    const reason = window.prompt("登録理由（任意）", "") ?? "";
    const res = await fetch("/api/best-practices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        reason: reason || null,
      }),
    });
    if (res.ok) await fetchBestPractices();
    setBusyId(null);
  }

  async function unregisterBestPractice(knowledgeBaseId: string) {
    setBusyId(knowledgeBaseId);
    const res = await fetch(
      `/api/best-practices?knowledge_base_id=${encodeURIComponent(knowledgeBaseId)}`,
      { method: "DELETE" }
    );
    if (res.ok) await fetchBestPractices();
    setBusyId(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/knowledge/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "削除に失敗しました" }));
        throw new Error(body.error ?? "削除に失敗しました");
      }
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setBestPractices((prev) =>
        prev.filter((bp) => bp.knowledge_base_id !== deleteTarget.id)
      );
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setToast({ kind: "success", message: "削除しました" });
      setDeleteTarget(null);
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "削除に失敗しました",
      });
    } finally {
      setDeleting(false);
    }
  }

  const clientMap = new Map(clients.map((c) => [c.id, c.name]));
  const bestPracticeMap = new Map(
    bestPractices.map((bp) => [bp.knowledge_base_id, bp])
  );

  const filtered = records.filter((r) => {
    if (filterClient && r.client_id !== filterClient) return false;
    if (filterMonth && !r.year_month.includes(filterMonth)) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">ナレッジDB</h1>
          <div className="flex gap-4">
            <Link
              href="/admin/knowledge/import"
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              過去レポートを手動登録
            </Link>
            <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
              管理画面
            </Link>
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
              レポート生成
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          {/* フィルタ */}
          <div className="flex gap-4 mb-6">
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">全クライアント</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="年月で絞り込み（例: 2026/03）"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="text-sm text-gray-500 self-center">
              {filtered.length}件
            </span>
          </div>

          {/* レコード一覧 */}
          <div className="space-y-3">
            {filtered.map((r) => {
              const isBest = bestPracticeMap.has(r.id);
              const isBusy = busyId === r.id;
              const clientName = clientMap.get(r.client_id ?? "") ?? "不明";
              return (
                <div key={r.id} className="border rounded-lg">
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className="flex-1 flex items-center gap-4 text-left hover:bg-gray-50 -mx-4 -my-3 px-4 py-3 rounded-lg"
                    >
                      <span className="font-medium text-sm">{clientName}</span>
                      <span className="text-sm text-gray-600">{r.year_month}</span>
                      <span className="text-xs text-gray-400">FMT v{r.fmt_version}</span>
                      {isBest && (
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                          ★ ベストプラクティス
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-2 ml-3">
                      {isBest ? (
                        <button
                          onClick={() => unregisterBestPractice(r.id)}
                          disabled={isBusy}
                          className="text-xs px-3 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 disabled:opacity-50"
                        >
                          解除
                        </button>
                      ) : (
                        <button
                          onClick={() => registerBestPractice(r.id)}
                          disabled={isBusy}
                          className="text-xs px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                        >
                          ベストプラクティスに登録
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            id: r.id,
                            clientName,
                            yearMonth: r.year_month,
                            fmtVersion: r.fmt_version,
                          })
                        }
                        title="削除"
                        aria-label="削除"
                        className="text-red-500 hover:text-red-700 px-1 py-1 rounded hover:bg-red-50"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      <span className="text-gray-400 text-sm">
                        {expandedId === r.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>
                  {expandedId === r.id && (
                    <div className="px-4 pb-4 border-t">
                      {isBest && bestPracticeMap.get(r.id)?.reason && (
                        <p className="mt-3 text-xs text-gray-600">
                          登録理由: {bestPracticeMap.get(r.id)?.reason}
                        </p>
                      )}
                      <pre className="mt-3 text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-[400px] overflow-y-auto">
                        {r.report_text ?? "(テキストなし)"}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">
                レコードがありません
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              以下のナレッジを削除しますか？
            </h2>
            <dl className="text-sm text-gray-700 space-y-1 mb-4">
              <div className="flex">
                <dt className="w-24 text-gray-500">クライアント:</dt>
                <dd>{deleteTarget.clientName}</dd>
              </div>
              <div className="flex">
                <dt className="w-24 text-gray-500">年月:</dt>
                <dd>{deleteTarget.yearMonth}</dd>
              </div>
              <div className="flex">
                <dt className="w-24 text-gray-500">FMTバージョン:</dt>
                <dd>v{deleteTarget.fmtVersion}</dd>
              </div>
            </dl>
            <p className="text-xs text-red-600 mb-5">
              ⚠️ この操作は取り消せません。ベストプラクティス登録も同時に解除されます。
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
            toast.kind === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}
    </main>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
