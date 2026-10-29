// Design Ref: §4.3 excel — 올린 엑셀 읽기. Excel 말고 한컴오피스 한셀 등이 저장한 파일도 읽는다
// Plan SC: 작업 12·19 보완

import ExcelJS from "exceljs";
import JSZip from "jszip";

/** 접두어를 붙여 저장되면 exceljs가 읽지 못하는 이름공간 (시트 본문, 문서 정보) */
const PREFIXED_NAMESPACES = [
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
];

/**
 * .xlsx를 읽는다. 바로 읽지 못하면 이름공간 접두어를 Excel 표기로 바꿔 다시 읽는다.
 * 한셀은 `<x:worksheet>`, `<ep:Properties>`처럼 접두어를 붙여 저장하는데(같은 뜻의 올바른 XML),
 * exceljs는 접두어 없는 Excel 표기만 처리한다. 그래도 읽지 못하면 처음 오류를 던진다.
 */
/** 압축 폭탄 차단: 풀었을 때 크기·항목 수 상한 (보안 점검 중간 4번) */
export const MAX_XLSX_ENTRIES = 300;
export const MAX_XLSX_ENTRY_BYTES = 20 * 1024 * 1024;
export const MAX_XLSX_TOTAL_BYTES = 50 * 1024 * 1024;

/** 압축 폭탄 등 위험한 파일일 때 던지는 오류 (사용자에게 그대로 보여 줄 문장) */
export class UnsafeWorkbookError extends Error {}

/** 풀기 전에 zip 목차만 보고 항목 수와 풀린 크기를 확인한다. */
async function assertSafeZip(bytes: Uint8Array): Promise<void> {
  const zip = await JSZip.loadAsync(bytes).catch(() => null);
  if (!zip) return; // zip이 아니면 아래 읽기에서 형식 오류로 처리
  const entries = Object.values(zip.files);
  const sizeOf = (f: JSZip.JSZipObject) => (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  const total = entries.reduce((s, f) => s + sizeOf(f), 0);
  if (entries.length > MAX_XLSX_ENTRIES || entries.some((f) => sizeOf(f) > MAX_XLSX_ENTRY_BYTES) || total > MAX_XLSX_TOTAL_BYTES) {
    throw new UnsafeWorkbookError("파일을 풀면 크기가 너무 커서 읽지 않았습니다. 툴에서 내려받은 양식을 사용해 주세요.");
  }
}

export async function loadXlsx(data: ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  await assertSafeZip(bytes);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(bytes));
    return wb;
  } catch (first) {
    const zip = await JSZip.loadAsync(bytes).catch(() => null);
    if (!zip) throw first;
    let changed = false;
    for (const name of Object.keys(zip.files).filter((n) => n.endsWith(".xml"))) {
      const xml = await zip.file(name)!.async("string");
      const fixed = stripPrefixes(xml);
      if (fixed !== xml) {
        zip.file(name, fixed);
        changed = true;
      }
    }
    if (!changed) throw first;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toArrayBuffer(await zip.generateAsync({ type: "uint8array" })));
    return wb;
  }
}

/** `<x:row>` → `<row>`, `xmlns:x="…main"` → `xmlns="…main"` (위 이름공간에 묶인 접두어만) */
export function stripPrefixes(xml: string): string {
  let out = xml;
  for (const ns of PREFIXED_NAMESPACES) {
    const m = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)="${ns.replace(/[.\/]/g, "\\$&")}"`).exec(out);
    if (!m) continue;
    const p = m[1];
    out = out
      .replace(m[0], `xmlns="${ns}"`)
      .replace(new RegExp(`<${p}:`, "g"), "<")
      .replace(new RegExp(`</${p}:`, "g"), "</");
  }
  return out;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
