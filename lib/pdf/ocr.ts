// Design Ref: §4.3 pdf/ocr.ts, PRD 7절 — 스캔본 PDF만 OpenAI로 보내 글자를 옮겨 적게 한다 (API 키는 서버에서만)
// Plan SC: 작업 14 (PDF OCR 인식). AI는 글자만 옮겨 적고, 숫자 해석은 parseProposal(코드)이 한다.

import OpenAI from "openai";

/** 모델은 코드에 박지 않고 환경변수로 바꿀 수 있다 (DESIGN 4.2). */
export const DEFAULT_OCR_MODEL = "gpt-5.5";

const INSTRUCTIONS = [
  "너는 스캔한 문서의 글자를 그대로 옮겨 적는 도구다.",
  "PDF에 보이는 글자를 줄 단위로 그대로 옮겨 적어라. 요약·설명·계산·추측을 하지 마라.",
  "숫자·단위·기호(%, 억, 원, 쉼표, 소수점)는 보이는 그대로 적어라.",
  "확실하지 않은 글자는 그 글자 대신 ?를 적어라.",
  "사람 이름·전화번호·이메일이 있는 줄(예: 담당자)은 적지 마라.",
  "옮겨 적은 글자만 출력하라.",
].join("\n");

export type OcrResult = { ok: true; text: string } | { ok: false; message: string };

/** OCR 요청에 필요한 최소한의 OpenAI 기능 (테스트에서는 가짜를 넣는다). */
export interface OcrClient {
  responses: { create: (body: OpenAI.Responses.ResponseCreateParamsNonStreaming) => Promise<{ output_text: string }> };
}

/** 환경변수의 API 키로 OpenAI 클라이언트를 만든다. 키가 없으면 null. */
export function defaultOcrClient(): OcrClient | null {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

export async function ocrPdf(data: Uint8Array, fileName: string, client: OcrClient | null = defaultOcrClient()): Promise<OcrResult> {
  if (!client) return { ok: false, message: "AI 인식을 쓸 수 없습니다 (서버에 OPENAI_API_KEY가 설정되지 않았습니다)." };
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || DEFAULT_OCR_MODEL,
      instructions: INSTRUCTIONS,
      // 대외비 자료이므로 OpenAI 쪽에 응답을 저장하지 않게 한다
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", filename: fileName.replace(/[^\w.-]/g, "_") || "proposal.pdf", file_data: `data:application/pdf;base64,${Buffer.from(data).toString("base64")}` },
            { type: "input_text", text: "이 제안서의 글자를 옮겨 적어 주세요." },
          ],
        },
      ],
    });
    const text = response.output_text?.trim() ?? "";
    return text ? { ok: true, text } : { ok: false, message: "AI가 글자를 읽지 못했습니다." };
  } catch (e) {
    // 원인 파악용으로 오류 종류만 덧붙인다 (자료 내용·키는 넣지 않는다)
    const code = e instanceof OpenAI.APIError ? ` (오류 ${e.status ?? ""} ${e.code ?? ""})` : e instanceof Error ? ` (${e.name})` : "";
    return { ok: false, message: `AI 인식 요청에 실패했습니다${code.replace(/\s+\)/, ")")}. 잠시 후 다시 시도하거나 ③에서 직접 입력해 주세요.` };
  }
}
