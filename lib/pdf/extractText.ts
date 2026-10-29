// Design Ref: §4.3 pdf/extractText.ts — 글자를 선택할 수 있는 PDF에서 서버 안에서 글자를 꺼낸다 (unpdf)
// Plan SC: 작업 13. 글자가 없으면(스캔본) 빈 글자를 돌려 AI 인식(작업 14)으로 넘긴다.

import { extractText, getDocumentProxy } from "unpdf";

export type PdfText = { ok: true; text: string; pages: number } | { ok: false; message: string };

export async function extractPdfText(data: Uint8Array): Promise<PdfText> {
  try {
    // PDF 읽기 도구가 넘겨받은 데이터를 비워 버리므로(작업 공간으로 옮김) 복사본을 넘긴다 — 원본은 AI 인식에 다시 쓴다
    const pdf = await getDocumentProxy(data.slice());
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return { ok: true, text: text.trim(), pages: totalPages };
  } catch {
    return { ok: false, message: "PDF 파일을 읽을 수 없습니다 (손상되었거나 암호가 걸린 파일일 수 있습니다)." };
  }
}
