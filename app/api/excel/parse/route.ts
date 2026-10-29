// Design Ref: §4.3 api/excel/parse — 채운 기초 조건 양식 읽기. 파일은 메모리에서만 읽고 버린다.
// Plan SC: 작업 12
import { parseConditionsTemplate } from "@/lib/excel/conditionsTemplate";
import { jsonError, readUpload } from "@/lib/excel/http";

export async function POST(request: Request) {
  const upload = await readUpload(request);
  if (!upload.ok) return jsonError(upload.message);
  if (!upload.file.name.toLowerCase().endsWith(".xlsx")) return jsonError("엑셀(.xlsx) 파일만 올릴 수 있습니다.");

  const parsed = await parseConditionsTemplate(await upload.file.arrayBuffer());
  if (!parsed.ok) return jsonError(parsed.message);
  return Response.json({ ok: true, draft: parsed.draft }, { headers: { "Cache-Control": "no-store" } });
}
