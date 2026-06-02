"use client";

import { useState, useCallback } from "react";
import ClientSelector from "./ClientSelector";
import ExcelUploader from "./ExcelUploader";
import ScreenshotUploader from "./ScreenshotUploader";
import ReportOutput from "./ReportOutput";
import type { ExcelParseResult } from "@/lib/types";
import { excelToKpiSummary } from "@/lib/excel-to-kpi";

interface SectionStatus {
  key: string;
  label: string;
  status: "waiting" | "generating" | "done" | "error";
}

const INITIAL_SECTIONS: SectionStatus[] = [
  { key: "summary", label: "サマリー", status: "waiting" },
  { key: "follower", label: "フォロワー分析", status: "waiting" },
  { key: "reach", label: "リーチ分析", status: "waiting" },
  { key: "account", label: "アカウント分析", status: "waiting" },
];

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export default function ReportGenerator() {
  const [clientId, setClientId] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [operatorMemo, setOperatorMemo] = useState("");
  const [sections, setSections] = useState<SectionStatus[]>(INITIAL_SECTIONS);
  const [reportText, setReportText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");

  const updateSectionStatus = useCallback(
    (key: string, status: SectionStatus["status"]) => {
      setSections((prev) =>
        prev.map((s) => (s.key === key ? { ...s, status } : s))
      );
    },
    []
  );

  async function handleGenerate() {
    if (!clientId) {
      setError("クライアントを選択してください");
      return;
    }
    if (!excelFile) {
      setError("Excelファイルをアップロードしてください");
      return;
    }

    setError("");
    setReportText("");
    setIsComplete(false);
    setIsGenerating(true);
    setSections(INITIAL_SECTIONS);

    try {
      // Step 1: Excel解析
      const formData = new FormData();
      formData.append("file", excelFile);

      const parseRes = await fetch("/api/parse-excel", {
        method: "POST",
        body: formData,
      });

      if (!parseRes.ok) {
        const err = await parseRes.json();
        throw new Error(err.error || "Excel解析に失敗しました");
      }

      const excelData: ExcelParseResult = await parseRes.json();

      // Step 2: 差分計算（Phase 3.7: knowledge_base 参照型 — client_id + target_month を渡す）
      const diffRes = await fetch("/api/calc-diff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...excelData,
          client_id: clientId,
          target_month_override: excelData.target_month,
        }),
      });

      if (!diffRes.ok) {
        const err = await diffRes.json();
        throw new Error(err.error || "差分計算に失敗しました");
      }

      const diffContext = await diffRes.json();

      // Step 3: ナレッジ参照
      const knowledgeRes = await fetch(
        `/api/knowledge?client_id=${clientId}`
      );
      const knowledgeRefs = knowledgeRes.ok
        ? await knowledgeRes.json()
        : { same_client: [], random_others: [] };

      // Step 4: スクショBase64変換
      const screenshotImages = await Promise.all(
        screenshots.map(fileToBase64)
      );

      // Step 5: レポート生成（ストリーミング）
      const genRes = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          diff_context: diffContext,
          knowledge_refs: knowledgeRefs,
          operator_memo: operatorMemo || undefined,
          excel_raw: excelData,
          screenshot_images:
            screenshotImages.length > 0 ? screenshotImages : undefined,
        }),
      });

      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || "レポート生成に失敗しました");
      }

      // ストリーミング読み取り
      const reader = genRes.body?.getReader();
      if (!reader) throw new Error("ストリームの読み取りに失敗しました");

      const decoder = new TextDecoder();
      let fullText = "";
      let currentSectionIndex = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;

        // セクション状態の更新
        const sectionSignal = chunk.match(/--- (.+?) 生成中 ---/);
        if (sectionSignal) {
          const label = sectionSignal[1];
          const idx = INITIAL_SECTIONS.findIndex((s) => s.label === label);
          if (idx >= 0) {
            // 前のセクションを完了に
            if (currentSectionIndex >= 0) {
              updateSectionStatus(
                INITIAL_SECTIONS[currentSectionIndex].key,
                "done"
              );
            }
            currentSectionIndex = idx;
            updateSectionStatus(INITIAL_SECTIONS[idx].key, "generating");
          }
        }

        if (chunk.includes("--- 生成完了 ---")) {
          if (currentSectionIndex >= 0) {
            updateSectionStatus(
              INITIAL_SECTIONS[currentSectionIndex].key,
              "done"
            );
          }
        }

        // メタデータとシグナル行を除外して表示
        const displayText = fullText
          .replace(/\n--- .+? 生成中 ---\n\n/g, "")
          .replace(/\n--- 生成完了 ---\n/g, "")
          .replace(/\n<!--META:[\s\S]*?:META-->\n/g, "")
          .trim();

        setReportText(displayText);
      }

      // メタデータ抽出してDB保存
      const metaMatch = fullText.match(/<!--META:([\s\S]*?):META-->/);
      if (metaMatch) {
        try {
          const meta = JSON.parse(metaMatch[1]);
          await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: clientId,
              year_month: excelData.target_month,
              fmt_version: meta.fmt_version,
              kpi_summary: excelToKpiSummary(excelData),
              top_posts: {
                feed_ranking: excelData.feed_ranking,
                reel_ranking: excelData.reel_ranking,
              },
              excel_parsed: excelData,
              report_text: meta.full_text,
            }),
          });
        } catch {
          // DB保存失敗は無視（レポート自体は生成済み）
        }
      }

      setIsComplete(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "エラーが発生しました";
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 入力エリア */}
      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
        <ClientSelector value={clientId} onChange={setClientId} />
        <ExcelUploader file={excelFile} onFileChange={setExcelFile} />
        <ScreenshotUploader images={screenshots} onImagesChange={setScreenshots} />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            担当者メモ（任意）
          </label>
          <textarea
            value={operatorMemo}
            onChange={(e) => setOperatorMemo(e.target.value)}
            rows={3}
            placeholder="今月の特記事項や、考察に反映させたいポイントがあれば記入"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-3 rounded-lg text-white font-medium text-sm transition-colors ${
            isGenerating
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {isGenerating ? "生成中..." : "レポートを生成する"}
        </button>
      </div>

      {/* 出力エリア */}
      {(reportText || isGenerating) && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <ReportOutput
            sections={sections}
            reportText={reportText}
            isComplete={isComplete}
          />
        </div>
      )}
    </div>
  );
}
