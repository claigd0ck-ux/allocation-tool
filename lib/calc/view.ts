// Design Ref: §2.2 ④ 계산 결과 — 화면·엑셀·근거 요약이 함께 쓰는 결과 표 만들기 (계산은 하지 않고 결과를 정리만 한다)
// Plan SC: 작업 16 (결과 화면), 17 (근거 요약), 18 (결과 엑셀)

import type { Eok, Milli, MovePlan } from "@/lib/domain/types";
import type { MoveChoice } from "@/lib/storage/workState";
import type { CalcResult } from "./index";

export type CalcSuccess = Extract<CalcResult, { ok: true }>;

export interface AllocationRow {
  rank: number;
  name: string;
  score: number;
  existing: Eok;
  ratioPct: number;
  /** 억 원 미만 처리 전 정확한 값 (억 원) */
  exact: number;
  target: Eok;
  amount1y: Eok;
  amount3y: Eok;
  yieldMilli: Milli;
  limitExact: number;
  roundedUp: boolean;
  overLimitByRounding: boolean;
}

/** 목표 배분안을 기관별 한 줄씩 정리한다 (순위 순서). */
export function allocationRows(r: CalcSuccess): AllocationRow[] {
  return r.plan.allocations.map((a, i) => {
    const t = r.targets[i];
    const maturityOf = (productName: string) => t.institution.products.find((p) => p.name === productName)?.maturity;
    const sumBy = (m: "1y" | "3y") => a.products.filter((p) => maturityOf(p.name) === m).reduce((s, p) => s + p.amount, 0);
    return {
      rank: a.rank,
      name: a.name,
      score: t.institution.score,
      existing: t.institution.existing,
      ratioPct: t.ratioPct,
      exact: t.exact.num / t.exact.den,
      target: a.target,
      amount1y: sumBy("1y"),
      amount3y: sumBy("3y"),
      yieldMilli: a.yieldMilli,
      limitExact: t.limitExact,
      roundedUp: t.roundedUp,
      overLimitByRounding: t.overLimitByRounding,
    };
  });
}

export const MOVE_LABEL: Record<MoveChoice, string> = {
  minCount: "최소 이동 횟수",
  minAmount: "최소 이동 금액",
};

export function movePlanOf(r: CalcSuccess, choice: MoveChoice): MovePlan {
  return r.plan.moves[choice];
}
