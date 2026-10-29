// Design Ref: §4.3 api/excel/export — 결과 엑셀 만들기
// Plan SC: 작업 18. 받은 계산 결과를 믿지 않고 기관 자료·기초 조건으로 서버에서 다시 계산해 만든다. 아무것도 저장하지 않는다.
// 보안: 요청 본문은 zod로 검사한다(기관 20곳 이하, 숫자 범위·글자 길이 제한 — 계산 폭주 방지).

import { calculatePlan } from "@/lib/calc";
import { jsonError, readJsonBody, xlsxResponse } from "@/lib/excel/http";
import { buildResultWorkbook } from "@/lib/excel/resultWorkbook";
import { exportRequestSchema } from "@/lib/validate/requestSchemas";

export async function POST(request: Request) {
  const read = await readJsonBody(request);
  if (!read.ok) return jsonError(read.message);
  const parsed = exportRequestSchema.safeParse(read.body);
  if (!parsed.success) return jsonError("요청 형식이 올바르지 않습니다.");
  const body = parsed.data;

  let result;
  try {
    result = calculatePlan(body.institutions, body.conditions);
  } catch {
    return jsonError("계산할 수 없는 자료입니다.");
  }
  if (!result.ok) return jsonError(result.errors.map((e) => e.message).join(" / "));

  const now = new Date();
  const ymd = now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/-/g, "");
  return xlsxResponse(await buildResultWorkbook(result, body.choice, now), `적립금_배분결과_${ymd}.xlsx`);
}
