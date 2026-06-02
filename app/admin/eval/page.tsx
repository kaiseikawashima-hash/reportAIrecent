"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Counts {
  testCases: number | null;
  prompts: number | null;
}

export default function EvalTopPage() {
  const [testCaseCount, setTestCaseCount] = useState<number | null>(null);
  const [promptCount, setPromptCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/eval/test-cases")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown[]) => {
        if (!cancelled) setTestCaseCount(Array.isArray(data) ? data.length : 0);
      });
    fetch("/api/eval/prompts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown[]) => {
        if (!cancelled) setPromptCount(Array.isArray(data) ? data.length : 0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts: Counts = { testCases: testCaseCount, prompts: promptCount };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">レポートAI 検証機能</h1>
          <div className="flex gap-4">
            <Link href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
              ← 管理画面
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
        <Link
          href="/admin/eval/report"
          className="block bg-white rounded-xl shadow-sm border-2 border-emerald-300 p-6 hover:shadow-md hover:border-emerald-500 transition-all"
        >
          <div className="flex items-start justify-between mb-2">
            <h2 className="text-base font-bold text-gray-900">
              レポート作成（アプリ内完結版）
            </h2>
            <span className="text-xs text-emerald-700 font-medium">Phase 4a →</span>
          </div>
          <p className="text-xs text-gray-600">
            Excelアップロード → 数値・グラフ自動描画 + AI考察（編集・保存可）
          </p>
        </Link>

        <Link
          href="/admin/eval/generate"
          className="block bg-white rounded-xl shadow-sm border-2 border-blue-300 p-6 hover:shadow-md hover:border-blue-500 transition-all"
        >
          <div className="flex items-start justify-between mb-2">
            <h2 className="text-base font-bold text-gray-900">セクション単体生成</h2>
            <span className="text-xs text-blue-700 font-medium">メイン導線 →</span>
          </div>
          <p className="text-xs text-gray-600">
            指定したプロンプトで部分生成し、正解レポートと比較する
          </p>
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NavCard
            href="/admin/eval/test-cases"
            title="テストケース管理"
            count={counts.testCases}
            countLabel="件登録済み"
            description="クライアント×対象月×Excel×正解レポートの組み合わせを管理します"
          />
          <NavCard
            href="/admin/eval/prompts"
            title="プロンプト管理"
            count={counts.prompts}
            countLabel="件登録済み"
            description="セクション別にプロンプトのバージョンを管理します"
          />
        </div>
      </div>
    </main>
  );
}

function NavCard({
  href,
  title,
  count,
  countLabel,
  description,
}: {
  href: string;
  title: string;
  count: number | null;
  countLabel: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl shadow-sm border p-6 hover:shadow-md hover:border-blue-300 transition-all"
    >
      <div className="flex items-start justify-between mb-2">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">
          {count === null ? "..." : `${count}${countLabel}`}
        </span>
      </div>
      <p className="text-xs text-gray-600">{description}</p>
    </Link>
  );
}
