"use client";

// ==========================================
// Phase 4a2: 管理画面（クライアント編集モーダル）用
// 月次数値の「Excel一括取り込み + 一覧 + 手打ち補完」コンポーネント。
//
// 役割:
// - このクライアントの登録済み月次数値（推移グラフのデータ源）を時系列で一覧表示
// - 複数月入り Excel をアップロード → 過去月（当月除く）を確認表に取り込み
// - 確認表のセルを月ごとに手打ち補完（Excel が埋められなかった 0/N/A を修正）
// - 保存は /api/report-builder/manual-kpi（共通マージ upsert）に集約
//   → report_text を持つ月の本文・デモグラは壊さない
//
// 対象クライアントが確定している編集モードでのみ使用する。
// ==========================================

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExcelParseResult } from "@/lib/types";
import {
  TREND_KPI_KEYS,
  TREND_KPI_LABELS,
  type KpiHistoryPoint,
  type ManualKpiEntry,
  type TrendKpiKey,
} from "@/lib/report/types";
import { monthlyTrendsToManualEntries, pickKpiNumber } from "@/lib/report/kpi-history";
import { authHeaders, clearAppPassword } from "@/lib/client-auth";

interface EditableRow {
  year_month: string; // "YYYY/MM"
  values: Record<TrendKpiKey, string>; // 入力中の生文字列（空 = 未入力）
  hasReport: boolean; // 考察テキストを持つ月か（補完時の注意表示用）
}

function emptyValues(): Record<TrendKpiKey, string> {
  const v = {} as Record<TrendKpiKey, string>;
  for (const key of TREND_KPI_KEYS) v[key] = "";
  return v;
}

function numToStr(n: number | null): string {
  return n === null ? "" : String(n);
}

/** KpiHistoryPoint[] → 編集行（年月昇順） */
function pointsToRows(points: KpiHistoryPoint[]): EditableRow[] {
  return points.map((p) => {
    const values = emptyValues();
    for (const key of TREND_KPI_KEYS) {
      values[key] = numToStr(pickKpiNumber(p.kpi, key));
    }
    return { year_month: p.year_month, values, hasReport: p.has_report };
  });
}

/** 編集行 → API 送信用エントリ（非空セルのみ・バリデーション） */
function rowsToEntries(
  rows: EditableRow[]
): { entries: ManualKpiEntry[] } | { error: string } {
  const entries: ManualKpiEntry[] = [];
  for (const row of rows) {
    const values: ManualKpiEntry["values"] = {};
    for (const key of TREND_KPI_KEYS) {
      const raw = row.values[key].trim();
      if (raw === "") continue;
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        return {
          error: `${row.year_month}: ${TREND_KPI_LABELS[key]} は0以上の数値で入力してください`,
        };
      }
      values[key] = n;
    }
    if (Object.keys(values).length === 0) continue; // 全空の月はスキップ
    entries.push({ year_month: row.year_month, values });
  }
  return { entries };
}

