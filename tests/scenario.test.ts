// Design Ref: §8 L3 — 전체 흐름: 기초 조건 엑셀 → PDF 인식 → 확인·수정 → 계산 → 근거 요약 → 결과 엑셀
// Plan SC: 작업 22 (전체 시나리오 점검), 성공 기준 ③④⑤ (①②의 시간은 화면에서 직접 잰다)

import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReviewInstitution } from "@/lib/domain/review";
import { buildConditionsTemplate, parseConditionsTemplate } from "@/lib/excel/conditionsTemplate";
import { buildResultWorkbook } from "@/lib/excel/resultWorkbook";
import type { OcrClient } from "@/lib/pdf/ocr";
import { recognizePdf } from "@/lib/pdf/recognize";
import { checkReview, confirmField, suggestMatch } from "@/lib/review/review";
import { emptyWorkState, type ConditionsDraft, type WorkState } from "@/lib/storage/workState";
import { buildSummary, summaryText } from "@/lib/summary/buildSummary";
import { checkConditions } from "@/lib/validate/conditions";
import { recalculate } from "@/lib/workflow/recalc";
import { adviseTolerance } from "@/lib/calc/toleranceAdvice";
import { rawCases } from "./helpers/cases";
import { oracleAnswer } from "./helpers/oracle";

const pdf = (name: string) => new Uint8Array(readFileSync(join(__dirname, "../examples/pdf", name)));

/** 스캔본에 대해 AI가 옮겨 적었다고 치는 글자 (실제 호출 결과와 같은 내용) */
const scanText = [
  "기관명: D은행",
  "평가 점수: 80",
  "현재 예치 잔액: 200억 원",
  "수수료 적용 방식: 누진",
  "[1년물]",
  "상품명: D은행 1년물",
  "금리: 3.550%",
  "수수료: 0억 원 이상 0.200%, 100억 원 이상 0.120%",
  "[3년물]",
  "상품명: D은행 3년물",
  "금리: 3.800%",
  "수수료: 0억 원 이상 0.100%",
].join("\n");
const fakeOcr: OcrClient = { responses: { create: async () => ({ output_text: scanText }) } };

