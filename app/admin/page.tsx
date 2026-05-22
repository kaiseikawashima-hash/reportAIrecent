"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Client, ClientPlan, MasterFmt } from "@/lib/types";

interface ClientForm {
  name: string;
  area: string;
  hp_url: string;
  operator_memo: string;
  auto_memo: string;
  plan: ClientPlan;
}

const EMPTY_FORM: ClientForm = {
  name: "",
  area: "",
  hp_url: "",
  operator_memo: "",
  auto_memo: "",
  plan: "advance",
};

type ModalMode = { kind: "create" } | { kind: "edit"; id: string } | null;

export default function AdminPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [modal, setModal] = useState<ModalMode>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [fmt, setFmt] = useState<MasterFmt | null>(null);
  const [fmtContent, setFmtContent] = useState("");
  const [fmtSaving, setFmtSaving] = useState(false);

  useEffect(() => {
    fetchClients();
    fetchFmt();
  }, []);

  async function fetchClients() {
    const res = await fetch("/api/clients");
    if (res.ok) setClients(await res.json());
  }

  async function fetchFmt() {
    const res = await fetch("/api/master-fmt");
    if (res.ok) {
      const data = await res.json();
      if (data) {
        setFmt(data);
        setFmtContent(data.content);
      }
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setGenerateError(null);
    setModal({ kind: "create" });
  }

  function openEdit(client: Client) {
    setForm({
      name: client.name,
      area: client.area ?? "",
      hp_url: client.hp_url ?? "",
      operator_memo: client.operator_memo ?? "",
      auto_memo: client.auto_memo ?? "",
      plan: client.plan ?? "advance",
    });
    setGenerateError(null);
    setModal({ kind: "edit", id: client.id });
  }

  function closeModal() {
    if (saving || generating) return;
    setModal(null);
  }

  async function handleSave() {
    if (!modal || !form.name.trim()) return;
    setSaving(true);
    try {
      if (modal.kind === "create") {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          await fetchClients();
          setModal(null);
        }
      } else {
        const res = await fetch("/api/clients", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: modal.id, ...form }),
        });
        if (res.ok) {
          await fetchClients();
          setModal(null);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAutoMemo() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/scrape-hp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          area: form.area,
          hp_url: form.hp_url,
          operator_memo: form.operator_memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "生成に失敗しました");
        return;
      }
      setForm((prev) => ({ ...prev, auto_memo: data.auto_memo ?? "" }));
      if (data.hp_error) {
        setGenerateError(`HP取得に失敗（${data.hp_error}）。担当者メモから推測しました`);
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : "生成エラー");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveFmt() {
    setFmtSaving(true);
    const res = await fetch("/api/master-fmt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: fmtContent }),
    });
    if (res.ok) {
      await fetchFmt();
    }
    setFmtSaving(false);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">管理画面</h1>
          <div className="flex gap-4">
            <Link href="/admin/knowledge" className="text-sm text-blue-600 hover:text-blue-800">
              ナレッジDB
            </Link>
            <Link href="/admin/eval" className="text-sm text-blue-600 hover:text-blue-800">
              検証
            </Link>
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
              レポート生成
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto py-8 px-4 space-y-8">
        {/* クライアント一覧 */}
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">クライアント管理</h2>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              + 新規クライアント
            </button>
          </div>

          {clients.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">
              クライアントが登録されていません
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clients.map((c) => (
                <ClientCard key={c.id} client={c} onEdit={() => openEdit(c)} />
              ))}
            </div>
          )}
        </section>

        {/* マスターFMT編集 */}
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900">マスターFMT</h2>
            {fmt && (
              <span className="text-xs text-gray-500">
                v{fmt.version} / 更新: {new Date(fmt.updated_at).toLocaleString("ja-JP")}
              </span>
            )}
          </div>
          <textarea
            value={fmtContent}
            onChange={(e) => setFmtContent(e.target.value)}
            rows={16}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400">
              保存すると新しいバージョンが作成されます（旧バージョンは非アクティブ化）
            </p>
            <button
              onClick={handleSaveFmt}
              disabled={fmtSaving || !fmtContent}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300"
            >
              {fmtSaving ? "保存中..." : "FMTを保存"}
            </button>
          </div>
        </section>
      </div>

      {modal && (
        <ClientFormModal
          mode={modal.kind}
          form={form}
          setForm={setForm}
          saving={saving}
          generating={generating}
          generateError={generateError}
          onClose={closeModal}
          onSave={handleSave}
          onGenerate={handleGenerateAutoMemo}
        />
      )}
    </main>
  );
}

