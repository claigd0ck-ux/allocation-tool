// Design Ref: §4.3 excel/template.ts·parse.ts — 기초 조건 엑셀 양식 만들기와 읽기 (exceljs)
// Plan SC: 작업 12 (엑셀 양식 다운로드·업로드). 툴이 만든 양식만 받는다(숨김 시트의 표식으로 확인).

import ExcelJS from "exceljs";
import type { ConditionsDraft } from "@/lib/storage/workState";
import { excelReadProblem } from "./fileKind";

/** 툴이 만든 양식인지 알아보는 표식 (숨김 시트 "_양식정보"의 A1·B1). */
export const TEMPLATE_MARK = "allocation-tool-conditions";
export const TEMPLATE_VERSION = 1;
export const MAX_INSTITUTIONS = 20;

const SHEET = "기초조건";
const INFO_SHEET = "_양식정보";

/** 항목 칸 위치: B열의 값 */
const CELLS = {
  existingTotal: "B4",
  newDeposit: "B5",
  mix1y: "B6",
  mix3y: "B7",
  amount3y: "B8",
  tolerance: "B9",
} as const;
/** 기관 표(A·B열)와 순위별 배분비율 표(D·E열)가 시작하는 행 */
const TABLE_START_ROW = 13;

export type TemplateParse = { ok: true; draft: ConditionsDraft } | { ok: false; message: string };

/** 기초 조건 엑셀 양식을 만든다. draft를 주면 그 값을 채운 양식(지금 입력값 내려받기)이 된다. */
export async function buildConditionsTemplate(draft?: ConditionsDraft): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "적립금 배분 툴";
  const ws = wb.addWorksheet(SHEET);
  ws.columns = [{ width: 26 }, { width: 16 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 44 }];

  ws.getCell("A1").value = "적립금 배분 툴 — 기초 조건 입력 양식";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = "노란 칸에 값을 입력한 뒤 툴의 [채운 엑셀 올리기]로 올려 주세요. 칸 위치를 바꾸지 마세요.";

  const header = (row: number, cols: string[], start = 1) =>
    cols.forEach((text, i) => {
      const cell = ws.getRow(row).getCell(start + i);
      cell.value = text;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
    });
  const input = (address: string, value: string | undefined, numeric = true) => {
    const cell = ws.getCell(address);
    const v = value?.replace(/,/g, "").trim() ?? "";
    cell.value = v === "" ? null : numeric && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
  };

  header(3, ["항목", "값", "단위", "", "", "설명"]);
  const rows: [string, keyof typeof CELLS, string, string][] = [
    ["기존 예치금액", "existingTotal", "억 원", "기관별 현재 잔액의 합과 같아야 합니다"],
    ["신규 예치금액", "newDeposit", "억 원", ""],
    ["만기 구성 비율 — 1년물", "mix1y", "%", "1년물 + 3년물 = 100%"],
    ["만기 구성 비율 — 3년물", "mix3y", "%", ""],
    ["3년물 금액 (필요할 때만)", "amount3y", "억 원", "전체 × 3년물 비율이 정수가 아닐 때만 입력"],
    ["허용 오차 (±)", "tolerance", "억 원", "모든 기관에 같은 폭"],
  ];
  rows.forEach(([label, key, unit, note], i) => {
    const r = 4 + i;
    ws.getCell(`A${r}`).value = label;
    input(CELLS[key], draft?.[key]);
    ws.getCell(`C${r}`).value = unit;
    ws.getCell(`F${r}`).value = note;
  });

  ws.getCell(`A${TABLE_START_ROW - 2}`).value = `기관 명단과 배분 한도 (최대 ${MAX_INSTITUTIONS}곳, 한도 합계 100%)`;
  ws.getCell(`D${TABLE_START_ROW - 2}`).value = "순위별 배분비율 (합계 100%, 순위순으로 같거나 작게)";
  ws.getCell(`A${TABLE_START_ROW - 2}`).font = { bold: true };
  ws.getCell(`D${TABLE_START_ROW - 2}`).font = { bold: true };
  header(TABLE_START_ROW - 1, ["기관명", "한도(%)"]);
  header(TABLE_START_ROW - 1, ["순위", "배분비율(%)"], 4);
  for (let i = 0; i < MAX_INSTITUTIONS; i++) {
    const r = TABLE_START_ROW + i;
    input(`A${r}`, draft?.limits[i]?.name, false);
    input(`B${r}`, draft?.limits[i]?.limitPct);
    ws.getCell(`D${r}`).value = `${i + 1}위`;
    input(`E${r}`, draft?.rankRatios[i]);
  }

  const info = wb.addWorksheet(INFO_SHEET, { state: "veryHidden" });
  info.getCell("A1").value = TEMPLATE_MARK;
  info.getCell("B1").value = TEMPLATE_VERSION;

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 채운 양식을 읽어 기초 조건 입력값으로 바꾼다. 툴의 양식이 아니면 거부한다. */
export async function parseConditionsTemplate(data: ArrayBuffer | Uint8Array): Promise<TemplateParse> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data instanceof Uint8Array ? toArrayBuffer(data) : data);
  } catch {
    return { ok: false, message: excelReadProblem(data) };
  }
  const info = wb.getWorksheet(INFO_SHEET);
  const ws = wb.getWorksheet(SHEET);
  if (!info || !ws || text(info.getCell("A1").value) !== TEMPLATE_MARK) {
    return { ok: false, message: "툴에서 내려받은 기초 조건 양식이 아닙니다. [엑셀 양식 내려받기]로 받은 파일을 채워 올려 주세요." };
  }
  if (Number(text(info.getCell("B1").value)) !== TEMPLATE_VERSION) {
    return { ok: false, message: "양식 버전이 다릅니다. 양식을 다시 내려받아 주세요." };
  }

  const limits: ConditionsDraft["limits"] = [];
  const rankRatios: string[] = [];
  for (let i = 0; i < MAX_INSTITUTIONS; i++) {
    const r = TABLE_START_ROW + i;
    const name = text(ws.getCell(`A${r}`).value);
    const limitPct = text(ws.getCell(`B${r}`).value);
    if (name || limitPct) limits.push({ name, limitPct });
    const ratio = text(ws.getCell(`E${r}`).value);
    if (ratio) rankRatios.push(ratio);
  }

  return {
    ok: true,
    draft: {
      existingTotal: text(ws.getCell(CELLS.existingTotal).value),
      newDeposit: text(ws.getCell(CELLS.newDeposit).value),
      mix1y: text(ws.getCell(CELLS.mix1y).value),
      mix3y: text(ws.getCell(CELLS.mix3y).value),
      amount3y: text(ws.getCell(CELLS.amount3y).value),
      tolerance: text(ws.getCell(CELLS.tolerance).value),
      limits,
      rankRatios,
    },
  };
}

/** 엑셀 칸 값을 화면 입력용 글자로 바꾼다 (숫자·글자·수식 결과 모두). */
function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && "result" in value && value.result !== undefined) return text(value.result as ExcelJS.CellValue);
  if (typeof value === "object" && "richText" in value) return value.richText.map((t) => t.text).join("").trim();
  return String(value).trim();
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
