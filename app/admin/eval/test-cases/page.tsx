"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Client } from "@/lib/types";
import type { EvalTestCase } from "@/lib/eval/types";
import { TestCaseList } from "@/components/eval/TestCaseList";
import { TestCaseForm, type TestCaseFormMode } from "@/components/eval/TestCaseForm";

export default function TestCasesPage() {
  const [testCases, setTestCases] = useState<EvalTestCase[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [modal, setModal] = useState<TestCaseFormMode | null>(null);
  const [filterClient, setFilterClient] = useState("");
  const [filterMonth, setFilterMonth] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/eval/test-cases")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: EvalTestCase[]) => {
        if (!cancelled) setTestCases(Array.isArray(data) ? data : []);
      });
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Client[]) => {
        if (!cancelled) setClients(Array.isArray(data) ? data : []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchTestCases() {
    const res = await fetch("/api/eval/test-cases");
    if (res.ok) setTestCases(await res.json());
  }

  const loading = testCases === null;

  const filtered = useMemo(() => {
    return (testCases ?? []).filter((tc) => {
      if (filterClient && tc.client_id !== filterClient) return false;
      if (filterMonth && !tc.target_month.includes(filterMonth)) return false;
      return true;
    });
  }, [testCases, filterClient, filterMonth]);

  async function handleDelete(tc: EvalTestCase) {
    if (!confirm(`「${tc.name}」を削除しますか？\n（一覧から非表示になりますが、過去のRunとの整合性のため物理削除はされません）`)) {
      return;
    }
    const res = await fetch(`/api/eval/test-cases/${tc.id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchTestCases();
    } else {
      const body = await res.json().catch(() => ({ error: "削除に失敗しました" }));
      alert(body.error ?? "削除に失敗しました");
    }
  }

  function handleSaved() {
    setModal(null);
    void fetchTestCases();
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/eval" className="text-sm text-blue-600 hover:text-blue-800">
              ← /admin/eval
            </Link>
            <h1 className="text-lg font-bold text-gray-900">テストケース管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex gap-3 flex-wrap">
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm"
              >
                <option value="">クライアント: すべて</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                placeholder="対象月: YYYY/MM"
                className="border border-gray-300 rounded px-3 py-2 text-sm w-40"
              />
            </div>
            <button
              onClick={() => setModal({ kind: "create" })}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              + 新規追加
            </button>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-12 text-sm">読み込み中...</p>
          ) : (
            <TestCaseList
              testCases={filtered}
              onEdit={(tc) => setModal({ kind: "edit", testCase: tc })}
              onDelete={handleDelete}
            />
          )}
        </section>
      </div>

      {modal && (
        <TestCaseForm
          mode={modal}
          clients={clients}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
