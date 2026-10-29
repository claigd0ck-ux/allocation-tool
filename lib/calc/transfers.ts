// Design Ref: §3.3 이동 금액·횟수 최소 / 이동안 고르는 순서 / 순위 순서 규칙 행 — 허용 오차 안에서 두 기준의 자금 이동 방법을 구한다
// Plan SC: 작업 7 (자금 이동 방법). 성공 기준 ④의 "두 이동 방법의 횟수·금액이 정답과 일치"를 맡는다.

import type { Conditions, Eok, MovePlan, Transfer } from "@/lib/domain/types";
import { isEok } from "@/lib/domain/units";
import type { TargetAllocation } from "./allocate";

/** 신규 예치금을 보내는 쪽의 이름. */
export const NEW_DEPOSIT = "신규";

/**
 * 계산량 상한 = (따져 볼 최종 금액 조합 수) × (조합마다 송금 묶음을 찾는 계산량 2^(기관 수+1) × (기관 수+1)).
 * 넘으면 계산하지 않고 허용 오차를 줄이도록 안내한다. 상한 근처에서 약 2초 (2026-10-29 실측:
 * 4곳 ±10억 10ms, 5곳 ±11억 0.14초, 8곳 ±2억 0.28초, 10곳 ±1억 0.8초, 12곳 ±1억 31초 → 차단).
 */
export const MAX_MOVE_WORK = 1_000_000_000;

export type MoveErrorCode = "TOLERANCE_INVALID" | "AMOUNT_NOT_INTEGER" | "SEARCH_TOO_LARGE" | "NO_PLAN";

export interface MoveError {
  code: MoveErrorCode;
  message: string;
}

export type MoveResult =
  | {
      ok: true;
      minCount: MovePlan;
      minAmount: MovePlan;
      /** 두 방법의 기관별 최종 금액이 같으면 true → "두 방법의 결과가 같습니다…" 안내 */
      same: boolean;
    }
  | { ok: false; errors: MoveError[] };

/** 한 후보(기관별 최종 금액)의 평가 값. */
interface Candidate {
  finals: Eok[];
  count: number;
  amount: Eok;
  /** 목표와의 차이 = 기관별 |최종 금액 − 목표 금액|의 합 */
  deviation: number;
}

/**
 * 현재 잔액에서 목표 배분안으로 옮기는 방법을 두 기준으로 구한다.
 * - 기관별 최종 금액은 목표 ± 허용 오차(0 미만 불가), 합계는 전체 적립금. 한도는 적용하지 않는다.
 * - 순위가 뒤인 기관의 최종 금액이 앞선 기관보다 크면 안 된다(같은 순위끼리는 비교 안 함).
 * - 이동 1회 = "어디서 → 어디로" 송금 1건. 신규 예치금은 "신규"가 보내는 쪽이다.
 *   송금 횟수 = 금액이 바뀌는 쪽의 수 − "주고받는 합이 0인 묶음"의 최대 개수.
 * - 고르는 순서: 최소 이동 횟수 = 횟수 → 금액 → 목표와의 차이 → 순위순으로 최종 금액이 작은 안,
 *   최소 이동 금액 = 금액 → 횟수 → 목표와의 차이 → 같은 순.
 * targets는 allocateTargets 결과(순위 순서)를 그대로 넣는다.
 */
