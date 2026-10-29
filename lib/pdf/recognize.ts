// Design Ref: §3.1 ② PDF 인식 — 글자 PDF는 서버 안에서, 글자가 없는 스캔본만 AI로. 표 인식 실패 시 AI 전송은 동의할 때만
// Plan SC: 작업 13·14

import { extractPdfText } from "./extractText";
import { ocrPdf, type OcrClient } from "./ocr";
import { parseProposal, type ParsedInstitution } from "./parseProposal";

export type Recognition =
  | { ok: true; method: "text" | "ocr"; institution: ParsedInstitution }
  /** 글자는 있는데 양식 항목을 못 찾음 → 실무자가 동의하면 AI로 다시 */
  | { ok: false; method: "failed"; canUseOcr: true; message: string }
  | { ok: false; method: "failed"; canUseOcr: false; message: string };

export async function recognizePdf(
  data: Uint8Array,
  fileName: string,
  options: { allowOcrForTextPdf?: boolean; client?: OcrClient | null } = {},
): Promise<Recognition> {
  const extracted = await extractPdfText(data);
  if (!extracted.ok) return { ok: false, method: "failed", canUseOcr: false, message: extracted.message };

  const isScan = extracted.text.length === 0;
  if (!isScan) {
    const parsed = parseProposal(extracted.text);
    if (parsed.foundLabels > 0) return { ok: true, method: "text", institution: parsed.institution };
    if (!options.allowOcrForTextPdf) {
      return {
        ok: false,
        method: "failed",
        canUseOcr: true,
        message: "표준 양식의 항목을 찾지 못했습니다. ③에서 직접 입력하거나, 동의하면 AI로 읽을 수 있습니다 (자료가 외부로 전송됩니다).",
      };
    }
  }

  const ocr = await ocrPdf(data, fileName, options.client);
  if (!ocr.ok) return { ok: false, method: "failed", canUseOcr: false, message: ocr.message };
  const parsed = parseProposal(ocr.text);
  if (parsed.foundLabels === 0) {
    return { ok: false, method: "failed", canUseOcr: false, message: "AI로 읽었지만 표준 양식의 항목을 찾지 못했습니다. ③에서 직접 입력해 주세요." };
  }
  // AI가 읽은 값은 모두 실무자가 한 번씩 확인하도록 노란색으로 둔다
  return { ok: true, method: "ocr", institution: markAllUncertain(parsed.institution) };
}

function markAllUncertain(i: ParsedInstitution): ParsedInstitution {
  const mark = <T>(f: import("@/lib/domain/types").Field<T>) =>
    f.status === "ok" ? { ...f, status: "uncertain" as const, confirmed: false, note: "AI로 읽은 값입니다. 확인해 주세요." } : f;
  return {
    name: mark(i.name),
    score: mark(i.score),
    existing: mark(i.existing),
    feeMethod: mark(i.feeMethod),
    products: i.products.map((p) => ({
      name: mark(p.name),
      maturity: p.maturity,
      rate: mark(p.rate),
      tiers: p.tiers.map((t) => ({ from: mark(t.from), fee: mark(t.fee) })),
    })),
  };
}
