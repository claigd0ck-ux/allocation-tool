// Design Ref: §4.3 api/pdf — PDF → 표 데이터. 파일은 메모리에서만 다루고 저장하지 않는다.
// Plan SC: 작업 13·14

import { jsonError, readUpload } from "@/lib/excel/http";
import { recognizePdf } from "@/lib/pdf/recognize";

// AI 인식은 시간이 걸릴 수 있다 (Vercel 함수 최대 실행 시간)
export const maxDuration = 60;

export async function POST(request: Request) {
  const upload = await readUpload(request);
  if (!upload.ok) return jsonError(upload.message);
  if (!upload.file.name.toLowerCase().endsWith(".pdf")) return jsonError("PDF 파일만 올릴 수 있습니다.");

  const allowOcr = new URL(request.url).searchParams.get("allowOcr") === "1";
  const data = new Uint8Array(await upload.file.arrayBuffer());
  const result = await recognizePdf(data, upload.file.name, { allowOcrForTextPdf: allowOcr });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