export function planMoves(
  targets: readonly TargetAllocation[],
  conditions: Pick<Conditions, "newDeposit" | "tolerance">,
): MoveResult {
  const { newDeposit, tolerance } = conditions;
  const errors: MoveError[] = [];
  if (!isEok(tolerance) || tolerance < 0) {
    errors.push({ code: "TOLERANCE_INVALID", message: "허용 오차는 0 이상의 억 원 정수여야 합니다." });
  }
  if (!isEok(newDeposit) || newDeposit < 0) {
    errors.push({ code: "AMOUNT_NOT_INTEGER", message: "신규 예치금액은 0 이상의 억 원 정수여야 합니다." });
  }
  if (errors.length > 0) return { ok: false, errors };

  const n = targets.length;
  const existing = targets.map((t) => t.institution.existing);
  const goal = targets.map((t) => t.target);
  const ranks = targets.map((t) => t.rank);
  const total = existing.reduce((s, e) => s + e, 0) + newDeposit;
  // 제외 기관(9곳 이상일 때 하위 2곳)은 허용 오차 없이 반드시 0억 — 잔액을 전액 옮긴다
  const low = targets.map((t) => (t.excluded ? 0 : Math.max(0, t.target - tolerance)));
  const high = targets.map((t) => (t.excluded ? 0 : t.target + tolerance));

  // 마지막으로 정하는 기관의 금액은 합계로 정해지므로, 따질 경우의 수는 나머지 기관 범위의 곱
  const candidates = low.slice(0, -1).reduce((p, l, i) => p * (high[i] - l + 1), 1);
  if (candidates * 2 ** (n + 1) * (n + 1) > MAX_MOVE_WORK) {
    return {
      ok: false,
      errors: [
        {
          code: "SEARCH_TOO_LARGE",
          message: `기관 ${n}곳·허용 오차 ±${tolerance}억으로는 따져 볼 경우가 너무 많아 계산할 수 없습니다. 허용 오차를 줄여 주세요.`,
        },
      ],
    };
  }

  // 뒤쪽 기관들로 만들 수 있는 합계 범위 (남은 금액이 이 안에 있어야 끝까지 채울 수 있다)
  const restLow = suffixSums(low);
  const restHigh = suffixSums(high);

  const best: { count: Candidate | null; amount: Candidate | null } = { count: null, amount: null };
  const finals = new Array<Eok>(n);

  // 순위 순서로, 작은 금액부터 차례로 따진다 → 모든 기준이 같으면 먼저 찾은 안(순위순으로 금액이 작은 안)이 남는다
  const search = (i: number, left: number) => {
    // 순위가 더 앞선 기관 중 가장 작은 최종 금액이 이 기관의 상한이 된다
    let cap = high[i];
    for (let j = 0; j < i; j++) if (ranks[j] < ranks[i]) cap = Math.min(cap, finals[j]);
    const from = Math.max(low[i], left - restHigh[i + 1]);
    const to = Math.min(cap, left - restLow[i + 1]);
    for (let f = from; f <= to; f++) {
      finals[i] = f;
      if (i === n - 1) {
        if (f !== left) continue;
        const c = evaluate(finals, existing, goal, newDeposit);
        if (!best.count || compare(c, best.count, "count") < 0) best.count = c;
        if (!best.amount || compare(c, best.amount, "amount") < 0) best.amount = c;
      } else {
        search(i + 1, left - f);
      }
    }
  };
  if (n > 0) search(0, total);

  const { count: byCount, amount: byAmount } = best;
  if (!byCount || !byAmount) {
    return { ok: false, errors: [{ code: "NO_PLAN", message: "규칙을 모두 지키는 이동 방법이 없습니다." }] };
  }
  const names = targets.map((t) => t.institution.name);
  return {
    ok: true,
    minCount: toPlan(byCount, names, existing, newDeposit),
    minAmount: toPlan(byAmount, names, existing, newDeposit),
    same: byCount.finals.every((f, i) => f === byAmount.finals[i]),
  };
}

/** 최종 금액 한 조합의 이동 횟수·금액·목표와의 차이를 구한다. */
function evaluate(finals: readonly Eok[], existing: readonly Eok[], goal: readonly Eok[], newDeposit: Eok): Candidate {
  const flows = partsOf(finals, existing, newDeposit).map((p) => p.out);
  const amount = flows.reduce((s, v) => (v < 0 ? s - v : s), 0);
  const count = flows.length - maxZeroGroups(flows);
  const deviation = finals.reduce((s, f, i) => s + Math.abs(f - goal[i]), 0);
  return { finals: [...finals], count, amount, deviation };
}