export default function ClientKpiManager({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ------------------------------------------
  // 登録済み月次数値の読み込み
  // ------------------------------------------
  const loadHistory = useCallback(async () => {
    if (!clientId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/report-builder/history?client_id=${encodeURIComponent(clientId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "月次数値の取得に失敗しました");
      }
      const data = await res.json();
      const points: KpiHistoryPoint[] = Array.isArray(data.points) ? data.points : [];
      setRows(pointsToRows(points));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "月次数値の取得に失敗しました");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ------------------------------------------
  // Excel パース → 過去月（当月除く）を確認表へマージ
  // ------------------------------------------
  useEffect(() => {
    if (!excelFile) return;
    let cancelled = false;
    setExcelLoading(true);
    setExcelError(null);
    setImportedCount(null);
    setSaveMessage(null);
    setSaveError(null);

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
        // 当月（target_month）は除外。当月はレポート画面/import で考察つき登録される
        const entries = monthlyTrendsToManualEntries(data.monthly_trends, data.target_month);
        setImportedCount(entries.length);
        if (entries.length === 0) {
          setExcelError(
            "推移データに過去月（当月以外）が見つかりませんでした。複数月入りのExcelをアップロードしてください"
          );
          return;
        }
        mergeEntriesIntoRows(entries);
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

  /** Excel 取り込み値を確認表へマージ（Excel が値を持つキーだけ上書き、手打ち補完済みは可能な限り保持） */
  function mergeEntriesIntoRows(entries: ManualKpiEntry[]) {
    setRows((prev) => {
      const byMonth = new Map<string, EditableRow>();
      for (const r of prev) byMonth.set(r.year_month, r);

      for (const entry of entries) {
        const existing = byMonth.get(entry.year_month);
        const base: EditableRow = existing
          ? { ...existing, values: { ...existing.values } }
          : { year_month: entry.year_month, values: emptyValues(), hasReport: false };
        for (const key of TREND_KPI_KEYS) {
          const v = entry.values[key];
          if (v === undefined) continue;
          // Excel 由来の値で上書き（0 も含めて反映。手打ち補完はこの後ユーザーが調整）
          base.values[key] = String(v);
        }
        byMonth.set(entry.year_month, base);
      }

      return [...byMonth.values()].sort((a, b) =>
        a.year_month.localeCompare(b.year_month)
      );
    });
  }

  function updateCell(yearMonth: string, key: TrendKpiKey, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.year_month === yearMonth
          ? { ...r, values: { ...r.values, [key]: value } }
          : r
      )
    );
  }

  // ------------------------------------------
  // 保存
  // ------------------------------------------
  async function handleSave() {
    if (saving || !clientId) return;
    setSaveError(null);
    setSaveMessage(null);

    const converted = rowsToEntries(rows);
    if ("error" in converted) {
      setSaveError(converted.error);
      return;
    }
    if (converted.entries.length === 0) {
      setSaveError("保存する数値がありません");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/report-builder/manual-kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ client_id: clientId, entries: converted.entries }),
      });
      if (!res.ok) {
        if (res.status === 401) clearAppPassword();
        const body = await res.json().catch(() => ({ error: "保存に失敗しました" }));
        throw new Error(body.error ?? "保存に失敗しました");
      }
      const data = await res.json();
      const updated = (data.results ?? []).filter(
        (r: { action: string }) => r.action === "updated"
      ).length;
      const created = (data.results ?? []).filter(
        (r: { action: string }) => r.action === "created"
      ).length;
      setSaveMessage(`月次数値を保存しました（新規${created}件 / 更新${updated}件）`);
      setExcelFile(null);
      setImportedCount(null);
      await loadHistory();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  const monthRange = useMemo(() => {
    if (rows.length === 0) return null;
    return `${rows[0].year_month}〜${rows[rows.length - 1].year_month}（${rows.length}ヶ月）`;
  }, [rows]);

  if (!clientId) {
    return (
      <p className="text-[11px] text-gray-500">
        クライアントを保存すると、過去数値のExcel一括取り込み・一覧編集が利用できます。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Excel 一括取り込み */}
      <div className="border border-blue-200 rounded-lg bg-blue-50/50 p-3 space-y-2">
        <p className="text-xs text-blue-900 font-medium">
          📊 複数月入り Excel から過去数値を一括取り込み
        </p>
        <p className="text-[11px] text-blue-800">
          前アプリ書き出しや Instagram AI Pro の複数月分 Excel をアップロードすると、
          推移データの過去月（当月 = target_month は除く）が下の確認表に取り込まれます。
          取り込み後にセルを手打ちで補完し、「月次数値を保存」で登録してください。
          既存の月は推移用12項目だけがマージ更新され、考察テキスト・デモグラフィックは変更されません。
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
        />
        {excelLoading && <p className="text-[11px] text-blue-800">Excelを解析中...</p>}
        {excelError && <p className="text-[11px] text-red-600">⚠ {excelError}</p>}
        {importedCount !== null && importedCount > 0 && !excelLoading && (
          <p className="text-[11px] text-emerald-700">
            ✅ 過去{importedCount}ヶ月分を確認表に取り込みました（まだ保存されていません）
          </p>
        )}
      </div>

      {/* このクライアントの月次数値一覧（編集可能） */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-medium text-gray-700">
            このクライアントの月次数値{monthRange ? `（${monthRange}）` : ""}
          </p>
          <button
            type="button"
            onClick={loadHistory}
            disabled={loading || saving}
            className="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-600 disabled:opacity-50"
          >
            {loading ? "読込中..." : "再読込"}
          </button>
        </div>

        {loadError && <p className="text-[11px] text-red-600">⚠ {loadError}</p>}

        {rows.length === 0 ? (
          <p className="text-[11px] text-gray-400 py-3">
            登録済みの月次数値はありません。上の Excel 取り込みで過去数値を追加できます。
          </p>
        ) : (
          <div className="overflow-x-auto border rounded-lg bg-white">
            <table className="text-[11px] whitespace-nowrap">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600">
                  <th className="sticky left-0 z-10 bg-gray-50 text-left py-1.5 px-2 font-medium">
                    年月
                  </th>
                  {TREND_KPI_KEYS.map((key) => (
                    <th key={key} className="text-right py-1.5 px-2 font-medium">
                      {TREND_KPI_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.year_month} className="border-b last:border-b-0">
                    <td className="sticky left-0 z-10 bg-white py-1 px-2 font-medium text-gray-800">
                      <span className="flex items-center gap-1">
                        {row.year_month}
                        {row.hasReport && (
                          <span
                            title="この月は考察テキストを持っています（数値補完しても本文は壊れません）"
                            className="text-[9px] px-1 rounded bg-emerald-100 text-emerald-700"
                          >
                            考察
                          </span>
                        )}
                      </span>
                    </td>
                    {TREND_KPI_KEYS.map((key) => (
                      <td key={key} className="py-1 px-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.values[key]}
                          disabled={saving}
                          placeholder="-"
                          onChange={(e) => updateCell(row.year_month, key, e.target.value)}
                          className="w-20 border border-gray-200 rounded px-1.5 py-1 text-right text-[11px] bg-white focus:border-blue-400"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || rows.length === 0}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
              !saving && rows.length > 0
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {saving ? "保存中..." : "月次数値を保存"}
          </button>
          {saveMessage && <p className="text-xs text-emerald-700">✅ {saveMessage}</p>}
          {saveError && <p className="text-xs text-red-600">⚠ {saveError}</p>}
        </div>
        <p className="text-[10px] text-gray-400">
          入力された項目だけが保存されます（空欄のセルは既存値を上書きしません）。
        </p>
      </div>
    </div>
  );
}
