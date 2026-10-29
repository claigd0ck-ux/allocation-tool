// Design Ref: §5 마지막 행, PRD 7절 — 보안·비밀 점검을 자동으로 반복한다
// Plan SC: 작업 21 (보안·비밀 점검), 성공 기준 ⑥(비밀 값 커밋 0건)

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

/** app/·lib/ 아래의 모든 코드 파일 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [path] : [];
  });
}
const files = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "lib"))].map((path) => ({
  path: path.slice(ROOT.length + 1).replace(/\\/g, "/"),
  text: readFileSync(path, "utf8"),
}));

const offenders = (pattern: RegExp) => files.filter((f) => pattern.test(f.text)).map((f) => f.path);

describe("보안·비밀 점검", () => {
  it("비밀 값을 브라우저로 보내는 NEXT_PUBLIC_ 환경변수를 쓰지 않는다", () => {
    expect(offenders(/NEXT_PUBLIC_/)).toEqual([]);
  });

  it("환경변수(API 키)는 서버 쪽 코드에서만 읽는다 — 화면 코드('use client')에서 읽지 않는다", () => {
    const clientFiles = files.filter((f) => /^["']use client["']/m.test(f.text));
    expect(clientFiles.filter((f) => /process\.env/.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it("업로드 파일·계산 결과를 서버 디스크에 쓰지 않는다", () => {
    expect(offenders(/\b(writeFile|writeFileSync|appendFile|createWriteStream)\b/)).toEqual([]);
  });

  it("자료 내용을 서버 로그에 남기지 않는다", () => {
    expect(offenders(/console\.(log|info|debug|warn|error)\(/)).toEqual([]);
  });

  it("데이터베이스를 쓰지 않는다 (PRD 비범위)", () => {
    expect(offenders(/@supabase|prisma|mongoose|pg\b|mysql/)).toEqual([]);
  });

  it(".env·node_modules가 .gitignore에 있고, .env가 git에 올라간 적이 없다", () => {
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\.env\*$/m);
    expect(ignore).toMatch(/^\/node_modules$/m);
    let tracked = "";
    try {
      tracked = execSync("git log --all --name-only --pretty=format:", { cwd: ROOT, encoding: "utf8" });
    } catch {
      return; // git이 없는 환경(배포 서버 등)에서는 건너뛴다
    }
    expect(tracked.split("\n").filter((l) => /(^|\/)\.env/.test(l))).toEqual([]);
  });
});
