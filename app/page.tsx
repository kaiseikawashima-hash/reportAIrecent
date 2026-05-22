import Link from "next/link";
import ReportGenerator from "@/components/ReportGenerator";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">
            SNSレポート生成
          </h1>
          <Link
            href="/admin"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            管理画面
          </Link>
        </div>
      </header>
      <div className="py-8 px-4">
        <ReportGenerator />
      </div>
    </main>
  );
}
