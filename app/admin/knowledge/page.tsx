"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { BestPractice, Client, KnowledgeBase } from "@/lib/types";

export default function KnowledgePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [records, setRecords] = useState<KnowledgeBase[]>([]);
  const [bestPractices, setBestPractices] = useState<BestPractice[]>([]);
  const [filterClient, setFilterClient] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
    fetchRecords();
    fetchBestPractices();
  }, []);

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
              return (
                <div key={r.id} className="border rounded-lg">
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      className="flex-1 flex items-center gap-4 text-left hover:bg-gray-50 -mx-4 -my-3 px-4 py-3 rounded-lg"
                    >
                      <span className="font-medium text-sm">
                        {clientMap.get(r.client_id ?? "") ?? "不明"}
                      </span>
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
    </main>
  );
}
