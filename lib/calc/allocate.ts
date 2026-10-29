// Design Ref: §3.3 순위·목표 금액 / 한도 확인 행, §5 사전 검사 — 순위별 배분비율로 기관별 목표 금액을 정한다
// Plan SC: 작업 4 (기관별 목표 금액). 성공 기준 ③(한도 위반 0건)과 ④(정답 일치)를 맡는다.

import type { Conditions, Eok, Institution } from "@/lib/domain/types";
import { isEok, pctToMilli } from "@/lib/domain/units";
import { includedCount } from "./exclusion";
import { rankByScore } from "./rank";

/** 100% = 100 × 1000 (0.001% 단위). */
const FULL_PCT_MILLI = 100_000;

export type AllocationErrorCode =
  | "NO_INSTITUTIONS"
  | "AMOUNT_NOT_INTEGER"
  | "EXISTING_MISMATCH"
  | "INVALID_PCT"
  | "RATIO_COUNT"
  | "RATIO_SUM"
  | "RATIO_ORDER"
  | "LIMIT_MISSING"
  | "LIMIT_SUM"
  | "OVER_LIMIT"
  | "EXCLUSION_TIE";

/** 계산을 막는 이유 하나. 화면에 그대로 보여줄 수 있는 문장을 담는다. */
export interface AllocationError {
  code: AllocationErrorCode;
  message: string;
  institution?: string;
}

/** 기관 하나의 목표 금액 계산 결과. */
export interface TargetAllocation {
  institution: Institution;
  rank: number;
  /** 이 기관에 적용된 배분비율(%). 동점이면 차지한 순위들의 비율을 합쳐 나눈 값 (예: 25). */
  ratioPct: number;
  /** 억 원 미만 처리 전 정확한 값 = num ÷ den (억 원). 분수로 들고 있어 오차가 없다. */
  exact: { num: number; den: number };
  /** 목표 금액 (억 원 정수). */
  target: Eok;
  /** 억 원 미만 처리에서 남는 금액 1억을 받았는지. */
  roundedUp: boolean;
  /** 한도 (억 원, 정확한 값). */
  limitExact: number;
  /** 억 원 미만 처리 때문에 1억 미만으로 한도를 넘었는지 (PRD상 허용, 화면 안내용). */
  overLimitByRounding: boolean;
  /** 기관이 9곳 이상이라 평가 하위 2곳에 들어 배분에서 제외됐는지 (목표 0억, 잔액은 전액 이동). */
  excluded: boolean;
}

export type TargetResult =
  | { ok: true; total: Eok; allocations: TargetAllocation[] }
  | { ok: false; errors: AllocationError[] };

/**
 * 기관별 목표 금액을 계산한다.
 * 1) 평가 점수로 순위를 매기고, 동점은 차지한 순위들의 배분비율을 합쳐 똑같이 나눈다.
 * 2) 억 원 미만은 버리고, 모자란 합계는 버린 소수점이 큰 기관부터 1억씩 더한다(같으면 순위가 높은 기관 먼저).
 * 3) 한도는 억 원 미만 처리 전 정확한 값으로 확인한다. 넘으면 계산을 막는다.
 * 기관이 9곳 이상이면 평가 하위 2곳은 목표 0억으로 제외하고, 배분비율은 남는 기관 수만큼 받는다(경계 동점이면 막는다).
 * 계산 전 검사(비율·한도 합계, 순서, 기존 예치금액 일치 등)에 걸리면 이유 목록을 돌려준다.
 */
