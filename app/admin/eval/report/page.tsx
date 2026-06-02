"use client";

// ==========================================
// Phase 4a: アプリ内完結レポート作成画面
// クライアント選択 → 当月Excelアップロード → AI考察生成（4セクション順次）
// → 数値・グラフ自動描画 + 考察編集 → knowledge_base へ保存（UPSERT）
// ==========================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Client, ExcelParseResult, KpiSummary } from "@/lib/types";
import { excelToKpiSummary } from "@/lib/excel-to-kpi";
import { SECTION_LABELS, type EvalSection } from "@/lib/eval/types";
import type { KpiHistoryPoint } from "@/lib/report/types";
import { TREND_KPI_KEYS } from "@/lib/report/types";
import {
  buildTrendRows,
  monthlyTrendsToManualEntries,
} from "@/lib/report/kpi-history";
import SectionCard, { type SectionGenStatus } from "@/components/report/SectionCard";
import SummarySection from "@/components/report/SummarySection";
import FollowerSection from "@/components/report/FollowerSection";
import ReachSection from "@/components/report/ReachSection";
import AccountSection from "@/components/report/AccountSection";
import ManualKpiEditor, {
  manualRowsToEntries,
  type ManualKpiRow,
} from "@/components/report/ManualKpiEditor";
import { authHeaders, clearAppPassword } from "@/lib/client-auth";

const SECTION_ORDER: EvalSection[] = ["summary", "follower", "reach", "account"];

const SECTION_TITLES: Record<EvalSection, string> = {
  summary: "【1】サマリー",
  follower: "【2】フォロワー分析",
  reach: "【3】リーチ分析",
  account: "【4】アカウント分析",
};

type SectionTexts = Record<EvalSection, string>;
type SectionStatuses = Record<EvalSection, SectionGenStatus>;
type SectionErrors = Record<EvalSection, string | null>;

const EMPTY_TEXTS: SectionTexts = { summary: "", follower: "", reach: "", account: "" };
const EMPTY_STATUSES: SectionStatuses = {
  summary: "idle",
  follower: "idle",
  reach: "idle",
  account: "idle",
};
const EMPTY_ERRORS: SectionErrors = {
  summary: null,
  follower: null,
  reach: null,
  account: null,
};

