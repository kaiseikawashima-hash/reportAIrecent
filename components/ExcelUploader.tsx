"use client";

import { useRef } from "react";

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export default function ExcelUploader({ file, onFileChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected && !selected.name.match(/\.xlsx?$/i)) {
      alert("Excelファイル(.xlsx/.xls)を選択してください");
      return;
    }
    onFileChange(selected);
  }

  function handleClear() {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Excelファイル
      </label>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {file && (
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-red-500 hover:text-red-700 whitespace-nowrap"
          >
            クリア
          </button>
        )}
      </div>
      {file && (
        <p className="mt-1 text-xs text-gray-500">{file.name}</p>
      )}
    </div>
  );
}
