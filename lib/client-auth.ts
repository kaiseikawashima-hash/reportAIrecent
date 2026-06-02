// ==========================================
// クライアント側 認証ヘルパー（ブラウザ専用）
// 破壊的操作を呼ぶ前に APP_PASSWORD を取得し、x-app-password ヘッダーとして送る。
// 初回のみ入力を求め、sessionStorage に保持する（タブを閉じると消える）。
// サーバー側 lib/auth.ts と対になる。サーバー側検証が本体で、これは補助。
// ==========================================

const STORAGE_KEY = "app_password";
const HEADER_NAME = "x-app-password";

/**
 * 保持済みのパスワードを返す。無ければユーザーに入力を求める。
 * 入力がキャンセルされた場合は null。
 */
export function getAppPassword(): string | null {
  if (typeof window === "undefined") return null;

  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  const entered = window.prompt("操作パスワードを入力してください（APP_PASSWORD）");
  if (!entered) return null;

  window.sessionStorage.setItem(STORAGE_KEY, entered);
  return entered;
}

/**
 * 認証ヘッダーを付与したオブジェクトを返す。
 * パスワード未取得なら空オブジェクト（サーバー側が APP_PASSWORD 未設定なら素通り）。
 */
export function authHeaders(): Record<string, string> {
  const pw = getAppPassword();
  return pw ? { [HEADER_NAME]: pw } : {};
}

/**
 * 認証失敗時にパスワードを破棄する（次回再入力させる）。
 */
export function clearAppPassword(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
