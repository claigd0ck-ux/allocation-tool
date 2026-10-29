// Design Ref: §3.1 ④ 계산 / §3.2 PlanResult — 순위 → 목표 금액 → 상품 배분 → 자금 이동을 한 번에 계산한다
// Plan SC: 작업 8 (계산 검증 통과). 화면(작업 16·20)은 이 함수 하나만 부른다.

import type { Conditions, Eok, Institution, PlanResult } from "@/lib/domain/types";
import { allocateTargets, type TargetAllocation } from "./allocate";
import { allocateProducts } from "./products";
import { planMoves } from "./transfers";

/** 두 이동 방법의 결과가 같을 때 붙이는 안내 문구 (PRD 5절). */
export const SAME_RESULT_NOTICE = "두 방법의 결과가 같습니다. 허용 오차를 늘리면 다른 결과가 나올 수 있습니다.";

/** 어느 단계에서 계산이 멈췄는지 */
export type CalcStage = "target" | "product" | "move";

export interface CalcError {
  stage: CalcStage;
  code: string;
  message: string;
  institution?: string;
}

export type CalcResult =
  | {
      ok: true;
      plan: PlanResult;
      /** 전체 적립금, 1년물·3년물 금액 (억 원) */
      total: Eok;
      amount1y: Eok;
      amount3y: Eok;
      /** 목표 금액 계산의 세부 값 (정확한 값, 억 원 미만 처리로 1억을 받았는지, 한도 등 — 화면·근거 요약용) */
      targets: TargetAllocation[];
      /** 두 방법의 결과가 같으면 안내 문구, 아니면 null */
      notice: string | null;
    }
  | { ok: false; errors: CalcError[] };

/**
 * 확정된 기관 자료와 기초 조건으로 목표 배분안과 두 자금 이동 방법을 계산한다.
 * 숫자는 모두 이 코드가 계산한다(AI는 쓰지 않는다). 단계별 검사에 걸리면 그 단계에서 멈추고 이유 목록을 돌려준다.
 */
export function calculatePlan(institutions: readonly Institution[], conditions: Conditions): CalcResult {
  const targets = allocateTargets(institutions, conditions);
  if (!targets.ok) return fail("target", targets.errors);

  const products = allocateProducts(targets.allocations, targets.total, conditions);
  if (!products.ok) return fail("product", products.errors);

  const moves = planMoves(targets.allocations, conditions);
  if (!moves.ok) return fail("move", moves.errors);

  return {
    ok: true,
    plan: {
      allocations: products.allocations,
      totalYieldMilli: products.totalYieldMilli,
      moves: { minCount: moves.minCount, minAmount: moves.minAmount, same: moves.same },
    },
    total: targets.total,
    amount1y: products.amount1y,
    amount3y: products.amount3y,
    targets: targets.allocations,
    notice: moves.same ? SAME_RESULT_NOTICE : null,
  };
}

function fail(stage: CalcStage, errors: readonly { code: string; message: string; institution?: string }[]): CalcResult {
  return { ok: false, errors: errors.map((e) => ({ stage, ...e })) };
}
