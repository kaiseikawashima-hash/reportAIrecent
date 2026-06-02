"use client";

// ==========================================
// Phase 4a: 過去月数値の手打ち入力エディタ（制御コンポーネント）
// 入力対象は推移グラフに必要な数値のみ（monthly_trends 相当）。
// デモグラフィック（年齢・性別・地域）は手打ち対象外。
// 利用箇所: /admin/eval/report（数値の補完・修正）、/admin（クライアント登録時の初期入力）
// ==========================================

import {
  TREND_KPI_KEYS,
  TREND_KPI_LABELS,
  type ManualKpiEntry,
  type TrendKpiKey,
} from "@/lib/report/types";

export interface ManualKpiRow {
  id: string;
  yearMonth: string; // "YYYY-MM"（input type=month の値）
  values: Record<TrendKpiKey, string>; // 入力中の生文字列（空 = 未入力）
}

let rowSeq = 0;

export function createEmptyManualRow(): ManualKpiRow {
  rowSeq += 1;
  const values = {} as Record<TrendKpiKey, string>;
  for (const key of TREND_KPI_KEYS) values[key] = "";
  return { id: `manual-row-${Date.now()}-${rowSeq}`, yearMonth: "", values };
}

/**
 * 入力行を API 送信用エントリへ変換する。
 * 空欄キーは送らない（既存 kpi_summary を上書きしない）。
 */
export function manualRowsToEntries(
  rows: ManualKpiRow[]
): { entries: ManualKpiEntry[] } | { error: string } {
  const entries: ManualKpiEntry[] = [];
  for (const row of rows) {
    const hasAnyValue = TREND_KPI_KEYS.some((k) => row.values[k].trim() !== "");
    if (!row.yearMonth && !hasAnyValue) continue; // 完全な空行はスキップ

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.yearMonth)) {
      return { error: "年月が未入力の行があります" };
    }
    if (!hasAnyValue) {
      return { error: `${row.yearMonth.replace("-", "/")}: 数値が1つも入力されていません` };
    }
    const values: ManualKpiEntry["values"] = {};
    for (const key of TREND_KPI_KEYS) {
      const raw = row.values[key].trim();
      if (raw === "") continue;
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        return {
          error: `${row.yearMonth.replace("-", "/")}: ${TREND_KPI_LABELS[key]} は0以上の数値で入力してください`,
        };
      }
      values[key] = n;
    }
    entries.push({ year_month: row.yearMonth.replace("-", "/"), values });
  }
  const months = entries.map((e) => e.year_month);
  const dup = months.find((m, i) => months.indexOf(m) !== i);
  if (dup) {
    return { error: `同じ年月（${dup}）が複数行入力されています` };
  }
  return { entries };
}

export default function ManualKpiEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: ManualKpiRow[];
  onChange: (next: ManualKpiRow[]) => void;
  disabled?: boolean;
}) {
  function updateRow(id: string, updater: (row: ManualKpiRow) => ManualKpiRow) {
    onChange(rows.map((r) => (r.id === id ? updater(r) : r)));
  }

  function removeRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow() {
    onChange([...rows, createEmptyManualRow()]);
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-xs text-gray-400">
          「+ 月を追加」で過去月の数値を入力できます（入力した項目だけが保存されます）
        </p>
      )}

      {rows.map((row) => (
        <div key={row.id} className="border rounded-lg p-3 bg-gray-50/50">
          <div className="flex items-center justify-between mb-2">
            <input
              type="month"
              value={row.yearMonth}
              disabled={disabled}
              onChange={(e) =>
                updateRow(row.id, (r) => ({ ...r, yearMonth: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={disabled}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
            >
              行を削除
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {TREND_KPI_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-[10px] text-gray-500 mb-0.5">
                  {TREND_KPI_LABELS[key]}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={row.values[key]}
                  disabled={disabled}
                  placeholder="-"
                  onChange={(e) =>
                    updateRow(row.id, (r) => ({
                      ...r,
                      values: { ...r.values, [key]: e.target.value },
                    }))
                  }
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-right bg-white"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
      >
        + 月を追加
      </button>
    </div>
  );
}
