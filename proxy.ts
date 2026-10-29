// 보안 점검 높음 1·2번 — 사이트 전체 잠금 (Basic 인증). 모든 화면과 API 요청 전에 비밀번호를 확인한다.
// 비밀번호는 환경변수 SITE_PASSWORD(아이디는 SITE_USER, 없으면 "admin")에 둔다. 코드에는 적지 않는다.
// 배포(production)에서 SITE_PASSWORD가 없으면 열어 두지 않고 막는다. 개발 중(npm run dev)에는 없어도 열린다.

import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("사이트 비밀번호(SITE_PASSWORD)가 설정되지 않아 열 수 없습니다.", { status: 503 });
  }

  const user = process.env.SITE_USER || "admin";
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = safeDecode(header.slice(6));
    const sep = decoded.indexOf(":");
    if (sep >= 0 && equal(decoded.slice(0, sep), user) && equal(decoded.slice(sep + 1), password)) return NextResponse.next();
  }
  return new NextResponse("로그인이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="allocation-tool", charset="UTF-8"' },
  });
}

/** 글자 수가 같을 때 모든 글자를 끝까지 비교한다 (일찍 끝나는 비교로 비밀번호를 추측하지 못하게) */
function equal(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function safeDecode(base64: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

export const config = {
  // 정적 파일을 빼고 모든 화면·API에 적용
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
