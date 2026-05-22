"use client";

import { useEffect, useState } from "react";
import type { Client } from "@/lib/types";

interface Props {
  value: string;
  onChange: (clientId: string) => void;
}

export default function ClientSelector({ value, onChange }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch("/api/clients");
        if (res.ok) {
          const data = await res.json();
          setClients(data);
        }
      } catch {
        // エラー時は空リスト
      } finally {
        setLoading(false);
      }
    }
    fetchClients();
  }, []);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        クライアント選択
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
      >
        <option value="">
          {loading ? "読み込み中..." : "クライアントを選択"}
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.area ? `(${c.area})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
