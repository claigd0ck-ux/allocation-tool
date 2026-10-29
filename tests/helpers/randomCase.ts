// Design Ref: §8 — 임의 생성 입력으로 계산 코드와 정답을 비교하기 위한 입력 생성기
// Plan SC: 작업 2 (검증 하니스). 같은 seed면 항상 같은 입력이 나온다(실패를 다시 재현할 수 있다).

import type { RawCase } from "./cases";

/** 간단한 난수 생성기 (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 규칙에 맞는 임의 입력 한 건을 만든다.
 * - 기관 3~4곳, 점수는 일부러 겹치게 만들어 동점이 자주 나오게 한다
 * - 순위별 배분비율은 내림차순, 합계 100
 * - 전체 적립금은 10의 배수, 3년물 비율 10% → 3년물 금액이 항상 억 원 정수
 */
export function randomCase(seed: number): RawCase {
  const rand = rng(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const n = int(3, 4);

  // 순위별 배분비율: 내림차순 정수, 합계 100
  const weights = Array.from({ length: n }, () => int(5, 40)).sort((x, y) => y - x);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const rankRatios = weights.map((w) => Math.floor((w * 100) / weightSum));
  rankRatios[0] += 100 - rankRatios.reduce((s, r) => s + r, 0);

  const scorePool = [95, 90, 90, 85, 80, 80];
  const institutions = Array.from({ length: n }, (_, i) => {
    const feeMethod = rand() < 0.5 ? ("whole" as const) : ("progressive" as const);
    const rate1 = 3.3 + int(0, 12) * 0.05;
    const rate3 = 3.7 + int(0, 8) * 0.05;
    const tierFrom = int(5, 25) * 10;
    const makeTiers = () => {
      const first = int(1, 5) * 0.05;
      return rand() < 0.5
        ? [{ from: 0, fee: round3(first) }]
        : [
            { from: 0, fee: round3(first) },
            { from: tierFrom, fee: round3(Math.max(0.01, first - int(1, 3) * 0.02)) },
          ];
    };
    const name = `기관${String.fromCharCode(65 + i)}`;
    return {
      name,
      score: scorePool[int(0, scorePool.length - 1)],
      existing: int(5, 40) * 10,
      limitPct: 100 / n,
      feeMethod,
      products: [
        { name: `${name} 1년물`, maturity: "1y" as const, rate: round3(rate1), tiers: makeTiers() },
        { name: `${name} 3년물`, maturity: "3y" as const, rate: round3(rate3), tiers: makeTiers() },
      ],
    };
  });

  return {
    id: `random-${seed}`,
    title: `임의 입력 ${seed}`,
    newDeposit: int(0, 20) * 10,
    rankRatios,
    maturityMix: { "1y": 90, "3y": 10 },
    tolerance: int(0, 3),
    institutions,
  };
}

/** 부동소수점 덧셈 오차를 없애 소수 셋째 자리로 맞춘다 (예: 3.3000000000000003 → 3.3). */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
