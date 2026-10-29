// PRD 5절 ② (2026-10-29 추가) — 허용 오차는 담당자가 고른 최대 2곳에만. 툴은 "어느 기관에 주면 가장 적게 옮기는지"를 안내한다
// 계산량이 허용 오차 기관 수에 따라 급격히 늘어나므로(DESIGN 6절 4번) 3곳 미만으로 제한한다.

import type { Conditions, Eok } from "@/lib/domain/types";
import type { TargetAllocation } from "./allocate";
import { planMoves } from "./transfers";

/** 허용 오차를 줄 수 있는 기관 수의 최대 (3곳 미만) */
export const MAX_TOLERANCE_TARGETS = 2;

export interface ToleranceOption {
  names: string[];
  count: number;
  amount: Eok;
}

export interface ToleranceAdvice {
  /** 지금 고른 기관으로 계산한 결과 */
  current: ToleranceOption;
  /** 가장 적게 옮기는 기관 조합 (최소 이동 횟수 → 이동 금액 → 고른 기관 수 → 순위 순). 지금 고른 것과 같으면 null */
  better: ToleranceOption | null;
}

/**
 * 허용 오차를 줄 기관을 추천한다. 배분 대상 기관(제외 기관 빼고) 중 최대 2곳의 모든 조합을 따져,
 * 최소 이동 횟수 기준으로 가장 적게 옮기는 조합을 찾는다. 허용 오차가 0이면 추천하지 않는다.
 */
export function adviseTolerance(targets: readonly TargetAllocation[], conditions: Pick<Conditions, "newDeposit" | "tolerance" | "toleranceTargets">): ToleranceAdvice | null {
  const run = (names: string[]): ToleranceOption | null => {
    const r = planMoves(targets, { ...conditions, toleranceTargets: names });
    return r.ok ? { names, count: r.minCount.count, amount: r.minCount.amount } : null;
  };
  const current = run(conditions.toleranceTargets ?? []);
  if (!current || conditions.tolerance <= 0) return current ? { current, better: null } : null;

  const eligible = targets.filter((t) => !t.excluded).map((t) => t.institution.name);
  const subsets: string[][] = [[]];
  for (let i = 0; i < eligible.length; i++) {
    subsets.push([eligible[i]]);
    if (MAX_TOLERANCE_TARGETS >= 2) for (let j = i + 1; j < eligible.length; j++) subsets.push([eligible[i], eligible[j]]);
  }

  // 비교 순서: 이동 횟수 → 이동 금액 → 고른 기관 수 (모두 같으면 먼저 찾은 = 순위가 높은 기관 조합)
  const rank = (o: ToleranceOption) => [o.count, o.amount, o.names.length];
  const less = (a: ToleranceOption, b: ToleranceOption) => {
    const [x, y] = [rank(a), rank(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
    return false;
  };
  let best: ToleranceOption | null = null;
  for (const names of subsets) {
    const o = run(names);
    if (o && (!best || less(o, best))) best = o;
  }
  if (!best) return { current, better: null };
  const improves = best.count < current.count || (best.count === current.count && best.amount < current.amount);
  return { current, better: improves ? best : null };
}
