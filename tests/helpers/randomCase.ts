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

  const scorePool = [95, 90, 90, 85, 80, 80];
  let scores = Array.from({ length: n }, () => scorePool[int(0, scorePool.length - 1)]);
  let ratios = makeRatios(scores, int);
  if (!ratios) {
    // 예: 3곳이 모두 동점이면 100%를 정수 %로 똑같이 나눌 수 없다 → 점수를 모두 다르게 바꿔 다시 만든다
    scores = [95, 90, 85, 80].slice(0, n);
    ratios = makeRatios(scores, int)!;
  }
  const { rankRatios, shareByScore } = ratios;

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
      score: scores[i],
      existing: int(5, 40) * 10,
      // 한도 = 이 기관이 받을 비율 (합계 100%, 정확한 값이 한도를 넘지 않음)
      limitPct: shareByScore.get(scores[i])!,
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

/**
 * 순위별 배분비율(내림차순 정수, 합계 100)을 만든다.
 * 동점 묶음이 차지하는 순위 칸은 같은 비율로 채워, 묶음 안 기관의 몫이 정수 %가 되게 한다(한도를 그 몫으로 맞추기 위함).
 * 이 점수 조합으로 만들 수 없으면 null.
 */
function makeRatios(scores: number[], int: (min: number, max: number) => number) {
  const sizes = new Map<number, number>();
  for (const s of scores) sizes.set(s, (sizes.get(s) ?? 0) + 1);
  const groups = [...sizes.entries()].sort((a, b) => b[0] - a[0]); // [점수, 기관 수], 점수 높은 순

  for (let attempt = 0; attempt < 1000; attempt++) {
    // 마지막 묶음을 뺀 묶음의 칸당 비율을 내림차순으로 뽑고, 남은 비율을 마지막 묶음이 나눠 갖는다
    const values = groups.slice(0, -1).map(() => int(10, 40)).sort((x, y) => y - x);
    const [, lastSize] = groups[groups.length - 1];
    const used = values.reduce((s, v, g) => s + v * groups[g][1], 0);
    const rest = 100 - used;
    const lastValue = rest / lastSize;
    const prev = values.length > 0 ? values[values.length - 1] : Infinity;
    if (rest > 0 && Number.isInteger(lastValue) && lastValue <= prev) {
      values.push(lastValue);
      return {
        rankRatios: groups.flatMap(([, size], g) => Array<number>(size).fill(values[g])),
        shareByScore: new Map(groups.map(([score], g) => [score, values[g]])),
      };
    }
  }
  return null;
}

/** 부동소수점 덧셈 오차를 없애 소수 셋째 자리로 맞춘다 (예: 3.3000000000000003 → 3.3). */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
