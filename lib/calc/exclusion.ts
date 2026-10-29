// PRD 5절 ② (2026-10-29 추가) — 기관이 9곳 이상이면 평가 하위 2곳은 배분에서 제외한다
// 제외 기관의 목표 금액은 0억이고, 현재 잔액은 전액 다른 기관으로 옮긴다(허용 오차 적용 안 함).

/** 이 수 이상이면 하위 기관을 제외한다 */
export const EXCLUSION_THRESHOLD = 9;
/** 제외하는 하위 기관 수 */
export const EXCLUDED_COUNT = 2;

/** 배분에 남는 기관 수 (= 입력해야 하는 순위별 배분비율 개수) */
export function includedCount(institutionCount: number): number {
  return institutionCount >= EXCLUSION_THRESHOLD ? institutionCount - EXCLUDED_COUNT : institutionCount;
}
