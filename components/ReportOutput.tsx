"use client";

import { useState } from "react";

interface SectionStatus {
  key: string;
  label: string;
  status: "waiting" | "generating" | "done" | "error";
}

interface Props {
  sections: SectionStatus[];
  reportText: string;
  isComplete: boolean;
}

export default function ReportOutput({ sections, reportText, isComplete }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("コピーに失敗しました");
    }
  }

  return (
    <div className="space-y-4">
      {/* ステータス表示 */}
      <div className="flex flex-wrap gap-3">
        {sections.map((s) => (
          <div
            key={s.key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              s.status === "done"
                ? "bg-green-100 text-green-800"
                : s.status === "generating"
                ? "bg-blue-100 text-blue-800 animate-pulse"
                : s.status === "error"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <span>
              {s.status === "done"
                ? "●"
                : s.status === "generating"
                ? "◎"
                : s.status === "error"
                ? "✕"
                : "○"}
            </span>
            <span>{s.label}</span>
            <span className="text-xs">
              {s.status === "generating"
                ? "生成中..."
                : s.status === "waiting"
                ? "待機中"
                : s.status === "error"
                ? "エラー"
                : "完了"}
            </span>
          </div>
        ))}
      </div>

      {/* レポート表示 */}
      {reportText && (
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <span className="text-sm font-medium text-gray-700">
              生成結果（Markdownプレビュー）
            </span>
            <button
              onClick={handleCopy}
              disabled={!isComplete}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isComplete
                  ? copied
                    ? "bg-green-500 text-white"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {copied ? "コピーしました" : "Markdownをコピー"}
            </button>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 font-sans">
              {reportText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
