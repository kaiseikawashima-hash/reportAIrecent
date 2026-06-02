"use client";

// ==========================================
// Phase 4a: レポートセクションの共通枠
// 「数値・グラフ（自動）」+「考察テキスト（AI生成・編集可）」+ コピーボタン
// ==========================================

import { useState } from "react";

export type SectionGenStatus = "idle" | "waiting" | "generating" | "done" | "error";

const STATUS_BADGE: Record<SectionGenStatus, { label: string; className: string }> = {
  idle: { label: "未生成", className: "bg-gray-100 text-gray-500" },
  waiting: { label: "待機中", className: "bg-gray-100 text-gray-500" },
  generating: { label: "生成中...", className: "bg-blue-100 text-blue-800 animate-pulse" },
  done: { label: "生成済み", className: "bg-green-100 text-green-800" },
  error: { label: "エラー", className: "bg-red-100 text-red-800" },
};

interface SectionCardProps {
  title: string;
  status: SectionGenStatus;
  text: string;
  onTextChange: (next: string) => void;
  errorMessage?: string | null;
  children?: React.ReactNode;
}

export default function SectionCard({
  title,
  status,
  text,
  onTextChange,
  errorMessage,
  children,
}: SectionCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("コピーに失敗しました");
    }
  }

  const badge = STATUS_BADGE[status];

  return (
    <section className="bg-white rounded-xl shadow-sm border">
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
            {badge.label}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!text.trim()}
            className={`text-xs px-3 py-1 rounded border transition-colors ${
              text.trim()
                ? copied
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-blue-600 text-blue-600 hover:bg-blue-50"
                : "border-gray-200 text-gray-300 cursor-not-allowed"
            }`}
          >
            {copied ? "コピーしました" : "このセクションをコピー"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 数値・グラフ（自動） */}
        {children}

        {/* 考察テキスト（編集可） */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            考察（AI生成・編集可）
          </label>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={10}
            placeholder="「考察を生成」を押すとAIが生成します。生成後は自由に編集できます"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errorMessage && (
            <p className="text-xs text-red-600 mt-1">⚠ {errorMessage}</p>
          )}
        </div>
      </div>
    </section>
  );
}
