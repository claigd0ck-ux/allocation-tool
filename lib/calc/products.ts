// Design Ref: §3.3 상품 배분·3년물 금액 행 — 3년물 총합을 맞추면서 전체 수수료 차감 수익이 최대인 1년물·3년물 배분(동적계획법)
// Plan SC: 작업 6 (상품별 배분). 목표 배분안(기관·상품별 금액, 수익률)이 여기서 완성된다.

import type { Allocation, Conditions, Eok, Institution, Milli, Product } from "@/lib/domain/types";
import { isEok, pctToMilli, RATE_MAX_MILLI } from "@/lib/domain/units";
import type { TargetAllocation } from "./allocate";
import { feeUnits, tierProblems, type EokMilli } from "./fee";

const FULL_PCT_MILLI = 100_000;

export type ProductErrorCode =
  | "PRODUCT_SHAPE"
  | "TIER_INVALID"
  | "RATE_RANGE"
  | "MIX_INVALID"
  | "AMOUNT3Y_REQUIRED"
  | "AMOUNT3Y_INVALID";

export interface ProductError {
  code: ProductErrorCode;
  message: string;
  institution?: string;
}

export type ProductResult =
  | {
      ok: true;
      /** 순위 순서의 기관별 목표 배분안 (상품별 금액·수익률 포함) */
      allocations: Allocation[];
      /** 전체 3년물 금액 / 1년물 금액 (억 원) */
      amount3y: Eok;
      amount1y: Eok;
      /** 전체 수수료 차감 수익 (억 원 × 0.001%) */
      totalNet: EokMilli;
      /** 전체 수수료 차감 수익률 = 전체 수익 ÷ 전체 적립금, 소수 넷째 자리에서 반올림 */
      totalYieldMilli: Milli;
    }
  | { ok: false; errors: ProductError[] };

/**
 * 수익률(0.001% 정수)을 구한다: 수익 ÷ 금액을 소수 넷째 자리에서 반올림(사사오입).
 * 예: 3.4567% → 3.457%. 반올림한 값을 다시 더하지 않고, 전체 수익률은 정확한 수익 합으로 계산한다.
 */
export function yieldMilli(net: EokMilli, amount: Eok): Milli {
  if (amount <= 0) throw new RangeError("수익률은 금액이 0보다 클 때만 구할 수 있습니다.");
  return Math.floor((2 * net + amount) / (2 * amount));
}

/** 상품 하나에 amount억을 넣었을 때 수수료 차감 수익 = 금리 × 금액 − 수수료. */
function productNet(amount: Eok, product: Product, institution: Institution): EokMilli {
  return amount * product.rate - feeUnits(amount, product.tiers, institution.feeMethod);
}

/**
 * 기관별 목표 금액을 그 기관의 1년물·3년물 상품에 나눈다.
 * - 전체 3년물 합계 = 전체 적립금 × 3년물 비율 (정수가 아니면 실무자가 정한 conditions.amount3y)
 * - 그 조건 안에서 모든 기관의 수수료 차감 수익 합이 가장 큰 조합을 찾는다. 기관마다 만기 비율은 달라도 된다.
 * - 수익이 같은 조합이 여럿이면, 순위가 높은 기관부터 3년물이 적은(1년물이 많은) 조합을 고른다.
 */
