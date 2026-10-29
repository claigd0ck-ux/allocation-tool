// Design Ref: §4.3 api/excel — Route Handler가 함께 쓰는 엑셀 응답·업로드 검사
// Plan SC: 작업 12. 받은 파일은 메모리에서만 다루고 저장하지 않는다(PRD 7절).

/** Vercel 서버 요청 크기 제한(약 4.5MB)보다 작게 둔다 (DESIGN 6절 2번). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** .xlsx 파일을 내려받게 하는 응답. 파일 이름은 한글도 되도록 RFC 5987 형식으로 적는다. */
export function xlsxResponse(data: Uint8Array, fileName: string): Response {
  return new Response(data as BodyInit, {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="download.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** 업로드 요청에서 파일 하나를 꺼낸다. 없거나 너무 크면 이유를 돌려준다. */
export async function readUpload(request: Request, field = "file"): Promise<{ ok: true; file: File } | { ok: false; message: string }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, message: "파일을 받지 못했습니다." };
  }
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "올린 파일이 없습니다." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "파일이 너무 큽니다 (4MB 이하만 올릴 수 있습니다)." };
  return { ok: true, file };
}

/**
 * JSON 요청 본문을 읽는다. content-length 헤더를 믿지 않고 실제로 읽은 크기로 제한한다(chunked 전송 대비).
 */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) return { ok: false, message: "요청이 너무 큽니다." };
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, message: "요청을 읽지 못했습니다." };
  }
  if (new TextEncoder().encode(raw).length > MAX_UPLOAD_BYTES) return { ok: false, message: "요청이 너무 큽니다." };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, message: "요청 형식이 올바르지 않습니다." };
  }
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
