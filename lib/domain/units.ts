// Design Ref: §1 — 모든 금액은 억 원 정수, 금리·수수료율은 0.001% 정수로 다룬다(오차 방지)
// Plan SC: 작업 1 (단위 규칙). 계산 코드는 소수점 숫자 대신 이 단위만 사용한다.

import type { Eok, Milli } from "./types";

/** 1% = 1000 Milli. */
export const MILLI_PER_PCT = 1000;

/** 금리·수수료율의 허용 범위 상한 (PRD: 0~20%). */
export const RATE_MAX_MILLI: Milli = 20 * MILLI_PER_PCT;

/** 억 원 정수인지 확인한다. */
export function isEok(value: number): value is Eok {
  return Number.isSafeInteger(value);
}

/**
 * % 값을 0.001% 정수로 바꾼다. (예: 3.5 → 3500)
 * 소수 셋째 자리를 넘는 값(예: 0.1234)이나 숫자가 아닌 값은 오류를 낸다.
 */
export function pctToMilli(pct: number): Milli {
  if (!Number.isFinite(pct)) {
    throw new RangeError(`숫자가 아닌 값입니다: ${pct}`);
  }
  const scaled = pct * MILLI_PER_PCT;
  const rounded = Math.round(scaled);
  // 부동소수점 오차(예: 1.005 * 1000)는 허용하되, 실제로 소수 넷째 자리 이상이 있으면 거부한다.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError(`소수 셋째 자리까지만 입력할 수 있습니다: ${pct}`);
  }
  return rounded;
}

/** 0.001% 정수를 화면 표시용 문자열로 바꾼다. (예: 3457 → "3.457%") */
export function formatMilli(milli: Milli): string {
  const sign = milli < 0 ? "-" : "";
  const abs = Math.abs(milli);
  const whole = Math.trunc(abs / MILLI_PER_PCT);
  const frac = String(abs % MILLI_PER_PCT).padStart(3, "0");
  return `${sign}${whole}.${frac}%`;
}

/** 억 원 정수를 화면 표시용 문자열로 바꾼다. (예: 1200 → "1,200억") */
export function formatEok(eok: Eok): string {
  return `${eok.toLocaleString("ko-KR")}억`;
}