export function allocateProducts(
  targets: readonly TargetAllocation[],
  total: Eok,
  conditions: Pick<Conditions, "maturityMix" | "amount3y">,
): ProductResult {
  const errors: ProductError[] = [];
  const shapes = targets.map((t) => productShape(t.institution, errors));
  const amount3y = resolveAmount3y(total, conditions, errors);
  if (errors.length > 0 || amount3y === null) return { ok: false, errors };

  // 기관마다: 3년물 금액 s(0 ~ 목표)일 때의 수익
  const options = targets.map((t, i) => {
    const { y1, y3 } = shapes[i]!;
    return Array.from({ length: t.target + 1 }, (_, s) => productNet(t.target - s, y1, t.institution) + productNet(s, y3, t.institution));
  });

  // 동적계획법: 기관을 순위 순서로 하나씩 더하며, "지금까지 3년물 합 → (최대 수익, 기관별 3년물 금액)"을 기록한다
  type State = { net: EokMilli; picks: Eok[] };
  let states = new Map<Eok, State>([[0, { net: 0, picks: [] }]]);
  for (const nets of options) {
    const next = new Map<Eok, State>();
    for (const [sum, state] of states) {
      for (let s = 0; s < nets.length && sum + s <= amount3y; s++) {
        const candidate: State = { net: state.net + nets[s], picks: [...state.picks, s] };
        const current = next.get(sum + s);
        if (!current || candidate.net > current.net || (candidate.net === current.net && lexLess(candidate.picks, current.picks))) {
          next.set(sum + s, candidate);
        }
      }
    }
    states = next;
  }
  const best = states.get(amount3y);
  if (!best) {
    // 목표 금액 합 = 전체 적립금 ≥ 3년물 금액이므로 이론상 오지 않는다
    return { ok: false, errors: [{ code: "AMOUNT3Y_INVALID", message: "3년물 금액을 기관들에 나눌 수 없습니다." }] };
  }

  const allocations: Allocation[] = targets.map((t, i) => {
    const { y1, y3 } = shapes[i]!;
    const s = best.picks[i];
    const amountOf = (p: Product) => (p === y3 ? s : t.target - s);
    const products = t.institution.products.map((p) => {
      const amount = amountOf(p);
      return { name: p.name, amount, yieldMilli: amount > 0 ? yieldMilli(productNet(amount, p, t.institution), amount) : null };
    });
    const net = productNet(t.target - s, y1, t.institution) + productNet(s, y3, t.institution);
    return {
      name: t.institution.name,
      rank: t.rank,
      target: t.target,
      products,
      yieldMilli: t.target > 0 ? yieldMilli(net, t.target) : 0,
    };
  });

  return {
    ok: true,
    allocations,
    amount3y,
    amount1y: total - amount3y,
    totalNet: best.net,
    totalYieldMilli: total > 0 ? yieldMilli(best.net, total) : 0,
  };
}

/** 기관의 상품 구성 확인: 1년물·3년물이 하나씩, 금리 0~20%, 수수료 구간 정상. */
function productShape(institution: Institution, errors: ProductError[]): { y1: Product; y3: Product } | null {
  const y1s = institution.products.filter((p) => p.maturity === "1y");
  const y3s = institution.products.filter((p) => p.maturity === "3y");
  const name = institution.name;
  if (y1s.length !== 1 || y3s.length !== 1 || institution.products.length !== 2) {
    errors.push({ code: "PRODUCT_SHAPE", institution: name, message: `${name}은 1년물과 3년물 상품을 하나씩 제시해야 합니다.` });
    return null;
  }
  for (const p of institution.products) {
    if (!Number.isInteger(p.rate) || p.rate < 0 || p.rate > RATE_MAX_MILLI) {
      errors.push({ code: "RATE_RANGE", institution: name, message: `${p.name}의 금리는 0~20% 사이여야 합니다.` });
    }
    for (const problem of tierProblems(p.tiers)) {
      errors.push({ code: "TIER_INVALID", institution: name, message: `${p.name}: ${problem}` });
    }
  }
  return { y1: y1s[0], y3: y3s[0] };
}

/** 전체 3년물 금액을 정한다. 전체 × 3년물 비율이 정수면 그 값, 아니면 실무자가 정한 금액이 있어야 한다. */
function resolveAmount3y(
  total: Eok,
  { maturityMix, amount3y }: Pick<Conditions, "maturityMix" | "amount3y">,
  errors: ProductError[],
): Eok | null {
  let mix3: number;
  try {
    mix3 = pctToMilli(maturityMix["3y"]);
    const mix1 = pctToMilli(maturityMix["1y"]);
    if (mix1 < 0 || mix3 < 0 || mix1 + mix3 !== FULL_PCT_MILLI) throw new RangeError("1년물과 3년물 비율의 합이 100%여야 합니다.");
  } catch (e) {
    errors.push({ code: "MIX_INVALID", message: `만기 구성 비율: ${(e as Error).message}` });
    return null;
  }

  const num = total * mix3;
  if (num % FULL_PCT_MILLI === 0) return num / FULL_PCT_MILLI;

  const exact = num / FULL_PCT_MILLI;
  const lower = Math.floor(exact);
  if (amount3y === undefined) {
    errors.push({
      code: "AMOUNT3Y_REQUIRED",
      message: `3년물 금액(${total}억 × ${maturityMix["3y"]}% = ${exact}억)이 억 원 정수가 아닙니다. ${lower}억 또는 ${lower + 1}억처럼 3년물 금액을 정해 주세요.`,
    });
    return null;
  }
  if (!isEok(amount3y) || amount3y < 0 || amount3y > total) {
    errors.push({ code: "AMOUNT3Y_INVALID", message: `3년물 금액은 0억~${total}억 사이의 억 원 정수여야 합니다.` });
    return null;
  }
  return amount3y;
}

/** 배열을 앞에서부터 비교해 a가 더 작으면 true. */
function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