/** 실무자가 엑셀 양식에 예시 1 기초 조건을 채운 파일 */
async function filledTemplate(): Promise<ArrayBuffer> {
  const draft: ConditionsDraft = {
    existingTotal: "1,000",
    newDeposit: "200",
    limits: ["A은행", "B증권", "C은행", "D은행"].map((name, i) => ({ name, limitPct: String([40, 30, 20, 10][i]) })),
    rankRatios: ["40", "30", "20", "10"],
    mix1y: "90",
    mix3y: "10",
    amount3y: "",
    tolerance: "10",
  };
  const u8 = await buildConditionsTemplate(draft);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/** 실무자가 노란 칸을 하나씩 "확인" 누른 것 */
function confirmAll(i: ReviewInstitution): ReviewInstitution {
  return {
    ...i,
    name: confirmField(i.name),
    score: confirmField(i.score),
    existing: confirmField(i.existing),
    feeMethod: confirmField(i.feeMethod),
    products: i.products.map((p) => ({
      ...p,
      name: confirmField(p.name),
      rate: confirmField(p.rate),
      tiers: p.tiers.map((t) => ({ from: confirmField(t.from), fee: confirmField(t.fee) })),
    })),
  };
}

describe("전체 시나리오 — 예시 1을 처음부터 끝까지", () => {
  it("엑셀 양식 → PDF 4건(이름 다름·누락·스캔본 포함) → 확인·수정 → 계산 → 요약 → 결과 엑셀", async () => {
    // ① 기초 조건: 엑셀 양식을 채워 올린다
    const parsed = await parseConditionsTemplate(await filledTemplate());
    expect(parsed.ok).toBe(true);
    let state: WorkState = { ...emptyWorkState(), conditions: parsed.ok ? parsed.draft : emptyWorkState().conditions };
    const conditions = checkConditions(state.conditions);
    expect(conditions.ok).toBe(true);
    const names = state.conditions.limits.map((l) => l.name);

    // ② PDF 올리기: A는 이름이 "KB A은행", C는 수수료 방식 누락, D는 스캔본(AI 인식)
    const uploads = ["KB-A은행_이름다름.pdf", "B증권.pdf", "C은행_누락.pdf", "D은행_스캔본.pdf"];
    const institutions: ReviewInstitution[] = [];
    for (const [k, file] of uploads.entries()) {
      const r = await recognizePdf(pdf(file), file, { client: fakeOcr });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const name = r.institution.name.value ?? "";
      institutions.push({ ...r.institution, id: `p${k}`, sourceFile: file, matchedName: names.includes(name) ? name : null });
    }
    state = { ...state, review: { files: [], institutions } };

    // ③ 확인·수정 전에는 계산이 잠겨 있다
    const before = checkReview(state.review, conditions.ok ? conditions.conditions : null);
    expect(before.institutions).toBeNull();
    expect(before.unmatched).toEqual(["KB A은행"]);
    expect(before.missing).toBe(1); // C은행 수수료 적용 방식
    expect(before.uncertain).toBeGreaterThan(0); // D은행 AI 인식 값
    expect(recalculate(state).ok).toBe(false);

    // ③ 실무자가 고친다: "같은 기관인가요?" → 같아요, 수수료 방식 선택, 노란 칸 확인
    state.review.institutions[0].matchedName = suggestMatch("KB A은행", names);
    state.review.institutions[2].feeMethod = { value: "whole", status: "ok", confirmed: true };
    state.review.institutions[3] = confirmAll(state.review.institutions[3]);
    const after = checkReview(state.review, conditions.ok ? conditions.conditions : null);
    expect([after.uncertain, after.missing, after.errors, after.unmatched.length]).toEqual([0, 0, 0, 0]);

    // ④ 계산 실행 → answers.md 예시 1 정답
    const calc = recalculate(state);
    expect(calc.ok).toBe(true);
    if (!calc.ok || !calc.state.result) return;
    const result = calc.state.result;
    expect(result.plan.allocations.map((a) => [a.name, a.target, a.yieldMilli])).toEqual([
      ["A은행", 480, 3400],
      ["B증권", 360, 3483],
      ["C은행", 240, 3350],
      ["D은행", 120, 3363],
    ]);
    expect(result.plan.totalYieldMilli).toBe(3411);
    // 허용 오차 기관을 고르지 않았으므로 모든 기관이 목표 금액 그대로 (정답 계산기와 같다)
    const none = oracleAnswer({ ...rawCases[0], toleranceTargets: [] });
    expect([result.plan.moves.minCount.count, result.plan.moves.minCount.amount]).toEqual([none.minCount.count, none.minCount.amount]);
    expect(result.plan.moves.minCount.finalAmounts).toEqual({ A은행: 480, B증권: 360, C은행: 240, D은행: 120 });

    // ④ 툴이 허용 오차를 줄 기관(최대 2곳)을 안내하고, 담당자가 그대로 고쳐 다시 계산한다
    const advice = adviseTolerance(result.targets, { newDeposit: 200, tolerance: 10, toleranceTargets: [] });
    expect(advice?.better).not.toBeNull();
    const chosen = advice!.better!.names;
    expect(chosen.length).toBeLessThanOrEqual(2);
    calc.state.conditions.limits = calc.state.conditions.limits.map((l) => ({ ...l, tolerance: chosen.includes(l.name) }));
    const advised = recalculate(calc.state);
    expect(advised.ok).toBe(true);
    if (!advised.ok || !advised.state.result) return;
    const expected = oracleAnswer({ ...rawCases[0], toleranceTargets: chosen });
    expect([advised.state.result.plan.moves.minCount.count, advised.state.result.plan.moves.minCount.amount]).toEqual([
      expected.minCount.count,
      expected.minCount.amount,
    ]);
    expect(advised.state.result.plan.moves.minCount.count).toBe(advice!.better!.count);
    // 성공 기준 ③: 한도 위반 0건 (억 원 미만 처리 초과 외에는 정확한 값이 한도 이내)
    for (const t of result.targets) expect(t.exact.num / t.exact.den).toBeLessThanOrEqual(t.limitExact);

    // 성공 기준 ⑤: 근거 요약 자동 생성 + 결과 엑셀에 포함
    expect(summaryText(buildSummary(result, "minCount"))).toContain("전체 수수료 차감 수익률은 3.411%");
    const wb = new ExcelJS.Workbook();
    const xlsx = await buildResultWorkbook(result, "minCount");
    await wb.xlsx.load(xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["목표 배분안", "이동 내역", "근거 요약"]);

    // 추가 변수: 허용 오차를 0억으로 바꿔 바로 다시 계산 (성공 기준 ②)
    calc.state.conditions.tolerance = "0";
    const again = recalculate(calc.state);
    expect(again.ok && again.state.result?.plan.moves.minCount.finalAmounts).toEqual({ A은행: 480, B증권: 360, C은행: 240, D은행: 120 });
  });
});
