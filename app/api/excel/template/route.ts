// Design Ref: §4.3 api/excel/template — 빈 기초 조건 양식 내려받기
// Plan SC: 작업 12
import { buildConditionsTemplate } from "@/lib/excel/conditionsTemplate";
import { xlsxResponse } from "@/lib/excel/http";

export async function GET() {
  return xlsxResponse(await buildConditionsTemplate(), "기초조건_양식.xlsx");
}
