// 공개 전 보안 점검 반영 확인 — 사이트 잠금, 요청 검사, 압축 폭탄 차단, OpenAI 전송 동의
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as exportPost } from "@/app/api/excel/export/route";
import { POST as workPost } from "@/app/api/excel/work/route";
import { buildConditionsTemplate, parseConditionsTemplate } from "@/lib/excel/conditionsTemplate";
import { recognizePdf } from "@/lib/pdf/recognize";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { proxy } from "@/proxy";
import { exampleCases } from "./helpers/cases";

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const req = (auth?: string) => new NextRequest("http://localhost/", { headers: auth ? { authorization: auth } : {} });

describe("사이트 전체 잠금 (proxy.ts)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("비밀번호가 맞아야 들어갈 수 있다", () => {
    vi.stubEnv("SITE_PASSWORD", "test-only-pw");
    expect(proxy(req()).status).toBe(401);
    expect(proxy(req()).headers.get("WWW-Authenticate")).toContain("Basic");
    expect(proxy(req(basic("admin", "틀림"))).status).toBe(401);
    expect(proxy(req(basic("admin", "test-only-pw"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("배포 환경에서 비밀번호가 설정되지 않았으면 열어 두지 않고 막는다", () => {
    vi.stubEnv("SITE_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(req()).status).toBe(503);
  });

  it("개발 중(비밀번호 없음)에는 열린다", () => {
    vi.stubEnv("SITE_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(req()).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("요청 본문 검사 (zod)", () => {
  const post = (fn: typeof exportPost, body: unknown) =>
    fn(new Request("http://localhost/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const c = exampleCases[0];

  it("결과 엑셀: 기관 21곳 이상은 거부한다 (계산 폭주 방지)", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ ...c.institutions[0], name: `기관${i}` }));
    expect((await post(exportPost, { institutions: many, conditions: c.conditions, choice: "minCount" })).status).toBe(400);
  });

  it("결과 엑셀: 정상 요청은 그대로 된다", async () => {
    expect((await post(exportPost, { institutions: c.institutions, conditions: c.conditions, choice: "minCount" })).status).toBe(200);
  });

  it("데이터 저장: 값 자리에 객체(엑셀 수식)가 오면 거부한다", async () => {
    const field = { value: { formula: "HYPERLINK(\"http://x\")" }, status: "ok", confirmed: true };
    const body = {
      conditions: { existingTotal: "", newDeposit: "", limits: [], rankRatios: [], mix1y: "", mix3y: "", amount3y: "", tolerance: "" },
      review: { files: [], institutions: [{ id: "a", sourceFile: "a", name: field, score: field, existing: field, feeMethod: field, products: [], matchedName: null }] },
    };
    expect((await post(workPost, body)).status).toBe(400);
  });
});

describe("압축 폭탄 엑셀 차단", () => {
  it("풀었을 때 너무 큰 파일은 읽지 않는다", async () => {
    const zip = await JSZip.loadAsync(await buildConditionsTemplate());
    zip.file("xl/bomb.xml", "a".repeat(60 * 1024 * 1024)); // 압축하면 작지만 풀면 60MB
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
    expect(await parseConditionsTemplate(bytes)).toEqual({ ok: false, message: expect.stringContaining("크기가 너무 커서") });
  });
});

describe("OpenAI 전송 동의", () => {
  it("스캔본도 동의 없이는 AI로 보내지 않는다", async () => {
    const calls: unknown[] = [];
    const client = { responses: { create: async (b: unknown) => (calls.push(b), { output_text: "" }) } };
    const scan = new Uint8Array(readFileSync(join(__dirname, "../examples/pdf/D은행_스캔본.pdf")));
    const r = await recognizePdf(scan, "scan.pdf", { client });
    expect(r).toMatchObject({ ok: false, canUseOcr: true, message: expect.stringContaining("PDF 전체를 AI(OpenAI)로") });
    expect(calls).toHaveLength(0);
  });
});
