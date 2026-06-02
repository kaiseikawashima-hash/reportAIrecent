import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// ==========================================
// 簡易認証ヘルパー
// APP_PASSWORD を x-app-password ヘッダー（または app_password Cookie）と照合する。
// 破壊的・不可逆な操作（DELETE 等）のサーバー側ゲートとして使う。
// クライアント側のUIゲートに依存しないこと。
//
// APP_PASSWORD 未設定時の挙動（fail-open を本番では塞ぐ）:
//   - 開発環境(NODE_ENV !== production): 素通り（ローカル作業の利便性）
//   - 本番: デフォルトで拒否。明示的に ALLOW_UNAUTHENTICATED=1 を
//     設定した場合のみ素通り（オプトイン）。
// ==========================================

const HEADER_NAME = "x-app-password";
const COOKIE_NAME = "app_password";

/**
 * タイミング攻撃を避けるための定数時間比較。
 * 長さが異なる場合も早期 return せず false を返す。
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * APP_PASSWORD 未設定時に素通りを許可してよいか。
 * 本番では ALLOW_UNAUTHENTICATED=1 が明示されている場合のみ true。
 */
function allowUnauthenticated(): boolean {
  if (process.env.ALLOW_UNAUTHENTICATED === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

/**
 * リクエストが APP_PASSWORD による認証を満たしているか検証する。
 * @returns 認証OK（または素通りが許可された環境）なら true
 */
export function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.APP_PASSWORD;

  // 未設定: 本番は拒否（fail-closed）、開発／明示オプトインのみ素通り
  if (!expected) {
    return allowUnauthenticated();
  }

  const fromHeader = request.headers.get(HEADER_NAME);
  if (fromHeader && safeEqual(fromHeader, expected)) {
    return true;
  }

  const fromCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (fromCookie && safeEqual(fromCookie, expected)) {
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
