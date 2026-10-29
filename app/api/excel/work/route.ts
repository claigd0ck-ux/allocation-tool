// Design Ref: §2.1 [데이터 저장 / 불러오기] — 작업 데이터 엑셀 만들기(POST JSON)·읽기(POST 파일). 아무것도 저장하지 않는다.
// Plan SC: 작업 19

import { jsonError, MAX_UPLOAD_BYTES, readUpload, xlsxResponse } from "@/lib/excel/http";
import { buildWorkBackup, parseWorkBackup, type WorkBackup } from "@/lib/excel/workBackup";

export async function POST(request: Request) {
  const type = request.headers.get("content-type") ?? "";

  // 불러오기: 저장 파일을 올리면 작업 데이터를 돌려준다
  if (type.startsWith("multipart/form-data")) {
    const upload = await readUpload(request);
    if (!upload.ok) return jsonError(upload.message);
    const parsed = await parseWorkBackup(await upload.file.arrayBuffer());
    if (!parsed.ok) return jsonError(parsed.message);
    return Response.json({ ok: true, backup: parsed.backup }, { headers: { "Cache-Control": "no-store" } });
  }

  // 저장: 작업 데이터를 받아 엑셀로 돌려준다
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return jsonError("요청이 너무 큽니다.");
  let body: WorkBackup;
  try {
    body = (await request.json()) as WorkBackup;
  } catch {
    return jsonError("요청 형식이 올바르지 않습니다.");
  }
  if (!body?.conditions || !Array.isArray(body?.review?.institutions)) return jsonError("요청 형식이 올바르지 않습니다.");
  const now = new Date();
  const ymd = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/-/g, "");
  return xlsxResponse(await buildWorkBackup({ conditions: body.conditions, review: body.review }, now), `적립금_작업데이터_${ymd}.xlsx`);
}