/** 두 후보 비교: 음수면 a가 더 좋은 안. */
function compare(a: Candidate, b: Candidate, first: "count" | "amount"): number {
  const primary = first === "count" ? a.count - b.count || a.amount - b.amount : a.amount - b.amount || a.count - b.count;
  if (primary !== 0) return primary;
  if (a.deviation !== b.deviation) return a.deviation - b.deviation;
  for (let i = 0; i < a.finals.length; i++) if (a.finals[i] !== b.finals[i]) return a.finals[i] - b.finals[i];
  return 0;
}

/** 금액이 바뀌는 쪽 목록. out > 0이면 보내는 쪽, out < 0이면 받는 쪽. */
function partsOf(finals: readonly Eok[], existing: readonly Eok[], newDeposit: Eok, names?: readonly string[]) {
  const parts = [{ name: NEW_DEPOSIT, out: newDeposit }, ...finals.map((f, i) => ({ name: names?.[i] ?? "", out: existing[i] - f }))];
  return parts.filter((p) => p.out !== 0);
}

/**
 * 주고받는 합이 0인 묶음을 최대 몇 개로 나눌 수 있는지 구한다(부분집합 동적계획법).
 * 묶음 하나 안에서 k곳이 주고받으면 송금은 k − 1건이면 충분하므로, 묶음이 많을수록 송금이 줄어든다.
 */
function maxZeroGroups(flows: readonly number[]): number {
  return zeroGroupTable(flows).best[(1 << flows.length) - 1];
}

function zeroGroupTable(flows: readonly number[]) {
  const size = 1 << flows.length;
  const sum = new Array<number>(size).fill(0);
  const best = new Array<number>(size).fill(0);
  for (let m = 1; m < size; m++) {
    const lowBit = 31 - Math.clz32(m & -m);
    sum[m] = sum[m & (m - 1)] + flows[lowBit];
    let b = 0;
    for (let i = 0; i < flows.length; i++) if (m & (1 << i)) b = Math.max(b, best[m ^ (1 << i)]);
    best[m] = b + (sum[m] === 0 ? 1 : 0);
  }
  return { sum, best };
}

/** 고른 후보로 송금 내역을 만든다: 합이 0인 묶음끼리 나눈 뒤, 묶음 안에서 보내는 쪽 → 받는 쪽으로 차례로 채운다. */
function toPlan(c: Candidate, names: readonly string[], existing: readonly Eok[], newDeposit: Eok): MovePlan {
  const parts = partsOf(c.finals, existing, newDeposit, names);
  const { sum, best } = zeroGroupTable(parts.map((p) => p.out));

  // 묶음 경계가 드러나도록 쪽들의 순서를 되짚는다
  const order: number[] = [];
  let m = (1 << parts.length) - 1;
  while (m) {
    for (let i = 0; i < parts.length; i++) {
      if (m & (1 << i) && best[m] === best[m ^ (1 << i)] + (sum[m] === 0 ? 1 : 0)) {
        order.unshift(i);
        m ^= 1 << i;
        break;
      }
    }
  }

  const transfers: Transfer[] = [];
  let group: { name: string; out: number }[] = [];
  let acc = 0;
  for (const i of order) {
    group.push({ ...parts[i] });
    acc += parts[i].out;
    if (acc !== 0) continue;
    const give = group.filter((p) => p.out > 0);
    const take = group.filter((p) => p.out < 0);
    let g = 0;
    let t = 0;
    while (g < give.length && t < take.length) {
      const x = Math.min(give[g].out, -take[t].out);
      transfers.push({ from: give[g].name, to: take[t].name, amount: x });
      give[g].out -= x;
      take[t].out += x;
      if (give[g].out === 0) g++;
      if (take[t].out === 0) t++;
    }
    group = [];
  }

  return {
    finalAmounts: Object.fromEntries(names.map((name, i) => [name, c.finals[i]])),
    count: c.count,
    amount: c.amount,
    transfers,
  };
}

/** suffix[i] = values[i] + … + values[끝], suffix[길이] = 0 */
function suffixSums(values: readonly number[]): number[] {
  const out = new Array<number>(values.length + 1).fill(0);
  for (let i = values.length - 1; i >= 0; i--) out[i] = out[i + 1] + values[i];
  return out;
}
