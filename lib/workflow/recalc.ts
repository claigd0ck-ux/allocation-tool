// Design Ref: §2.2 ④ [조건 수정 후 다시 계산] — 조건을 고친 뒤 ③을 다시 거치지 않고 바로 계산한다
// Plan SC: 작업 20, 성공 기준 ②(추가 변수 발생 시 10분 이내 재계산)

import { calculatePlan } from "@/lib/calc";
import { checkReview } from "@/lib/review/review";
import type { WorkState } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";

export type Recalc = { ok: true; state: WorkState } | { ok: false; reasons: string[] };

/**
 * 지금 작업 데이터로 다시 계산한다. 기초 조건 검사 → 확인·수정 상태 점검 → 계산 순서로,
 * 하나라도 걸리면 이유를 돌려준다. 성공하면 결과를 담고 ④ 계산 결과 단계로 옮긴 작업 데이터를 돌려준다.
 */
export function recalculate(state: WorkState): Recalc {
  const conditions = checkConditions(state.conditions);
  if (!conditions.ok) return { ok: false, reasons: ["① 기초 조건의 빨간 칸을 먼저 고쳐 주세요."] };

  const review = checkReview(state.review, conditions.conditions);
  if (!review.institutions) {
    const reasons = [...review.problems];
    const pending = review.uncertain + review.missing + review.errors;
    if (pending > 0) reasons.push(`③ 확인·수정에 확인할 항목이 ${pending}개 남아 있습니다.`);
    if (review.unmatched.length + review.onlyInConditions.length + review.duplicated.length > 0) {
      reasons.push("③ 확인·수정에서 기관 짝 맞추기를 끝내 주세요 (기관 명단이 바뀌었으면 다시 연결해야 합니다).");
    }
    return { ok: false, reasons: reasons.length > 0 ? reasons : ["③ 확인·수정을 먼저 끝내 주세요."] };
  }

  const result = calculatePlan(review.institutions, conditions.conditions);
  if (!result.ok) return { ok: false, reasons: result.errors.map((e) => e.message) };
  return { ok: true, state: { ...state, result, summary: null, step: 4 } };
}
