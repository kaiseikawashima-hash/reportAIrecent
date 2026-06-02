import { NextRequest, NextResponse } from "next/server";

// ==========================================
// 簡易認証ヘルパー
// APP_PASSWORD を x-app-password ヘッダー（または app_password Cookie）と照合する。
// APP_PASSWORD が未設定の環境では従来通り素通り（後方互換）。
// 破壊的・不可逆な操作（DELETE 等）のサーバー側ゲートとして使う。
// クライアント側のUIゲートに依存しないこと。
// ==========================================

const HEADER_NAME = "x-app-password";
const COOKIE_NAME = "app_password";

/**
 * リクエストが APP_PASSWORD による認証を満たしているか検証する。
 * @returns 認証OK（または APP_PASSWORD 未設定）なら true
 */
export function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.APP_PASSWORD;

  // 未設定なら認証無効（後方互換）
  if (!expected) {
    return true;
  }

  const fromHeader = request.headers.get(HEADER_NAME);
  if (fromHeader && fromHeader === expected) {
    return true;
  }

  const fromCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (fromCookie && fromCookie === expected) {
    return true;
  }

  return false;
}

/**
 * 認証失敗時に返す 401 レスポンス。
 */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "認証が必要です（APP_PASSWORD）" },
    { status: 401 }
  );
}