export default function ReportBuilderPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [yearMonth, setYearMonth] = useState(""); // "YYYY-MM"
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelParsed, setExcelParsed] = useState<ExcelParseResult | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [operatorMemo, setOperatorMemo] = useState("");

  const [historyPoints, setHistoryPoints] = useState<KpiHistoryPoint[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [texts, setTexts] = useState<SectionTexts>(EMPTY_TEXTS);
  const [statuses, setStatuses] = useState<SectionStatuses>(EMPTY_STATUSES);
  const [sectionErrors, setSectionErrors] = useState<SectionErrors>(EMPTY_ERRORS);
  const [generating, setGenerating] = useState(false);
  const [fmtVersion, setFmtVersion] = useState<number | null>(null);
  const [promptLabels, setPromptLabels] = useState<Partial<Record<EvalSection, string>>>({});

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [manualRows, setManualRows] = useState<ManualKpiRow[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  // 複数月入りExcel（推移データ）からの過去月一括登録
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // ------------------------------------------
  // 初期ロード・履歴取得
  // ------------------------------------------

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Client[]) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]));
  }, []);

  const fetchHistory = useCallback(async (id: string) => {
    if (!id) {
      setHistoryPoints([]);
      return;
    }
    try {
      const res = await fetch(`/api/report-builder/history?client_id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "KPI履歴の取得に失敗しました");
      }
      const data = await res.json();
      setHistoryPoints(Array.isArray(data.points) ? data.points : []);
      setHistoryError(null);
    } catch (err) {
      setHistoryPoints([]);
      setHistoryError(err instanceof Error ? err.message : "KPI履歴の取得に失敗しました");
    }
  }, []);

  useEffect(() => {
    fetchHistory(clientId);
  }, [clientId, fetchHistory]);

  // ------------------------------------------
  // Excel パース
  // ------------------------------------------

  useEffect(() => {
    if (!excelFile) {
      setExcelParsed(null);
      setParseError(null);
      return;
    }
    let cancelled = false;
    setParseLoading(true);
    setParseError(null);

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
        setExcelParsed(data);
        // 対象年月が未入力なら Excel の target_month を初期値に
        if (/^\d{4}\/(0[1-9]|1[0-2])$/.test(data.target_month)) {
          setYearMonth((prev) => prev || data.target_month.replace("/", "-"));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setExcelParsed(null);
          setParseError(err instanceof Error ? err.message : "Excel解析に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) setParseLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [excelFile]);

  // ------------------------------------------
  // 派生データ（当月KPI・表示用履歴・グラフ行）
  // ------------------------------------------

  const targetMonthSlash = yearMonth ? yearMonth.replace("-", "/") : "";

  const currentKpi: KpiSummary | null = useMemo(
    () => (excelParsed ? excelToKpiSummary(excelParsed) : null),
    [excelParsed]
  );

  // 蓄積済み履歴に「作成中の当月（Excel由来）」を重ねた表示用ポイント
  const displayPoints: KpiHistoryPoint[] = useMemo(() => {
    if (!currentKpi || !targetMonthSlash) return historyPoints;
    const merged = historyPoints.filter((p) => p.year_month !== targetMonthSlash);
    merged.push({
      year_month: targetMonthSlash,
      kpi: currentKpi as unknown as Record<string, unknown>,
      has_report: false,
    });
    return merged.sort((a, b) => a.year_month.localeCompare(b.year_month));
  }, [historyPoints, currentKpi, targetMonthSlash]);

  const trendRows = useMemo(
    () => buildTrendRows(displayPoints, [...TREND_KPI_KEYS]),
    [displayPoints]
  );

  // Excel の推移データに含まれる過去月（当月を除く）の一括登録用エントリ
  const pastTrendEntries = useMemo(
    () =>
      excelParsed
        ? monthlyTrendsToManualEntries(excelParsed.monthly_trends, targetMonthSlash)
        : [],
    [excelParsed, targetMonthSlash]
  );

  // ------------------------------------------
  // AI考察生成（4セクション順次・エラー時はスキップして次へ）
  // ------------------------------------------

  const canGenerate =
    !generating && clientId !== "" && yearMonth !== "" && excelParsed !== null;

  async function handleGenerate() {
    if (!canGenerate || !excelParsed) return;
    setGenerating(true);
    setSaveMessage(null);
    setStatuses({ summary: "waiting", follower: "waiting", reach: "waiting", account: "waiting" });
    setSectionErrors(EMPTY_ERRORS);

    const accumulated: string[] = [];

    for (const section of SECTION_ORDER) {
      setStatuses((prev) => ({ ...prev, [section]: "generating" }));
      try {
        const res = await fetch("/api/report-builder/generate-section", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section,
            client_id: clientId,
            year_month: yearMonth,
            excel_parsed: excelParsed,
            operator_memo: operatorMemo,
            previous_sections: accumulated.join("\n\n"),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "生成に失敗しました" }));
          throw new Error(body.error ?? "生成に失敗しました");
        }
        const data = await res.json();
        const text: string = data.generated_text ?? "";
        setTexts((prev) => ({ ...prev, [section]: text }));
        setFmtVersion(typeof data.fmt_version === "number" ? data.fmt_version : null);
        setPromptLabels((prev) => ({ ...prev, [section]: data.prompt_version_label }));
        accumulated.push(`## ${SECTION_LABELS[section]}\n${text}`);
        setStatuses((prev) => ({ ...prev, [section]: "done" }));
      } catch (err) {
        // エラー時は該当セクションをスキップして次へ進む
        setStatuses((prev) => ({ ...prev, [section]: "error" }));
        setSectionErrors((prev) => ({
          ...prev,
          [section]: err instanceof Error ? err.message : "生成エラー",
        }));
      }
    }

    setGenerating(false);
  }

  // ------------------------------------------
  // 保存（knowledge_base へ UPSERT）
  // ------------------------------------------

  const reportText = useMemo(
    () =>
      SECTION_ORDER.filter((s) => texts[s].trim())
        .map((s) => `## ${SECTION_LABELS[s]}\n${texts[s].trim()}`)
        .join("\n\n"),
    [texts]
  );

  const canSave =
    !saving && !generating && clientId !== "" && targetMonthSlash !== "" && reportText !== "";

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      // fmt_version が未取得（生成せず手書きだけの場合等）はアクティブFMTから取得
      let fv = fmtVersion;
      if (fv == null) {
        const res = await fetch("/api/master-fmt");
        const fmt = res.ok ? await res.json() : null;
        fv = typeof fmt?.version === "number" ? fmt.version : 1;
      }

      const res = await fetch("/api/report-builder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          client_id: clientId,
          year_month: targetMonthSlash,
          fmt_version: fv,
          kpi_summary: currentKpi ?? {},
          top_posts: excelParsed
            ? {
                feed_ranking: excelParsed.feed_ranking,
                reel_ranking: excelParsed.reel_ranking,
              }
            : {},
          excel_parsed: excelParsed ?? {},
          report_text: reportText,
        }),
      });
      if (!res.ok) {
        if (res.status === 401) clearAppPassword();
        const body = await res.json().catch(() => ({ error: "保存に失敗しました" }));
        throw new Error(body.error ?? "保存に失敗しました");
      }
      const data = await res.json();
      setSaveMessage(
        data.replaced
          ? `保存しました（${targetMonthSlash} の既存レコード${data.deleted_count}件を置き換え）`
          : `保存しました（${targetMonthSlash} 新規）`
      );
      await fetchHistory(clientId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------
  // 過去月数値の手打ち保存（kpi_summary へマージ → 推移グラフに反映）
  // ------------------------------------------

  async function handleManualSave() {
    if (manualSaving || !clientId) return;
    setManualError(null);
    setManualMessage(null);

    const converted = manualRowsToEntries(manualRows);
    if ("error" in converted) {
      setManualError(converted.error);
      return;
    }
    if (converted.entries.length === 0) {
      setManualError("保存する数値がありません");
      return;
    }

    setManualSaving(true);
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
      setManualMessage(`保存しました（新規${created}件 / 更新${updated}件）`);
      setManualRows([]);
      await fetchHistory(clientId);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "保存中にエラーが発生しました");
    } finally {
      setManualSaving(false);
    }
  }

  // ------------------------------------------
  // 過去月の一括登録（複数月入りExcelの monthly_trends → 月別 kpi_summary）
  // ------------------------------------------

  async function handleBulkImport() {
    if (bulkSaving || !clientId || pastTrendEntries.length === 0) return;
    setBulkError(null);
    setBulkMessage(null);
    setBulkSaving(true);
    try {
      const res = await fetch("/api/report-builder/manual-kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ client_id: clientId, entries: pastTrendEntries }),
      });
      if (!res.ok) {
        if (res.status === 401) clearAppPassword();
        const body = await res.json().catch(() => ({ error: "一括登録に失敗しました" }));
        throw new Error(body.error ?? "一括登録に失敗しました");
      }
      const data = await res.json();
      const updated = (data.results ?? []).filter(
        (r: { action: string }) => r.action === "updated"
      ).length;
      const created = (data.results ?? []).filter(
        (r: { action: string }) => r.action === "created"
      ).length;
      setBulkMessage(`過去月を一括登録しました（新規${created}件 / 更新${updated}件）`);
      await fetchHistory(clientId);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "一括登録中にエラーが発生しました");
    } finally {
      setBulkSaving(false);
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  // ------------------------------------------
  // 描画
  // ------------------------------------------

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin/eval" className="text-sm text-blue-600 hover:text-blue-800">
            ← /admin/eval
          </Link>
          <h1 className="text-lg font-bold text-gray-900">レポート作成（アプリ内完結版）</h1>
          <span className="text-xs text-gray-400">Phase 4a</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        {/* 入力フォーム */}
        <section className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                クライアント
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">
                対象年月
              </label>
              <input
                type="month"
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              当月Excelファイル（数値データ）
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            />
            {parseLoading && (
              <p className="text-xs text-gray-500 mt-1">Excel を解析中...</p>
            )}
            {parseError && (
              <p className="text-xs text-red-600 mt-1">Excel解析エラー: {parseError}</p>
            )}
            {excelParsed && !parseLoading && (
              <p className="text-xs text-emerald-600 mt-1">
                ✅ 解析完了（target_month: {excelParsed.target_month} / フィード
                {excelParsed.feed_posts.length}件 / リール{excelParsed.reel_posts.length}件）
              </p>
            )}

            {/* 複数月入りExcel: 過去月の一括登録 */}
            {excelParsed && !parseLoading && pastTrendEntries.length > 0 && (
              <div className="mt-2 border border-blue-200 rounded-lg bg-blue-50/50 p-3 space-y-2">
                <p className="text-xs text-blue-900 font-medium">
                  📊 推移データに過去{pastTrendEntries.length}ヶ月分（
                  {pastTrendEntries[0].year_month}〜
                  {pastTrendEntries[pastTrendEntries.length - 1].year_month}
                  ）の数値が含まれています
                </p>
                <p className="text-[11px] text-blue-800">
                  一括登録すると月別レコードとして保存され、KPI推移表・推移グラフに反映されます。
                  既に存在する月は推移用12項目だけが上書きされます（考察テキスト等は変更されません）
                </p>
                <details>
                  <summary className="text-[11px] text-blue-800 cursor-pointer hover:underline">
                    登録される内容を確認する
                  </summary>
                  <div className="mt-1 overflow-x-auto bg-white border rounded">
                    <table className="text-[11px] w-full whitespace-nowrap">
                      <thead>
                        <tr className="border-b bg-gray-50 text-gray-600">
                          <th className="text-left py-1 px-2 font-medium">年月</th>
                          <th className="text-right py-1 px-2 font-medium">フォロワー</th>
                          <th className="text-right py-1 px-2 font-medium">ビュー</th>
                          <th className="text-right py-1 px-2 font-medium">リーチ</th>
                          <th className="text-right py-1 px-2 font-medium">ENG</th>
                          <th className="text-right py-1 px-2 font-medium">プロフアクセス</th>
                          <th className="text-right py-1 px-2 font-medium">リンククリック</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pastTrendEntries.map((e) => (
                          <tr key={e.year_month} className="border-b last:border-b-0">
                            <td className="py-1 px-2">{e.year_month}</td>
                            <td className="py-1 px-2 text-right">
                              {(e.values.follower ?? 0).toLocaleString()}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {(e.values.view ?? 0).toLocaleString()}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {(e.values.reach ?? 0).toLocaleString()}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {(e.values.engagement ?? 0).toLocaleString()}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {(e.values.profile_access ?? 0).toLocaleString()}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {(e.values.link_clicks ?? 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBulkImport}
                    disabled={bulkSaving || !clientId}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium ${
                      !bulkSaving && clientId
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {bulkSaving ? "登録中..." : `過去${pastTrendEntries.length}ヶ月分を一括登録`}
                  </button>
                  {!clientId && (
                    <p className="text-[11px] text-amber-700">クライアントを選択してください</p>
                  )}
                  {bulkMessage && (
                    <p className="text-xs text-emerald-700">✅ {bulkMessage}</p>
                  )}
                  {bulkError && <p className="text-xs text-red-600">⚠ {bulkError}</p>}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              担当者メモ（任意・AI考察の参考情報）
            </label>
            <textarea
              value={operatorMemo}
              onChange={(e) => setOperatorMemo(e.target.value)}
              rows={2}
              placeholder="今月の施策・現場の感覚値など"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`px-5 py-2 rounded-lg text-sm font-medium ${
                canGenerate
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {generating ? "考察を生成中..." : "考察を生成"}
            </button>
            <div className="flex flex-wrap gap-2 text-xs">
              {SECTION_ORDER.map((s) => {
                const st = statuses[s];
                return (
                  <span
                    key={s}
                    className={`px-2 py-1 rounded-full ${
                      st === "done"
                        ? "bg-green-100 text-green-800"
                        : st === "generating"
                        ? "bg-blue-100 text-blue-800 animate-pulse"
                        : st === "error"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {SECTION_LABELS[s]}
                    {promptLabels[s] ? `（${promptLabels[s]}）` : ""}
                  </span>
                );
              })}
            </div>
          </div>
          {historyError && (
            <p className="text-xs text-amber-700">⚠ {historyError}</p>
          )}
        </section>

        {/* レポート本体（Notion FMT準拠の4セクション） */}
        {clientId && (
          <>
            <SectionCard
              title={SECTION_TITLES.summary}
              status={statuses.summary}
              text={texts.summary}
              onTextChange={(next) => setTexts((prev) => ({ ...prev, summary: next }))}
              errorMessage={sectionErrors.summary}
            >
              <SummarySection points={displayPoints} targetMonth={targetMonthSlash} />
            </SectionCard>

            <SectionCard
              title={SECTION_TITLES.follower}
              status={statuses.follower}
              text={texts.follower}
              onTextChange={(next) => setTexts((prev) => ({ ...prev, follower: next }))}
              errorMessage={sectionErrors.follower}
            >
              <FollowerSection rows={trendRows} currentKpi={currentKpi} />
            </SectionCard>

            <SectionCard
              title={SECTION_TITLES.reach}
              status={statuses.reach}
              text={texts.reach}
              onTextChange={(next) => setTexts((prev) => ({ ...prev, reach: next }))}
              errorMessage={sectionErrors.reach}
            >
              <ReachSection rows={trendRows} excel={excelParsed} />
            </SectionCard>

            <SectionCard
              title={SECTION_TITLES.account}
              status={statuses.account}
              text={texts.account}
              onTextChange={(next) => setTexts((prev) => ({ ...prev, account: next }))}
              errorMessage={sectionErrors.account}
            >
              <AccountSection rows={trendRows} currentKpi={currentKpi} />
            </SectionCard>

            {/* 保存 */}
            <section className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-xs text-gray-500 space-y-1">
                  <p>
                    保存先: knowledge_base（{selectedClient?.name ?? "クライアント未選択"} /{" "}
                    {targetMonthSlash || "年月未指定"}）
                  </p>
                  <p>
                    同じクライアント・年月の既存レコードは置き換えられます（重複INSERTなし）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className={`px-5 py-2 rounded-lg text-sm font-medium ${
                    canSave
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-gray-300 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {saving ? "保存中..." : "レポートを保存"}
                </button>
              </div>
              {saveMessage && (
                <p className="text-xs text-emerald-700 mt-2">✅ {saveMessage}</p>
              )}
              {saveError && (
                <p className="text-xs text-red-600 mt-2">⚠ {saveError}</p>
              )}
            </section>

            {/* 過去月数値の手打ち入力 */}
            <section className="bg-white rounded-xl shadow-sm border">
              <details>
                <summary className="px-6 py-4 text-sm font-bold text-gray-900 cursor-pointer hover:bg-gray-50 rounded-xl">
                  過去月数値の手打ち入力（推移グラフ用・任意）
                </summary>
                <div className="px-6 pb-6 space-y-3">
                  <p className="text-xs text-gray-500">
                    knowledge_base に無い過去月の数値や、当月数値の修正を入力できます。
                    入力した項目だけが kpi_summary にマージ保存され、推移グラフ・KPI推移表に反映されます
                  </p>
                  <ManualKpiEditor
                    rows={manualRows}
                    onChange={setManualRows}
                    disabled={manualSaving}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleManualSave}
                      disabled={manualSaving || manualRows.length === 0}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${
                        !manualSaving && manualRows.length > 0
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      {manualSaving ? "保存中..." : "数値を保存"}
                    </button>
                    {manualMessage && (
                      <p className="text-xs text-emerald-700">✅ {manualMessage}</p>
                    )}
                    {manualError && (
                      <p className="text-xs text-red-600">⚠ {manualError}</p>
                    )}
                  </div>
                </div>
              </details>
            </section>
          </>
        )}

        {!clientId && (
          <p className="text-center text-sm text-gray-400 py-12">
            クライアントを選択するとレポートセクションが表示されます
          </p>
        )}
      </div>
    </main>
  );
}
