"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Client } from "@/lib/types";

interface FmtVersionRow {
  id: string;
  version: number;
  is_active: boolean;
  updated_at: string;
}

const YEAR_MONTH_PATTERN = /^\d{4}\/(0[1-9]|1[0-2])$/;

type KpiField = "follower" | "reach" | "view" | "engagement" | "post_count";

const KPI_FIELDS: Array<{ key: KpiField; label: string; placeholder: string }> = [
  { key: "follower", label: "フォロワー純増数", placeholder: "例: 120" },
  { key: "reach", label: "総リーチ数", placeholder: "例: 35000" },
  { key: "view", label: "総ビュー数", placeholder: "例: 80000" },
  { key: "engagement", label: "総エンゲージメント数", placeholder: "例: 2400" },
  { key: "post_count", label: "投稿本数", placeholder: "例: 16" },
];

type KpiInputState = Record<KpiField, string>;

const EMPTY_KPI: KpiInputState = {
  follower: "",
  reach: "",
  view: "",
  engagement: "",
  post_count: "",
};

export default function KnowledgeImportPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [fmtVersions, setFmtVersions] = useState<FmtVersionRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [yearMonth, setYearMonth] = useState("");
  const [fmtVersion, setFmtVersion] = useState<number | "">("");
  const [reportText, setReportText] = useState("");
  const [kpiInput, setKpiInput] = useState<KpiInputState>(EMPTY_KPI);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [clientsRes, fmtRes] = await Promise.all([
        fetch("/api/clients"),
        fetch("/api/master-fmt/list"),
      ]);
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (fmtRes.ok) {
        const list: FmtVersionRow[] = await fmtRes.json();
        setFmtVersions(list);
        if (list[0]) setFmtVersion(list[0].version);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!clientId) {
      setMessage({ type: "error", text: "クライアントを選択してください" });
      return;
    }
    if (!YEAR_MONTH_PATTERN.test(yearMonth)) {
      setMessage({ type: "error", text: "年月は YYYY/MM 形式で指定してください（例: 2025/12）" });
      return;
    }
    if (fmtVersion === "" || fmtVersion == null) {
      setMessage({ type: "error", text: "FMTバージョンを選択してください" });
      return;
    }
    if (!reportText.trim()) {
      setMessage({ type: "error", text: "考察テキストを入力してください" });
      return;
    }

    const kpiSummary: Partial<Record<KpiField, number>> = {};
    for (const { key, label } of KPI_FIELDS) {
      const raw = kpiInput[key].trim();
      if (!raw) continue;
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) {
        setMessage({ type: "error", text: `${label} は数値で入力してください` });
        return;
      }
      kpiSummary[key] = n;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          year_month: yearMonth,
          fmt_version: fmtVersion,
          kpi_summary: kpiSummary,
          top_posts: {},
          report_text: reportText,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "登録に失敗しました" }));
        setMessage({ type: "error", text: err.error ?? "登録に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "登録しました" });
      setYearMonth("");
      setReportText("");
      setKpiInput(EMPTY_KPI);
    } catch (err) {
      const text = err instanceof Error ? err.message : "登録中にエラーが発生しました";
      setMessage({ type: "error", text });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">過去レポート手動登録</h1>
          <div className="flex gap-4">
            <Link href="/admin/knowledge" className="text-sm text-blue-600 hover:text-blue-800">
              ナレッジDB一覧
            </Link>
            <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
              管理画面
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <p className="text-sm text-gray-600 mb-6">
            運用開始時の過去レポートをナレッジDBへ手動で登録します。連続入力できます。
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                クライアント <span className="text-red-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">選択してください</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                年月 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
                placeholder="例: 2025/12"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
              <p className="mt-1 text-xs text-gray-500">YYYY/MM 形式</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                FMTバージョン <span className="text-red-500">*</span>
              </label>
              <select
                value={fmtVersion}
                onChange={(e) =>
                  setFmtVersion(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              >
                <option value="">選択してください</option>
                {fmtVersions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version}
                    {v.is_active ? "（現在のアクティブ）" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  KPIサマリー <span className="text-xs text-gray-500">（任意・前月比計算用）</span>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
                {KPI_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-600 mb-1">{label}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={kpiInput[key]}
                      onChange={(e) =>
                        setKpiInput((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={placeholder}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                入力された項目だけ kpi_summary に保存されます
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                考察テキスト <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                rows={16}
                placeholder="過去レポートの考察テキストをそのまま貼り付けてください"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed"
                required
              />
            </div>

            {message && (
              <div
                className={`text-sm px-3 py-2 rounded-lg ${
                  message.type === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Link
                href="/admin/knowledge"
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                一覧へ戻る
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? "登録中..." : "ナレッジに登録"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
