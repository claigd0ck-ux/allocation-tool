// Design Ref: §3.3 수수료 행 — 구간 전체: 금액이 속한 구간 요율을 전액에, 누진: 구간별로 나눠 적용. 정수 연산
// Plan SC: 작업 5 (수수료 계산). 작업 6(상품별 배분)이 이 값으로 수수료 차감 수익을 비교한다.

import type { Eok, FeeMethod, FeeTier } from "@/lib/domain/types";
import { isEok, RATE_MAX_MILLI } from "@/lib/domain/units";

/**
 * 수수료·수익 금액 단위: 억 원 × 0.001% (정수).
 * 예: 250억에 0.100%(=100) → 25,000. 억 원으로 바꾸려면 100,000으로 나눈다(1억 × 100% = 1억).
 */
export type EokMilli = number;

/** 억 원 × 0.001% 값을 억 원으로 바꿀 때 나누는 수 (화면 표시용, 예: 25,000 ÷ 100,000 = 0.25억). */
export const EOK_MILLI_PER_EOK = 100_000;

/**
 * 수수료 구간 목록이 올바른지 확인하고, 문제를 문장 목록으로 돌려준다 (비어 있으면 정상).
 * - 구간이 하나 이상 있고, 첫 구간은 0억부터 시작한다
 * - 시작 금액은 억 원 정수이고 오름차순이며 겹치지 않는다
 * - 수수료율은 0~20%
 */
export function tierProblems(tiers: readonly FeeTier[]): string[] {
  const problems: string[] = [];
  if (tiers.length === 0) return ["수수료 구간이 없습니다."];
  if (tiers[0].from !== 0) problems.push("첫 수수료 구간은 0억부터 시작해야 합니다.");
  tiers.forEach((t, i) => {
    if (!isEok(t.from) || t.from < 0) problems.push(`${i + 1}번째 구간의 시작 금액은 0 이상의 억 원 정수여야 합니다.`);
    if (i > 0 && t.from <= tiers[i - 1].from) problems.push(`${i + 1}번째 구간의 시작 금액이 앞 구간보다 커야 합니다.`);
    if (!Number.isInteger(t.fee) || t.fee < 0 || t.fee > RATE_MAX_MILLI) {
      problems.push(`${i + 1}번째 구간의 수수료율은 0~20% 사이여야 합니다.`);
    }
  });
  return problems;
}

/**
 * 예치 금액에 붙는 수수료를 억 원 × 0.001% 정수로 계산한다.
 * - whole(구간 전체): 금액이 속한 구간(시작 금액 이상인 마지막 구간)의 요율을 전체 금액에 적용
 *   예: 0억~ 0.15%, 100억~ 0.10% 일 때 250억 → 250 × 0.10%
 * - progressive(누진): 구간마다 그 구간에 해당하는 금액에만 그 구간 요율을 적용
 *   예: 같은 구간에서 250억 → 100억 × 0.15% + 150억 × 0.10%
 * 구간은 tierProblems를 통과한 것(0억부터, 오름차순)이어야 한다.
 */
export function feeUnits(amount: Eok, tiers: readonly FeeTier[], method: FeeMethod): EokMilli {
  if (!isEok(amount) || amount < 0) throw new RangeError(`예치 금액은 0 이상의 억 원 정수여야 합니다: ${amount}`);
  if (tiers.length === 0) throw new RangeError("수수료 구간이 없습니다.");
  if (amount === 0) return 0;

  if (method === "whole") {
    let fee = tiers[0].fee;
    for (const t of tiers) if (amount >= t.from) fee = t.fee;
    return amount * fee;
  }

  let total = 0;
  for (let i = 0; i < tiers.length; i++) {
    const from = tiers[i].from;
    const to = i + 1 < tiers.length ? tiers[i + 1].from : Infinity;
    if (amount > from) total += (Math.min(amount, to) - from) * tiers[i].fee;
  }
  return total;
}
