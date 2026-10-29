// Design Ref: §8 — 검증 하니스: 정답(oracle)이 맞는지 + 계산 코드가 정답과 같은지 확인하는 틀
// Plan SC: 작업 2 (검증 하니스). 성공 기준 ④(예시 3건 정답 100% 일치)를 확인하는 자리.

import { describe, expect, it } from "vitest";
import { exampleCases, rawCases } from "./helpers/cases";
import { moveRuleViolations } from "./helpers/moveRules";
import { oracleAnswer } from "./helpers/oracle";
import { randomCase } from "./helpers/randomCase";
import { pctToMilli } from "@/lib/domain/units";

// examples/answers.md의 정답 (사람이 확인한 값). 이동 송금 내역은 여럿일 수 있어 횟수·금액만 고정한다.
const expected = {
  case1: {
    targets: [480, 360, 240, 120],
    ranks: [1, 2, 3, 4],
    yields: [3400, 3483, 3350, 3363],
    totalYield: 3411,
    minCount: { count: 3, amount: 270 },
    minAmount: { count: 3, amount: 270 },
    same: true,
  },
  case2: {
    targets: [400, 250, 250, 100],
    ranks: [1, 2, 2, 4],
    yields: [3390, 3481, 3350, 3400],
    totalYield: 3404,
    minCount: { count: 3, amount: 150 },
    minAmount: { count: 3, amount: 150 },
    same: true,
  },
  case3: {
    targets: [371, 288, 216, 155],
    ranks: [1, 2, 3, 4],
    yields: [3420, 3473, 3370, 3405],
    totalYield: 3422,
    minCount: { count: 3, amount: 113 },
    minAmount: { count: 4, amount: 104 },
    same: false,
  },
} as const;

describe("정답 계산기(oracle)가 answers.md의 정답과 같다", () => {
  for (const c of rawCases) {
    const exp = expected[c.id as keyof typeof expected];
    it(`${c.id} ${c.title}`, () => {
      const a = oracleAnswer(c);
      expect(a.institutions.map((i) => i.target)).toEqual(exp.targets);
      expect(a.institutions.map((i) => i.rank)).toEqual(exp.ranks);
      expect(a.institutions.map((i) => i.yieldMilli)).toEqual(exp.yields);
      expect(a.totalYieldMilli).toBe(exp.totalYield);
      expect({ count: a.minCount.count, amount: a.minCount.amount }).toEqual(exp.minCount);
      expect({ count: a.minAmount.count, amount: a.minAmount.amount }).toEqual(exp.minAmount);
      expect(a.same).toBe(exp.same);
    });
  }
});

describe("예시 자료 입력 변환", () => {
  it("cases.json의 % 값이 0.001% 정수로 바뀐다", () => {
    const firstProduct = exampleCases[0].institutions[0].products[0];
    expect(firstProduct.rate).toBe(pctToMilli(3.5));
    expect(firstProduct.tiers).toEqual([
      { from: 0, fee: 150 },
      { from: 300, fee: 100 },
    ]);
  });

  it("기존 예치금액 합계와 기관 명단·한도가 채워진다", () => {
    const { conditions } = exampleCases[0];
    expect(conditions.existingTotal).toBe(1000);
    expect(conditions.limits.map((l) => l.limitPct)).toEqual([40, 30, 20, 10]);
  });
});

describe("정답의 이동 방법이 모든 규칙을 지킨다 (예시 3건 + 임의 입력 30건)", () => {
  const all = [...rawCases, ...Array.from({ length: 30 }, (_, i) => randomCase(i + 1))];
  for (const c of all) {
    it(c.id, () => {
      const a = oracleAnswer(c);
      const input = {
        total: a.total,
        newDeposit: c.newDeposit,
        tolerance: c.tolerance,
        institutions: a.institutions.map((i) => ({
          name: i.name,
          existing: c.institutions.find((x) => x.name === i.name)!.existing,
          target: i.target,
          rank: i.rank,
        })),
      };
      // 목표 배분안: 합계 = 전체, 상품 합 = 기관 목표, 3년물 합 = 전체 × 3년물 비율
      expect(a.institutions.reduce((s, i) => s + i.target, 0)).toBe(a.total);
      for (const i of a.institutions) {
        expect(i.products.reduce((s, p) => s + p.amount, 0)).toBe(i.target);
      }
      const amount3y = a.institutions.flatMap((i) => i.products).filter((p) => p.maturity === "3y").reduce((s, p) => s + p.amount, 0);
      expect(amount3y).toBe((a.total * c.maturityMix["3y"]) / 100);
      // 이동 방법 두 가지
      expect(moveRuleViolations(a.minCount, input)).toEqual([]);
      expect(moveRuleViolations(a.minAmount, input)).toEqual([]);
      // 각 기준에서 자기 기준이 상대 기준보다 나쁘지 않다
      expect(a.minCount.count).toBeLessThanOrEqual(a.minAmount.count);
      expect(a.minAmount.amount).toBeLessThanOrEqual(a.minCount.amount);
    });
  }
});

// 계산 코드와 정답 비교는 tests/calc/에 있다:
// 작업 3 순위 rank.test.ts, 4 목표 금액 allocate.test.ts, 5 수수료 fee.test.ts, 6 상품 배분 products.test.ts, 7 자금 이동 transfers.test.ts
