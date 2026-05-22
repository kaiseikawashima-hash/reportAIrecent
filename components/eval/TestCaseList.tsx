"use client";

import type { EvalTestCase } from "@/lib/eval/types";

interface Props {
  testCases: EvalTestCase[];
  onEdit: (tc: EvalTestCase) => void;
  onDelete: (tc: EvalTestCase) => void;
}

function hasReferenceText(tc: EvalTestCase): boolean {
  return !!(
    tc.reference_report_text ||
    tc.reference_summary ||
    tc.reference_follower ||
    tc.reference_reach ||
    tc.reference_account
  );
}

export function TestCaseList({ testCases, onEdit, onDelete }: Props) {
  if (testCases.length === 0) {
    return (
      <p className="text-center text-gray-400 py-12 text-sm">
        登録されているテストケースはありません
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {testCases.map((tc) => (
        <Card key={tc.id} testCase={tc} onEdit={() => onEdit(tc)} onDelete={() => onDelete(tc)} />
      ))}
    </div>
  );
}

function Card({
  testCase: tc,
  onEdit,
  onDelete,
}: {
  testCase: EvalTestCase;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2 gap-2">
        <h3 className="font-bold text-sm text-gray-900 break-all">{tc.name}</h3>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50"
          >
            編集
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1 border border-red-500 text-red-500 rounded hover:bg-red-50"
          >
            削除
          </button>
        </div>
      </div>
      <dl className="text-xs text-gray-600 space-y-1">
        <div className="flex gap-2">
          <dt className="text-gray-400 w-24 shrink-0">クライアント</dt>
          <dd className="truncate">{tc.client?.name ?? "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 w-24 shrink-0">対象月</dt>
          <dd>{tc.target_month}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 w-24 shrink-0">正解レポート</dt>
          <dd>
            {hasReferenceText(tc) ? (
              <span className="text-green-700">
                あり{tc.reference_author ? ` (${tc.reference_author})` : ""}
              </span>
            ) : (
              <span className="text-gray-400">未登録</span>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 w-24 shrink-0">作成日</dt>
          <dd>{new Date(tc.created_at).toLocaleString("ja-JP")}</dd>
        </div>
      </dl>
    </div>
  );
}
