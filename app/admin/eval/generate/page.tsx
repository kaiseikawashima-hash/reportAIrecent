"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Client, ExcelParseResult } from "@/lib/types";
import {
  EVAL_SECTIONS,
  SECTION_LABELS,
  type EvalPromptVersion,
  type EvalSection,
} from "@/lib/eval/types";

type PrevReportRef =
  | { referenced: true; knowledge_base_id: string; year_month: string }
  | { referenced: false; reason: string };

type ExpressionRef =
  | {
      referenced: true;
      best_practice_id: string;
      knowledge_base_id: string;
      year_month: string;
    }
  | { referenced: false; reason: string };

interface ReferenceStatus {
  prev_report: PrevReportRef;
  expression_knowledge: ExpressionRef;
}

interface GenerateResponse {
  run_id: string;
  section: EvalSection;
  generated_text: string;
  knowledge_text: string;
  reference_status: ReferenceStatus;
  prev_report_text: string | null;
  expression_knowledge_text: string | null;
  test_case_id: string | null;
  actual_references: Record<string, unknown>;
}

const ENABLED_SECTIONS: EvalSection[] = ["follower"];

export default function EvalGeneratePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [prompts, setPrompts] = useState<EvalPromptVersion[]>([]);

  const [clientId, setClientId] = useState("");
  const [yearMonth, setYearMonth] = useState("");
  const [section, setSection] = useState<EvalSection>("follower");
  const [promptVersionId, setPromptVersionId] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const [previewData, setPreviewData] = useState<ExcelParseResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // 初期データロード
  useEffect(() => {
    let cancelled = false;
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Client[]) => {
        if (!cancelled) setClients(Array.isArray(data) ? data : []);
      });
    fetch("/api/eval/prompts?is_active=all")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: EvalPromptVersion[]) => {
        if (!cancelled) setPrompts(Array.isArray(data) ? data : []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 選択中セクションのプロンプト一覧
  const sectionPrompts = useMemo(
    () =>
      prompts
        .filter((p) => p.section === section)
        .sort((a, b) => {
          // is_active を上に、その後 created_at 降順
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return b.created_at.localeCompare(a.created_at);
        }),
    [prompts, section]
  );

  // セクション変更時にデフォルトのプロンプト（is_active=true）を選択
  useEffect(() => {
    if (sectionPrompts.length === 0) {
      setPromptVersionId("");
      return;
    }
    const activeOne = sectionPrompts.find((p) => p.is_active);
    setPromptVersionId(activeOne?.id ?? sectionPrompts[0].id);
  }, [sectionPrompts]);

  // Excel ファイル選択時にパース結果プレビューを取得
  useEffect(() => {
    if (!excelFile) {
      setPreviewData(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);

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
        if (!cancelled) setPreviewData(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : "Excel解析に失敗しました");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [excelFile]);

  const canSubmit =
    !isSubmitting &&
    clientId !== "" &&
    yearMonth !== "" &&
    promptVersionId !== "" &&
    excelFile !== null &&
    ENABLED_SECTIONS.includes(section);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !excelFile) return;

    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("section", section);
    fd.append("prompt_version_id", promptVersionId);
    fd.append("client_id", clientId);
    fd.append("year_month", yearMonth);
    fd.append("excel_file", excelFile);

    try {
      const res = await fetch("/api/eval/generate-section", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "生成に失敗しました" }));
        throw new Error(body.error ?? "生成に失敗しました");
      }
      const data = (await res.json()) as GenerateResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成中にエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }

  const promptLabel = (p: EvalPromptVersion) => {
    const desc = p.description ? ` — ${p.description}` : "";
    const flag = p.is_active ? "（現在有効）" : "（無効）";
    return `${p.version_label}${flag}${desc}`;
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/admin/eval" className="text-sm text-blue-600 hover:text-blue-800">
            ← /admin/eval
          </Link>
          <h1 className="text-lg font-bold text-gray-900">セクション単体生成（検証）</h1>
        </div>
      </header>

      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        {/* フォーム */}
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* クライアント */}
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

              {/* 年月 */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  対象年月（YYYY-MM）
                </label>
                <input
                  type="month"
                  value={yearMonth}
                  onChange={(e) => setYearMonth(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* セクション */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                セクション
              </label>
              <div className="flex flex-wrap gap-3">
                {EVAL_SECTIONS.map((s) => {
                  const enabled = ENABLED_SECTIONS.includes(s);
                  const checked = section === s;
                  return (
                    <label
                      key={s}
                      className={`flex items-center gap-2 px-3 py-2 rounded border text-sm ${
                        enabled
                          ? "cursor-pointer hover:bg-gray-50 " +
                            (checked ? "border-blue-600 bg-blue-50" : "border-gray-300")
                          : "cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="section"
                        value={s}
                        checked={checked}
                        disabled={!enabled}
                        onChange={() => enabled && setSection(s)}
                      />
                      <span>{SECTION_LABELS[s]}</span>
                      {!enabled && (
                        <span className="text-[10px] text-gray-500">準備中</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* プロンプトバージョン */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                プロンプトバージョン
              </label>
              <select
                value={promptVersionId}
                onChange={(e) => setPromptVersionId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                disabled={sectionPrompts.length === 0}
              >
                {sectionPrompts.length === 0 && (
                  <option value="">このセクションのプロンプトがありません</option>
                )}
                {sectionPrompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {promptLabel(p)}
                  </option>
                ))}
              </select>
            </div>

            {/* Excel アップロード */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Excelファイル（数値データ）
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
              />
              {excelFile && (
                <p className="text-xs text-gray-500 mt-1">
                  選択中: {excelFile.name}（{Math.round(excelFile.size / 1024).toLocaleString()} KB）
                </p>
              )}
            </div>

            {/* Excel パースプレビュー */}
            {(excelFile && (previewLoading || previewData || previewError)) && (
              <ExcelPreview
                loading={previewLoading}
                data={previewData}
                error={previewError}
              />
            )}

            {/* 送信 */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className={`px-5 py-2 rounded-lg text-sm font-medium ${
                  canSubmit
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? "生成中..." : "生成する"}
              </button>
              {error && (
                <p className="text-xs text-red-600 mt-2">エラー: {error}</p>
              )}
            </div>
          </form>
        </section>

        {/* 結果 */}
        {result && (
          <section className="space-y-4">
            {/* 参照状況の注記 */}
            <ReferenceNotice status={result.reference_status} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 生成結果 */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-4 py-2 border-b bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">
                    生成結果（{SECTION_LABELS[result.section]}）
                  </p>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans">
                    {result.generated_text}
                  </pre>
                </div>
              </div>

              {/* 参照したコンテキスト */}
              <div className="bg-white rounded-xl shadow-sm border">
                <div className="px-4 py-2 border-b bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">
                    参照したコンテキスト
                  </p>
                </div>
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  <ReferenceBlock
                    title="直前月の正解レポート"
                    badge={
                      result.reference_status.prev_report.referenced
                        ? `${result.reference_status.prev_report.year_month}`
                        : null
                    }
                    referenced={result.reference_status.prev_report.referenced}
                    reason={
                      !result.reference_status.prev_report.referenced
                        ? result.reference_status.prev_report.reason
                        : null
                    }
                    text={result.prev_report_text}
                  />
                  <ReferenceBlock
                    title="表現/文体ナレッジ（best_practices）"
                    badge={
                      result.reference_status.expression_knowledge.referenced
                        ? `${result.reference_status.expression_knowledge.year_month}`
                        : null
                    }
                    referenced={result.reference_status.expression_knowledge.referenced}
                    reason={
                      !result.reference_status.expression_knowledge.referenced
                        ? result.reference_status.expression_knowledge.reason
                        : null
                    }
                    text={result.expression_knowledge_text}
                  />
                </div>
              </div>
            </div>

            {/* デバッグ情報 */}
            <div className="bg-white rounded-xl shadow-sm border">
              <button
                onClick={() => setDebugOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span>デバッグ情報を見る</span>
                <span className="text-xs text-gray-500">
                  run_id: {result.run_id}
                </span>
                <span>{debugOpen ? "▲" : "▼"}</span>
              </button>
              {debugOpen && (
                <DebugInfo references={result.actual_references} />
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ReferenceNotice({ status }: { status: ReferenceStatus }) {
  const prev = status.prev_report;
  const expression = status.expression_knowledge;

  if (prev.referenced && expression.referenced) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm text-emerald-800">
          ✅ 前月レポート（{prev.year_month}）と表現ナレッジ（{expression.year_month}）を参照しました
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 space-y-1">
      {!prev.referenced && (
        <p className="text-sm text-amber-900">
          ⚠️ 前月レポートを参照していません — {prev.reason}
        </p>
      )}
      {!expression.referenced && (
        <p className="text-sm text-amber-900">
          ⚠️ 表現ナレッジを参照していません — {expression.reason}
        </p>
      )}
    </div>
  );
}

function ReferenceBlock({
  title,
  badge,
  referenced,
  reason,
  text,
}: {
  title: string;
  badge: string | null;
  referenced: boolean;
  reason: string | null;
  text: string | null;
}) {
  return (
    <div className="p-4">
      <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <span>{title}</span>
        {badge && (
          <span className="text-xs text-gray-500 font-normal">（{badge}）</span>
        )}
      </p>
      {referenced && text ? (
        <pre className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans">
          {text}
        </pre>
      ) : (
        <p className="mt-2 text-xs text-amber-700">
          ⚠️ 参照していません{reason ? ` — ${reason}` : ""}
        </p>
      )}
    </div>
  );
}

function DebugInfo({ references }: { references: Record<string, unknown> }) {
  const filledPrompt = typeof references.filled_prompt === "string" ? references.filled_prompt : "";
  const promptTemplate = typeof references.prompt_template === "string" ? references.prompt_template : "";
  const masterFmtVersion =
    typeof references.master_fmt_version === "number"
      ? String(references.master_fmt_version)
      : "?";
  const masterFmtContent =
    typeof references.master_fmt_content === "string" ? references.master_fmt_content : "";
  const knowledgeText =
    typeof references.knowledge_text === "string" ? references.knowledge_text : "";
  const operatorMemo =
    typeof references.operator_memo === "string" ? references.operator_memo : "";

  return (
    <div className="border-t divide-y">
      <DebugBlock title={`master_fmt（version=${masterFmtVersion}）`} content={masterFmtContent} />
      <DebugBlock title="プロンプトテンプレート（未置換）" content={promptTemplate} />
      <DebugBlock title="プレースホルダ置換後の最終プロンプト（Geminiに渡した本文）" content={filledPrompt} highlight />
      <DebugBlock title="knowledge_text（直前月正解レポート）" content={knowledgeText} />
      <DebugBlock title="operator_memo" content={operatorMemo} />
      <DebugBlock
        title="excel_parsed / diff_context / client_info (JSON)"
        content={JSON.stringify(
          {
            client_info: references.client_info,
            diff_context: references.diff_context,
            excel_parsed: references.excel_parsed,
          },
          null,
          2
        )}
      />
    </div>
  );
}

function DebugBlock({
  title,
  content,
  highlight,
}: {
  title: string;
  content: string;
  highlight?: boolean;
}) {
  return (
    <details className={highlight ? "bg-amber-50" : undefined}>
      <summary className="px-4 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
        {title}
      </summary>
      <pre className="px-4 pb-3 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
        {content || "(空)"}
      </pre>
    </details>
  );
}

function ExcelPreview({
  loading,
  data,
  error,
}: {
  loading: boolean;
  data: ExcelParseResult | null;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="border rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-600">
        Excel を解析中...
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-200 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
        Excel解析エラー: {error}
      </div>
    );
  }
  if (!data) return null;

  const targetMonthIsValid = /^\d{4}\/(0[1-9]|1[0-2])$/.test(data.target_month);
  const ageRowsBroken = data.demographics.age_gender.some((a) => /^\d+$/.test(a.age));
  const prefRowsBroken = data.demographics.prefectures.some((p) => /^\d+$/.test(p.name));

  return (
    <div className="border rounded-lg bg-white">
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          読み取った数値の確認表
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className={targetMonthIsValid ? "text-gray-600" : "text-red-600 font-medium"}>
            target_month: {data.target_month || "(空)"}
          </span>
          {(ageRowsBroken || prefRowsBroken) && (
            <span className="text-red-600 font-medium">
              ⚠ ラベル列が連番数字になっています
            </span>
          )}
        </div>
      </div>

      <PreviewSection title={`サマリー`} defaultOpen>
        <SummaryTable summary={data.summary} />
      </PreviewSection>

      <PreviewSection
        title={`月次推移（${data.monthly_trends.length}件）`}
      >
        <MonthlyTrendsTable trends={data.monthly_trends} />
      </PreviewSection>

      <PreviewSection title={`フィードランキング（${Math.min(data.feed_ranking.length, 3)}/${data.feed_ranking.length}件）`}>
        <RankingTable items={data.feed_ranking.slice(0, 3)} />
      </PreviewSection>

      <PreviewSection title={`リールランキング（${Math.min(data.reel_ranking.length, 3)}/${data.reel_ranking.length}件）`}>
        <RankingTable items={data.reel_ranking.slice(0, 3)} />
      </PreviewSection>

      <PreviewSection title={`年齢・性別（${data.demographics.age_gender.length}区分）`}>
        <AgeGenderTable rows={data.demographics.age_gender} />
      </PreviewSection>

      <PreviewSection
        title={`都道府県 TOP10（全${data.demographics.prefectures.length}件）`}
      >
        <RegionTable rows={data.demographics.prefectures.slice(0, 10)} />
      </PreviewSection>
    </div>
  );
}

function PreviewSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="border-t" open={defaultOpen}>
      <summary className="px-4 py-2 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
        {title}
      </summary>
      <div className="px-4 py-2 overflow-x-auto">{children}</div>
    </details>
  );
}

function SummaryTable({ summary }: { summary: ExcelParseResult["summary"] }) {
  const rows: Array<[string, number]> = [
    ["フォロワー", summary.follower],
    ["表示 (view)", summary.view],
    ["リーチ", summary.reach],
    ["エンゲージメント", summary.engagement],
    ["投稿数", summary.post_count],
  ];
  return (
    <table className="text-xs w-full">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b last:border-b-0">
            <th className="text-left text-gray-600 py-1 pr-4 font-normal w-40">{label}</th>
            <td className="py-1 text-gray-900">{value.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MonthlyTrendsTable({ trends }: { trends: ExcelParseResult["monthly_trends"] }) {
  if (trends.length === 0) {
    return <p className="text-xs text-gray-500 py-2">推移データがありません</p>;
  }
  return (
    <table className="text-xs w-full">
      <thead>
        <tr className="border-b text-gray-600">
          <th className="text-left py-1 pr-2 font-medium">年月</th>
          <th className="text-right py-1 px-2 font-medium">フォロワー</th>
          <th className="text-right py-1 px-2 font-medium">表示計</th>
          <th className="text-right py-1 px-2 font-medium">リール表示</th>
          <th className="text-right py-1 px-2 font-medium">フィード表示</th>
          <th className="text-right py-1 px-2 font-medium">リーチ</th>
          <th className="text-right py-1 pl-2 font-medium">エンゲージ</th>
        </tr>
      </thead>
      <tbody>
        {trends.map((t, i) => (
          <tr key={i} className="border-b last:border-b-0">
            <td className="py-1 pr-2 text-gray-900">{t.year_month}</td>
            <td className="py-1 px-2 text-right">{t.follower.toLocaleString()}</td>
            <td className="py-1 px-2 text-right">{t.view_total.toLocaleString()}</td>
            <td className="py-1 px-2 text-right">{t.view_reel.toLocaleString()}</td>
            <td className="py-1 px-2 text-right">{t.view_feed.toLocaleString()}</td>
            <td className="py-1 px-2 text-right">{t.reach_total.toLocaleString()}</td>
            <td className="py-1 pl-2 text-right">{t.engagement_total.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RankingTable({ items }: { items: ExcelParseResult["feed_ranking"] }) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-500 py-2">データなし</p>;
  }
  return (
    <table className="text-xs w-full">
      <thead>
        <tr className="border-b text-gray-600">
          <th className="text-left py-1 pr-2 font-medium w-8">#</th>
          <th className="text-left py-1 px-2 font-medium">タイトル</th>
          <th className="text-right py-1 px-2 font-medium">リーチ</th>
          <th className="text-right py-1 px-2 font-medium">エンゲージ</th>
          <th className="text-right py-1 pl-2 font-medium">エンゲ率</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p, i) => (
          <tr key={i} className="border-b last:border-b-0">
            <td className="py-1 pr-2">{p.rank}</td>
            <td className="py-1 px-2 text-gray-900 max-w-[280px] truncate" title={p.title}>
              {p.title || p.url || "(空)"}
            </td>
            <td className="py-1 px-2 text-right">{p.reach.toLocaleString()}</td>
            <td className="py-1 px-2 text-right">{p.engagement.toLocaleString()}</td>
            <td className="py-1 pl-2 text-right">{p.eng_rate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AgeGenderTable({ rows }: { rows: ExcelParseResult["demographics"]["age_gender"] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500 py-2">データなし</p>;
  }
  return (
    <table className="text-xs w-full">
      <thead>
        <tr className="border-b text-gray-600">
          <th className="text-left py-1 pr-2 font-medium">区分</th>
          <th className="text-right py-1 px-2 font-medium">男性</th>
          <th className="text-right py-1 px-2 font-medium">女性</th>
          <th className="text-right py-1 pl-2 font-medium">合計</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const broken = /^\d+$/.test(r.age);
          return (
            <tr key={i} className="border-b last:border-b-0">
              <td className={`py-1 pr-2 ${broken ? "text-red-600 font-medium" : "text-gray-900"}`}>
                {r.age}
              </td>
              <td className="py-1 px-2 text-right">{r.male.toLocaleString()}</td>
              <td className="py-1 px-2 text-right">{r.female.toLocaleString()}</td>
              <td className="py-1 pl-2 text-right">{r.total.toLocaleString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RegionTable({ rows }: { rows: ExcelParseResult["demographics"]["prefectures"] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500 py-2">データなし</p>;
  }
  return (
    <table className="text-xs w-full">
      <thead>
        <tr className="border-b text-gray-600">
          <th className="text-left py-1 pr-2 font-medium w-8">#</th>
          <th className="text-left py-1 px-2 font-medium">名称</th>
          <th className="text-right py-1 px-2 font-medium">値</th>
          <th className="text-right py-1 pl-2 font-medium">割合</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const broken = /^\d+$/.test(r.name);
          return (
            <tr key={i} className="border-b last:border-b-0">
              <td className="py-1 pr-2 text-gray-600">{i + 1}</td>
              <td className={`py-1 px-2 ${broken ? "text-red-600 font-medium" : "text-gray-900"}`}>
                {r.name}
              </td>
              <td className="py-1 px-2 text-right">{r.value.toLocaleString()}</td>
              <td className="py-1 pl-2 text-right">{r.ratio}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