// ==========================================
// クライアントカード
// ==========================================

function ClientCard({ client, onEdit }: { client: Client; onEdit: () => void }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-gray-900">{client.name}</h3>
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded ${
              client.plan === "advance"
                ? "bg-blue-100 text-blue-700"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {client.plan === "advance" ? "アドバンス" : "スタンダード"}
          </span>
        </div>
        <button
          onClick={onEdit}
          className="text-xs px-3 py-1 border border-blue-600 text-blue-600 rounded hover:bg-blue-50 shrink-0"
        >
          編集
        </button>
      </div>
      <dl className="text-xs text-gray-600 space-y-1">
        <div className="flex gap-2">
          <dt className="text-gray-400 w-16 shrink-0">エリア</dt>
          <dd>{client.area || "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 w-16 shrink-0">HP</dt>
          <dd className="truncate">{client.hp_url || "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 w-16 shrink-0">担当メモ</dt>
          <dd className="line-clamp-2">{client.operator_memo || "-"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-400 w-16 shrink-0">自動メモ</dt>
          <dd className="line-clamp-2 text-gray-500">{client.auto_memo || "(未生成)"}</dd>
        </div>
      </dl>
    </div>
  );
}

// ==========================================
// 編集モーダル
// ==========================================

interface ModalProps {
  mode: "create" | "edit";
  form: ClientForm;
  setForm: (updater: (prev: ClientForm) => ClientForm) => void;
  saving: boolean;
  generating: boolean;
  generateError: string | null;
  onClose: () => void;
  onSave: () => void;
  onGenerate: () => void;
}

function ClientFormModal({
  mode,
  form,
  setForm,
  saving,
  generating,
  generateError,
  onClose,
  onSave,
  onGenerate,
}: ModalProps) {
  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelClass = "block text-xs font-medium text-gray-700 mb-1";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">
            {mode === "create" ? "新規クライアント追加" : "クライアント編集"}
          </h3>
          <button
            onClick={onClose}
            disabled={saving || generating}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>会社名 *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
              placeholder="株式会社〇〇"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>エリア</label>
              <input
                value={form.area}
                onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                className={inputClass}
                placeholder="東京都渋谷区"
              />
            </div>
            <div>
              <label className={labelClass}>プラン</label>
              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="modal-plan"
                    value="advance"
                    checked={form.plan === "advance"}
                    onChange={() => setForm((f) => ({ ...f, plan: "advance" }))}
                  />
                  アドバンス
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="modal-plan"
                    value="standard"
                    checked={form.plan === "standard"}
                    onChange={() => setForm((f) => ({ ...f, plan: "standard" }))}
                  />
                  スタンダード
                </label>
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>HP URL</label>
            <input
              value={form.hp_url}
              onChange={(e) => setForm((f) => ({ ...f, hp_url: e.target.value }))}
              className={inputClass}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className={labelClass}>担当者メモ</label>
            <textarea
              value={form.operator_memo}
              onChange={(e) => setForm((f) => ({ ...f, operator_memo: e.target.value }))}
              rows={3}
              className={inputClass}
              placeholder="運用上の感覚値・特徴・注意点など"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass + " mb-0"}>
                自動生成メモ（auto_memo）
              </label>
              <button
                onClick={onGenerate}
                disabled={generating || saving}
                className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300"
              >
                {generating ? "生成中..." : "属性を自動生成"}
              </button>
            </div>
            <textarea
              value={form.auto_memo}
              onChange={(e) => setForm((f) => ({ ...f, auto_memo: e.target.value }))}
              rows={4}
              className={inputClass + " bg-purple-50/30"}
              placeholder="「属性を自動生成」ボタンでHP+担当者メモから生成、または手入力"
            />
            {generating && (
              <p className="mt-1 text-xs text-purple-600 flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                Geminiが生成中です…
              </p>
            )}
            {generateError && (
              <p className="mt-1 text-xs text-amber-600">⚠ {generateError}</p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving || generating}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={onSave}
            disabled={saving || generating || !form.name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
