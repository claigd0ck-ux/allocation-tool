// Design Ref: §2.2 ⑤ — 결과 엑셀의 시트 구성과 내용
// Plan SC: 작업 18, 성공 기준 ⑤(근거 요약이 엑셀에 포함)

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/excel/export/route";
import { calculatePlan } from "@/lib/calc";
import { buildResultWorkbook } from "@/lib/excel/resultWorkbook";
import { exampleCases } from "../helpers/cases";

async function open(data: Uint8Array | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data instanceof Uint8Array ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer) : data);
  return wb;
}

function result(index: number) {
  const c = exampleCases[index];
  const r = calculatePlan(c.institutions, c.conditions);
  if (!r.ok) throw new Error("계산 실패");
  return r;
}

describe("결과 엑셀", () => {
  it("시트 세 개: 목표 배분안 · 이동 내역 · 근거 요약", async () => {
    const wb = await open(await buildResultWorkbook(result(0), "minCount"));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["목표 배분안", "이동 내역", "근거 요약"]);
  });

  it("목표 배분안: 예시 3의 기관별 금액·수익률과 합계", async () => {
    const ws = (await open(await buildResultWorkbook(result(2), "minAmount"))).getWorksheet("목표 배분안")!;
    const row = (n: number) => (ws.getRow(n).values as unknown[]).slice(1, 9);
    expect(row(2)).toEqual([1, "A은행", 91, 0.36, 371, 371, 0, 0.0342]);
    expect(row(3)).toEqual([2, "B증권", 87, 0.28, 288, 185, 103, 0.03473]);
    expect(ws.getRow(2).getCell(10).value).toContain("한도 1억 미만 초과(허용)");
    expect((ws.getRow(6).values as unknown[]).slice(2, 9)).toEqual(["합계", undefined, undefined, 1030, 927, 103, 0.03422]);
  });

  it("이동 내역: 선택한 방법이 먼저, 비교용 다른 방법이 뒤에", async () => {
    const ws = (await open(await buildResultWorkbook(result(2), "minAmount"))).getWorksheet("이동 내역")!;
    expect(ws.getCell("A1").value).toBe("최소 이동 금액 기준 (선택) — 송금 4회, 이동 금액 104억");
    const texts: string[] = [];
    ws.eachRow((r) => texts.push(String(r.getCell(1).value)));
    expect(texts).toContain("최소 이동 횟수 기준 (비교) — 송금 3회, 이동 금액 113억");
  });

  it("근거 요약 시트에 요약 글이 들어간다", async () => {
    const ws = (await open(await buildResultWorkbook(result(0), "minCount"))).getWorksheet("근거 요약")!;
    const texts: string[] = [];
    ws.eachRow((r) => texts.push(String(r.getCell(1).value)));
    expect(texts[0]).toBe("1. 전체 규모");
    expect(texts.join("\n")).toContain("전체 수수료 차감 수익률은 3.411%");
  });
});

describe("결과 엑셀 내려받기 요청 (Route Handler)", () => {
  const c = exampleCases[0];
  const request = (body: unknown) =>
    new Request("http://localhost/api/excel/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("기관 자료·조건으로 서버에서 다시 계산해 엑셀을 돌려준다", async () => {
    const res = await POST(request({ institutions: c.institutions, conditions: c.conditions, choice: "minCount" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("filename*=UTF-8''");
    const wb = await open(await res.arrayBuffer());
    expect(wb.getWorksheet("목표 배분안")!.getRow(2).getCell(5).value).toBe(480);
  });

  it("계산 검사에 걸리는 자료는 거부한다", async () => {
    const res = await POST(request({ institutions: c.institutions, conditions: { ...c.conditions, rankRatios: [10, 20, 30, 40] }, choice: "minCount" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain("같거나 작아야");
  });

  it("형식이 틀린 요청은 거부한다", async () => {
    expect((await POST(request({ choice: "아무거나" }))).status).toBe(400);
  });
});
