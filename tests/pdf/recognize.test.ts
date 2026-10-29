// Design Ref: §3.1 ② / PRD 7절 — 어떤 PDF를 AI로 보내고 어떤 PDF는 보내지 않는지
// Plan SC: 작업 13·14 (가짜 AI 응답으로 확인 — 실제 OpenAI 호출 없음)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/pdf/route";
import type { OcrClient } from "@/lib/pdf/ocr";
import { recognizePdf } from "@/lib/pdf/recognize";

const pdf = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../../examples/pdf", name)));

/** 호출 내용을 기록하고 정해진 글자를 돌려주는 가짜 OpenAI */
function fakeClient(text: string) {
  const calls: unknown[] = [];
  const client: OcrClient = {
    responses: {
      create: async (body) => {
        calls.push(body);
        return { output_text: text };
      },
    },
  };
  return { client, calls };
}

const D_BANK = [
  "기관명: D은행",
  "평가 점수: 80",
  "현재 예치 잔액: 200억 원",
  "수수료 적용 방식: 누진",
  "[1년물]",
  "상품명: D은행 1년물",
  "금리: 3.550%",
  "수수료: 0억 원 이상 0.200%, 100억 원 이상 0.120%",
  "[3년물]",
  "상품명: D은행 3년물",
  "금리: 3.8?0%",
  "수수료: 0억 원 이상 0.100%",
].join("\n");

describe("PDF 인식 경로", () => {
  it("글자 PDF는 AI를 부르지 않고 서버 안에서 읽는다", async () => {
    const { client, calls } = fakeClient("");
    const r = await recognizePdf(pdf("B증권.pdf"), "B증권.pdf", { client });
    expect(r.ok && r.method).toBe("text");
    expect(calls).toHaveLength(0);
  });

  it("스캔본은 AI로 보내되 저장하지 않게(store: false) 하고, 숫자는 코드가 해석해 모두 노란색(확인 필요)으로 둔다", async () => {
    const { client, calls } = fakeClient(D_BANK);
    const r = await recognizePdf(pdf("D은행_스캔본.pdf"), "D은행_스캔본.pdf", { client, allowOcr: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ store: false, input: [{ content: [{ type: "input_file" }, { type: "input_text" }] }] });
    // 글자 추출을 먼저 했어도 AI에는 PDF 전체가 그대로 간다
    const fileData = (calls[0] as { input: { content: { file_data?: string }[] }[] }).input[0].content[0].file_data!;
    expect(Buffer.from(fileData.split(",")[1], "base64").length).toBe(pdf("D은행_스캔본.pdf").length);
    expect(r.ok && r.method).toBe("ocr");
    if (!r.ok) return;
    expect([r.institution.existing.value, r.institution.existing.status]).toEqual([200, "uncertain"]);
    // AI가 ?로 표시한 글자는 값을 넣지 않는다
    expect(r.institution.products[1].rate).toMatchObject({ value: null, status: "uncertain", raw: "3.8?0%" });
  });

  it("글자는 있는데 양식이 아니면 동의 없이 AI로 보내지 않는다", async () => {
    const { client, calls } = fakeClient(D_BANK);
    const notProposal = await recognizePdfFromText("회의 자료입니다.", client);
    expect(notProposal).toMatchObject({ ok: false, method: "failed", canUseOcr: true });
    expect(calls).toHaveLength(0);
  });

  it("API 키가 없으면 스캔본은 직접 입력하라고 안내한다", async () => {
    const r = await recognizePdf(pdf("D은행_스캔본.pdf"), "D은행_스캔본.pdf", { client: null, allowOcr: true });
    expect(r).toMatchObject({ ok: false, method: "failed", message: expect.stringContaining("OPENAI_API_KEY") });
  });

  it("AI 요청이 실패해도 오류 없이 안내한다", async () => {
    const client: OcrClient = { responses: { create: async () => Promise.reject(new Error("네트워크")) } };
    const r = await recognizePdf(pdf("D은행_스캔본.pdf"), "D은행_스캔본.pdf", { client, allowOcr: true });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("AI 인식 요청에 실패") });
  });
});

describe("PDF 업로드 요청 (Route Handler)", () => {
  const post = (file: File, query = "") => {
    const form = new FormData();
    form.append("file", file);
    return POST(new Request(`http://localhost/api/pdf${query}`, { method: "POST", body: form }));
  };

  it("글자 PDF를 올리면 인식 결과를 돌려준다", async () => {
    const res = await post(new File([pdf("A은행.pdf")], "A은행.pdf"));
    const data = (await res.json()) as { ok: boolean; method: string; institution: { name: { value: string } } };
    expect([data.ok, data.method, data.institution.name.value]).toEqual([true, "text", "A은행"]);
  });

  it("PDF가 아닌 파일은 거부한다", async () => {
    expect((await post(new File(["x"], "a.txt"))).status).toBe(400);
  });
});

/** 글자만 있는 (양식이 아닌) PDF를 만들어 인식시킨다 */
async function recognizePdfFromText(text: string, client: OcrClient) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  page.drawText(text.replace(/[^\x20-\x7e]/g, "x") || "memo", { x: 50, y: 700, font: await doc.embedFont(StandardFonts.Helvetica) });
  return recognizePdf(await doc.save(), "memo.pdf", { client });
}
