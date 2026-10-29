// Design Ref: §4.3 excel — 기초 조건 양식 만들기·읽기와 다른 파일 거부
// Plan SC: 작업 12 (엑셀 양식 다운로드·업로드)

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildConditionsTemplate, MAX_INSTITUTIONS, parseConditionsTemplate } from "@/lib/excel/conditionsTemplate";
import { emptyWorkState, type ConditionsDraft } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";
import { exampleCases } from "../helpers/cases";

const example1: ConditionsDraft = {
  existingTotal: "1000",
  newDeposit: "200",
  limits: [
    { name: "A은행", limitPct: "40" },
    { name: "B증권", limitPct: "30" },
    { name: "C은행", limitPct: "20" },
    { name: "D은행", limitPct: "10" },
  ],
  rankRatios: ["40", "30", "20", "10"],
  mix1y: "90",
  mix3y: "10",
  amount3y: "",
  tolerance: "10",
};

describe("기초 조건 엑셀 양식", () => {
  it("빈 양식을 읽으면 빈 입력값", async () => {
    const parsed = await parseConditionsTemplate(await buildConditionsTemplate());
    expect(parsed).toEqual({ ok: true, draft: emptyWorkState().conditions });
  });

  it("값을 채운 양식을 읽으면 같은 값이 돌아오고, 검사를 통과해 예시 1 조건이 된다", async () => {
    const parsed = await parseConditionsTemplate(await buildConditionsTemplate(example1));
    expect(parsed).toEqual({ ok: true, draft: example1 });
    const check = checkConditions(example1);
    expect(check.ok && check.conditions).toEqual(exampleCases[0].conditions);
  });

  it("실무자가 엑셀에서 직접 채운 값(숫자·글자·쉼표)도 읽는다", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildConditionsTemplate()).buffer as ArrayBuffer);
    const ws = wb.getWorksheet("기초조건")!;
    ws.getCell("B4").value = 1000;
    ws.getCell("B5").value = "200";
    ws.getCell("A13").value = "  국민은행 ";
    ws.getCell("B13").value = 100;
    ws.getCell("E13").value = 100;
    const parsed = await parseConditionsTemplate(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(parsed.ok && parsed.draft).toMatchObject({
      existingTotal: "1000",
      newDeposit: "200",
      limits: [{ name: "국민은행", limitPct: "100" }],
      rankRatios: ["100"],
    });
  });

  it(`기관은 ${MAX_INSTITUTIONS}곳까지 적을 수 있다`, async () => {
    const many = {
      ...example1,
      limits: Array.from({ length: MAX_INSTITUTIONS }, (_, i) => ({ name: `기관${i + 1}`, limitPct: "5" })),
      rankRatios: Array.from({ length: MAX_INSTITUTIONS }, () => "5"),
    };
    const parsed = await parseConditionsTemplate(await buildConditionsTemplate(many));
    expect(parsed.ok && parsed.draft.limits).toHaveLength(MAX_INSTITUTIONS);
  });

  it("툴이 만든 양식이 아닌 엑셀은 거부한다", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("기초조건").getCell("B4").value = 1000;
    const parsed = await parseConditionsTemplate(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(parsed).toEqual({ ok: false, message: expect.stringContaining("기초 조건 양식이 아닙니다") });
  });

  it("엑셀 파일이 아니면 거부한다", async () => {
    const parsed = await parseConditionsTemplate(new TextEncoder().encode("그냥 글자 파일"));
    expect(parsed).toEqual({ ok: false, message: "엑셀(.xlsx) 파일을 읽을 수 없습니다." });
  });
});