export function allocateTargets(institutions: readonly Institution[], conditions: Conditions): TargetResult {
  if (institutions.length === 0) {
    return { ok: false, errors: [{ code: "NO_INSTITUTIONS", message: "예치기관이 없습니다." }] };
  }

  const errors: AllocationError[] = [];
  const kept = includedCount(institutions.length);
  checkAmounts(institutions, conditions, errors);
  const ratioMilli = checkRatios(kept, institutions.length, conditions.rankRatios, errors);
  const limitMilli = checkLimits(institutions, conditions.limits, errors);
  const groups = rankByScore(institutions);
  // 제외 경계(남는 마지막 순위와 제외되는 첫 순위)에 동점이 걸치면 누구를 뺄지 정할 수 없다
  const straddling = groups.find((g) => g.start < kept && g.start + g.members.length > kept);
  if (straddling) {
    errors.push({
      code: "EXCLUSION_TIE",
      message: `기관이 ${institutions.length}곳이라 평가 하위 ${institutions.length - kept}곳을 제외해야 하는데, ${straddling.members
        .map((m) => m.name)
        .join("·")}의 평가 점수(${straddling.score}점)가 같아 누구를 제외할지 정할 수 없습니다. 평가 점수를 확인해 주세요.`,
    });
  }
  if (errors.length > 0 || !ratioMilli || !limitMilli) return { ok: false, errors };

  const total = institutions.reduce((sum, i) => sum + i.existing, 0) + conditions.newDeposit;

  // 1) 순위별 배분비율 적용 (동점은 합쳐서 균등 분할). 정확한 값 = total × 비율합 ÷ (100% × 묶인 기관 수)
  //    제외 기관(하위 2곳)은 목표 0억
  const rows = groups.flatMap((group) => {
    const k = group.members.length;
    if (group.start >= kept) {
      return group.members.map((institution) => ({ institution, rank: group.rank, ratioPct: 0, num: 0, den: 1, floor: 0, rem: 0, excluded: true }));
    }
    const ratioSum = ratioMilli.slice(group.start, group.start + k).reduce((s, r) => s + r, 0);
    const num = total * ratioSum;
    const den = FULL_PCT_MILLI * k;
    const floor = Math.floor(num / den);
    return group.members.map((institution) => ({
      institution,
      rank: group.rank,
      ratioPct: ratioSum / k / 1000,
      num,
      den,
      floor,
      rem: num - floor * den,
      excluded: false,
    }));
  });

  // 2) 억 원 미만 처리: 남는 금액을 소수점이 큰 기관부터 1억씩 (같으면 순위가 높은 기관 먼저, 그다음 입력 순서)
  const remainder = total - rows.reduce((s, r) => s + r.floor, 0);
  const byFraction = [...rows].sort((a, b) => b.rem * a.den - a.rem * b.den || a.rank - b.rank);
  const roundedUp = new Set(byFraction.slice(0, remainder));

  const allocations: TargetAllocation[] = rows.map((r) => {
    const target = r.floor + (roundedUp.has(r) ? 1 : 0);
    const limit = limitMilli.get(r.institution.name)!;
    return {
      institution: r.institution,
      rank: r.rank,
      ratioPct: r.ratioPct,
      exact: { num: r.num, den: r.den },
      target,
      roundedUp: roundedUp.has(r),
      limitExact: (total * limit) / FULL_PCT_MILLI,
      overLimitByRounding: target * FULL_PCT_MILLI > total * limit,
      excluded: r.excluded,
    };
  });

  // 3) 한도 확인 — 정확한 값(num/den)이 한도(total × limit / 100%)를 넘으면 막는다. 큰 수라 BigInt로 비교한다.
  for (const a of allocations) {
    const limit = limitMilli.get(a.institution.name)!;
    const over = BigInt(a.exact.num) * BigInt(FULL_PCT_MILLI) > BigInt(total) * BigInt(limit) * BigInt(a.exact.den);
    if (over) {
      errors.push({
        code: "OVER_LIMIT",
        institution: a.institution.name,
        message: `${a.institution.name}의 배분 금액(${formatExact(a.exact)}억)이 한도(${a.limitExact}억)를 넘습니다.`,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, total, allocations };
}

/** 금액이 억 원 정수인지, 기존 예치금액이 기관별 잔액 합과 같은지 확인한다. */
function checkAmounts(institutions: readonly Institution[], conditions: Conditions, errors: AllocationError[]) {
  const notAmount = (v: number) => !isEok(v) || v < 0;
  for (const i of institutions) {
    if (notAmount(i.existing)) {
      errors.push({ code: "AMOUNT_NOT_INTEGER", institution: i.name, message: `${i.name}의 현재 잔액은 0 이상의 억 원 정수여야 합니다.` });
    }
  }
  if (notAmount(conditions.newDeposit)) {
    errors.push({ code: "AMOUNT_NOT_INTEGER", message: "신규 예치금액은 0 이상의 억 원 정수여야 합니다." });
  }
  if (notAmount(conditions.existingTotal)) {
    errors.push({ code: "AMOUNT_NOT_INTEGER", message: "기존 예치금액은 0 이상의 억 원 정수여야 합니다." });
  }
  const existingSum = institutions.reduce((s, i) => s + i.existing, 0);
  if (existingSum !== conditions.existingTotal) {
    errors.push({
      code: "EXISTING_MISMATCH",
      message: `입력한 기존 예치금액(${conditions.existingTotal}억)이 기관별 현재 잔액의 합(${existingSum}억)과 다릅니다.`,
    });
  }
}

/** 순위별 배분비율: 개수 = 배분에 남는 기관 수, 합계 100%, 순위순으로 같거나 작아야 한다. 통과하면 0.001% 정수 배열. */
function checkRatios(count: number, institutionCount: number, ratios: readonly number[], errors: AllocationError[]): number[] | null {
  const milli = toMilliList(ratios, "순위별 배분비율", errors);
  if (!milli) return null;
  let ok = true;
  if (milli.length !== count) {
    const why = count === institutionCount ? `기관 수(${count}곳)만큼` : `평가 하위 ${institutionCount - count}곳을 뺀 ${count}곳만큼`;
    errors.push({ code: "RATIO_COUNT", message: `순위별 배분비율은 ${why} 입력해야 합니다. 지금 ${milli.length}개입니다.` });
    ok = false;
  }
  const sum = milli.reduce((s, r) => s + r, 0);
  if (sum !== FULL_PCT_MILLI) {
    errors.push({ code: "RATIO_SUM", message: `순위별 배분비율의 합이 100%가 아닙니다. 지금 ${sum / 1000}%입니다.` });
    ok = false;
  }
  if (milli.some((r, i) => i > 0 && r > milli[i - 1])) {
    errors.push({ code: "RATIO_ORDER", message: "순위별 배분비율은 1위부터 순서대로 같거나 작아야 합니다." });
    ok = false;
  }
  return ok ? milli : null;
}

/** 기관별 한도: 모든 기관에 있어야 하고 합계 100%. 통과하면 기관 이름 → 0.001% 정수. */
function checkLimits(
  institutions: readonly Institution[],
  limits: Conditions["limits"],
  errors: AllocationError[],
): Map<string, number> | null {
  const milli = toMilliList(limits.map((l) => l.limitPct), "배분 한도", errors);
  if (!milli) return null;
  const byName = new Map(limits.map((l, i) => [l.name, milli[i]]));
  let ok = true;
  for (const i of institutions) {
    if (!byName.has(i.name)) {
      errors.push({ code: "LIMIT_MISSING", institution: i.name, message: `${i.name}의 배분 한도가 입력되지 않았습니다.` });
      ok = false;
    }
  }
  const sum = institutions.reduce((s, i) => s + (byName.get(i.name) ?? 0), 0);
  if (ok && sum !== FULL_PCT_MILLI) {
    errors.push({ code: "LIMIT_SUM", message: `기관별 배분 한도의 합이 100%가 아닙니다. 지금 ${sum / 1000}%입니다.` });
    ok = false;
  }
  return ok ? byName : null;
}

/** % 목록을 0.001% 정수로 바꾼다. 음수나 소수 넷째 자리 이상은 오류로 기록한다. */
function toMilliList(values: readonly number[], label: string, errors: AllocationError[]): number[] | null {
  try {
    const milli = values.map(pctToMilli);
    if (milli.some((m) => m < 0)) throw new RangeError(`${label}은 0% 이상이어야 합니다.`);
    return milli;
  } catch (e) {
    errors.push({ code: "INVALID_PCT", message: `${label}: ${(e as Error).message}` });
    return null;
  }
}

/** 분수 금액을 소수 첫째 자리까지 표시한다 (예: 370.8). */
function formatExact({ num, den }: { num: number; den: number }): string {
  return (Math.round((num / den) * 10) / 10).toString();
}
