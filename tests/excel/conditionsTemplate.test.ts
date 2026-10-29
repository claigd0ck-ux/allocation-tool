// Design Ref: §4.3 excel — 기초 조건 양식 만들기·읽기와 다른 파일 거부
// Plan SC: 작업 12 (엑셀 양식 다운로드·업로드)

import ExcelJS from "exceljs";
import JSZip from "jszip";
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
    expect(check.ok && check.conditions).toEqual({ ...exampleCases[0].conditions, toleranceTargets: [] });
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

  it("엑셀 파일이 아니면(이름만 .xlsx) 그 이유를 알려준다", async () => {
    const parsed = await parseConditionsTemplate(new TextEncoder().encode("그냥 글자 파일"));
    expect(parsed).toEqual({ ok: false, message: expect.stringContaining("엑셀(.xlsx) 파일이 아닙니다") });
  });

  it("암호·회사 보안(DRM)이 걸린 엑셀이나 예전 .xls(OLE 형식)는 해제·다시 저장하라고 알려준다", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const parsed = await parseConditionsTemplate(ole);
    expect(parsed).toEqual({ ok: false, message: expect.stringContaining("회사 보안(DRM)") });
  });

  it("한컴오피스 한셀로 저장한 양식도 읽는다 (x:·ep: 이름공간 접두어가 붙은 파일)", async () => {
    const zip = await JSZip.loadAsync(await buildConditionsTemplate(example1));
    // 한셀이 저장하는 모양: 시트 본문은 <x:…>, 문서 정보는 <ep:…> (exceljs는 여기서 멈춘다)
    zip.file(
      "docProps/app.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><ep:Properties xmlns:ep="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><ep:Application>Cell</ep:Application><ep:AppVersion>12.0300</ep:AppVersion></ep:Properties>',
    );
    for (const name of Object.keys(zip.files).filter((n) => n.startsWith("xl/") && n.endsWith(".xml") && !n.includes("theme"))) {
      const xml = await zip.file(name)!.async("string");
      const main = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
      if (xml.includes(main)) {
        zip.file(name, xml.replace(main, main.replace("xmlns=", "xmlns:x=")).replace(/<(\/?)(?![?!])([A-Za-z])/g, "<$1x:$2"));
      }
    }
    const hancell = await zip.generateAsync({ type: "uint8array" });
    await expect(new ExcelJS.Workbook().xlsx.load(hancell.buffer as ArrayBuffer)).rejects.toThrow();
    expect(await parseConditionsTemplate(hancell)).toEqual({ ok: true, draft: example1 });
  });

  it("Excel에서 열어 값을 넣고 저장한 양식도 읽는다 (Excel이 저장한 파일 구조)", async () => {
    // Excel이 다시 저장하면 숨김 시트·서식 구조가 바뀐다 — 그래도 표식과 값을 찾는다
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildConditionsTemplate()).buffer as ArrayBuffer);
    wb.getWorksheet("기초조건")!.getCell("B4").value = 1000;
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(await wb.xlsx.writeBuffer());
    const parsed = await parseConditionsTemplate(new Uint8Array(await again.xlsx.writeBuffer()));
    expect(parsed.ok && parsed.draft.existingTotal).toBe("1000");
  });
});
