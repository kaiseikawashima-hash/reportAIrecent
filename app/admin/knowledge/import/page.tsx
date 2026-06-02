"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Client, ExcelParseResult, KpiSummary } from "@/lib/types";
import { excelToKpiSummary } from "@/lib/excel-to-kpi";

interface FmtVersionRow {
  id: string;
  version: number;
  is_active: boolean;
  updated_at: string;
}

const YEAR_MONTH_PATTERN = /^\d{4}\/(0[1-9]|1[0-2])$/;

type ImportMode = "manual" | "excel";

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

  // Phase 3.7: Excel アップロードモード
  const [mode, setMode] = useState<ImportMode>("manual");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelData, setExcelData] = useState<ExcelParseResult | null>(null);
  const [excelKpi, setExcelKpi] = useState<KpiSummary | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

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

  // Excel ファイル選択時にパース
  useEffect(() => {
    if (!excelFile) {
      setExcelData(null);
      setExcelKpi(null);
      setExcelError(null);
      return;
    }
    let cancelled = false;
    setExcelLoading(true);
    setExcelError(null);

    const fd = new FormData();
    fd.append("file", excelFile);
    fetch("/api/parse-excel", { method: "POST", body: fd })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Excel解析に失敗しました" }));
          throw new Error(body.error ?? "Excel解析に失敗しました");
        }
        return (await res.json()) as ExcelParseResult;
      })
      .then((data) => {
        if (cancelled) return;
        setExcelData(data);
        setExcelKpi(excelToKpiSummary(data));
        if (data.target_month && YEAR_MONTH_PATTERN.test(data.target_month)) {
          setYearMonth(data.target_month);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setExcelError(err instanceof Error ? err.message : "Excel解析に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) setExcelLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [excelFile]);

  function handleModeChange(next: ImportMode) {
    setMode(next);
    setMessage(null);
    if (next === "manual") {
      setExcelFile(null);
    }
  }

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

    let kpiSummary: Record<string, unknown> = {};
    let excelParsedPayload: ExcelParseResult | Record<string, never> = {};

    if (mode === "excel") {
      if (!excelData || !excelKpi) {
        setMessage({ type: "error", text: "Excelファイルをアップロードしてください" });
        return;
      }
      kpiSummary = excelKpi as unknown as Record<string, unknown>;
      excelParsedPayload = excelData;
    } else {
      const manualKpi: Partial<Record<KpiField, number>> = {};
      for (const { key, label } of KPI_FIELDS) {
        const raw = kpiInput[key].trim();
        if (!raw) continue;
        const n = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(n)) {
          setMessage({ type: "error", text: `${label} は数値で入力してください` });
          return;
        }
        manualKpi[key] = n;
      }
      kpiSummary = manualKpi as Record<string, unknown>;
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
          excel_parsed: excelParsedPayload,
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
      setExcelFile(null);
      setExcelData(null);
      setExcelKpi(null);
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

          {/* 入力モード切替 */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">入力モード</p>
            <div className="flex gap-3">
              <label
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer ${
                  mode === "manual"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "manual"}
                  onChange={() => handleModeChange("manual")}
                />
                <span>手動入力</span>
                <span className="text-xs text-gray-500">KPIを直接入力</span>
              </label>
              <label
                className={`flex-1 flex items-center gap-2 px-3 py-2 rounded border text-sm cursor-pointer ${
                  mode === "excel"
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "excel"}
                  onChange={() => handleModeChange("excel")}
                />
                <span>Excelアップロード</span>
                <span className="text-xs text-gray-500">数値を自動入力</span>
              </label>
            </div>
          </div>

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

            {/* Excelアップロード（Excel モードのみ） */}
            {mode === "excel" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Excelファイル <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                />
                {excelFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    選択中: {excelFile.name}（{Math.round(excelFile.size / 1024).toLocaleString()} KB）
                  </p>
                )}
                {excelLoading && (
                  <p className="text-xs text-gray-600 mt-1">Excelを解析中...</p>
                )}
                {excelError && (
                  <p className="text-xs text-red-600 mt-1">エラー: {excelError}</p>
                )}
                {excelData && excelKpi && (
                  <ExcelPreview data={excelData} kpi={excelKpi} />
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                年月 <span className="text-red-500">*</span>
                {mode === "excel" && (
                  <span className="ml-2 text-xs text-gray-500">
                    （Excelから自動入力されます）
                  </span>
                )}
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

            {/* KPI 入力（手動モードのみ） */}
            {mode === "manual" && (
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
            )}

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

function ExcelPreview({ data, kpi }: { data: ExcelParseResult; kpi: KpiSummary }) {
  const targetValid = YEAR_MONTH_PATTERN.test(data.target_month);
  return (
    <div className="mt-3 border rounded-lg bg-white">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700">読み取った数値の確認表</span>
        <span className={targetValid ? "text-gray-600" : "text-red-600 font-medium"}>
          target_month: {data.target_month || "(空)"}
        </span>
      </div>
      <details open className="border-b">
        <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
          サマリー
        </summary>
        <div className="px-3 pb-3">
          <table className="text-xs w-full">
            <tbody>
              {[
                ["フォロワー", kpi.follower],
                ["総ビュー", kpi.view],
                ["総リーチ", kpi.reach],
                ["総エンゲージメント", kpi.engagement],
                ["投稿本数", kpi.post_count],
                ["コメント", data.summary.comments],
                ["プロフィールアクセス", kpi.profile_access],
                ["リンククリック", kpi.link_clicks],
                ["エンゲージメント率", kpi.engagement_rate],
              ].map(([label, value]) => (
                <tr key={String(label)} className="border-b last:border-b-0">
                  <th className="text-left text-gray-600 py-1 pr-3 font-normal w-44">
                    {label}
                  </th>
                  <td className="py-1 text-gray-900">
                    {typeof value === "number" ? value.toLocaleString() : value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="border-b">
        <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
          性別 / 年齢分布
        </summary>
        <div className="px-3 pb-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-gray-600 mb-1">性別比</p>
            <p>男性: {kpi.gender_ratio.male.toLocaleString()}</p>
            <p>女性: {kpi.gender_ratio.female.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-600 mb-1">年齢分布</p>
            {Object.entries(kpi.age_distribution).map(([k, v]) => (
              <p key={k}>{k}: {v.toLocaleString()}</p>
            ))}
          </div>
        </div>
      </details>
      <details>
        <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
          投稿本数（フィード / リール）
        </summary>
        <div className="px-3 pb-3 text-xs space-y-1">
          <p>フィード本数: {kpi.feed_post_count.toLocaleString()} / リーチ平均: {kpi.feed_reach_avg.toLocaleString()} / ビュー平均: {kpi.feed_view_avg.toLocaleString()}</p>
          <p>リール本数: {kpi.reel_post_count.toLocaleString()} / リーチ平均: {kpi.reel_reach_avg.toLocaleString()} / ビュー平均: {kpi.reel_view_avg.toLocaleString()}</p>
          <p>いいね合計: {kpi.likes_total.toLocaleString()} / 保存合計: {kpi.saves_total.toLocaleString()} / コメント合計: {kpi.comments_total.toLocaleString()}</p>
        </div>
      </details>
    </div>
  );
}
