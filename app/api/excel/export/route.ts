// Design Ref: §4.3 api/excel/export — 결과 엑셀 만들기
// Plan SC: 작업 18. 받은 계산 결과를 믿지 않고 기관 자료·기초 조건으로 서버에서 다시 계산해 만든다. 아무것도 저장하지 않는다.

import { calculatePlan } from "@/lib/calc";
import type { Conditions, Institution } from "@/lib/domain/types";
import { jsonError, MAX_UPLOAD_BYTES, xlsxResponse } from "@/lib/excel/http";
import { buildResultWorkbook } from "@/lib/excel/resultWorkbook";
import type { MoveChoice } from "@/lib/storage/workState";

interface ExportRequest {
  institutions: Institution[];
  conditions: Conditions;
  choice: MoveChoice;
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) return jsonError("요청이 너무 큽니다.");

  let body: ExportRequest;
  try {
    body = (await request.json()) as ExportRequest;
  } catch {
    return jsonError("요청 형식이 올바르지 않습니다.");
  }
  if (!Array.isArray(body?.institutions) || typeof body?.conditions !== "object" || !["minCount", "minAmount"].includes(body?.choice)) {
    return jsonError("요청 형식이 올바르지 않습니다.");
  }

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
