// Design Ref: §8 L1 — 계산 전체(순위 → 목표 금액 → 상품 배분 → 자금 이동)를 예시 3건 정답과 처음부터 끝까지 비교한다
// Plan SC: 작업 8 (계산 검증 통과) = 성공 기준 ④ "예시 3건에서 목표 배분안과 두 이동 방법 결과가 정답과 100% 일치"

import { describe, expect, it } from "vitest";
import { calculatePlan, SAME_RESULT_NOTICE, type CalcResult } from "@/lib/calc";
import { exampleCases, rawCases, toCaseInput } from "../helpers/cases";
import { moveRuleViolations } from "../helpers/moveRules";
import { oracleAnswer } from "../helpers/oracle";
import { randomCase } from "../helpers/randomCase";

function ok(result: CalcResult) {
  if (!result.ok) throw new Error(`계산 실패: ${result.errors.map((e) => `[${e.stage}] ${e.message}`).join(" / ")}`);
  return result;
}

/** examples/answers.md의 정답 전체 (사람이 확인한 값). 이동 송금 내역은 여럿일 수 있어 횟수·금액만 고정한다. */
const answers = [
  {
    title: "예시 1. 정상 케이스",
    total: 1200,
    amount1y: 1080,
    amount3y: 120,
    rows: [
      ["A은행", 1, 480, [480, 0], 3400],
      ["B증권", 2, 360, [240, 120], 3483],
      ["C은행", 3, 240, [240, 0], 3350],
      ["D은행", 4, 120, [120, 0], 3363],
    ],
    totalYield: 3411,
    minCount: [3, 270],
    minAmount: [3, 270],
    same: true,
  },
  {
    title: "예시 2. 동점 케이스 (허용 오차 0억)",
    total: 1000,
    amount1y: 900,
    amount3y: 100,
    rows: [
      ["A은행", 1, 400, [400, 0], 3390],
      ["B증권", 2, 250, [150, 100], 3481],
      ["C은행", 2, 250, [250, 0], 3350],
      ["D은행", 4, 100, [100, 0], 3400],
    ],
    totalYield: 3404,
    minCount: [3, 150],
    minAmount: [3, 150],
    same: true,
  },
  {
    title: "예시 3. 억 원 미만 처리 케이스",
    total: 1030,
    amount1y: 927,
    amount3y: 103,
    rows: [
      ["A은행", 1, 371, [371, 0], 3420],
      ["B증권", 2, 288, [185, 103], 3473],
      ["C은행", 3, 216, [216, 0], 3370],
      ["D은행", 4, 155, [155, 0], 3405],
    ],
    totalYield: 3422,
    minCount: [3, 113],
    minAmount: [4, 104],
    same: false,
  },
] as const;

describe("성공 기준 ④ — 예시 3건이 answers.md 정답과 100% 일치", () => {
  answers.forEach((a, index) => {
    it(a.title, () => {
      const c = exampleCases[index];
      const r = ok(calculatePlan(c.institutions, c.conditions));

      // ① 목표 배분안
      expect([r.total, r.amount1y, r.amount3y]).toEqual([a.total, a.amount1y, a.amount3y]);
      expect(
        r.plan.allocations.map((x) => [x.name, x.rank, x.target, x.products.map((p) => p.amount), x.yieldMilli]),
      ).toEqual(a.rows);
      expect(r.plan.totalYieldMilli).toBe(a.totalYield);

      // ② 두 이동 방법 (횟수·금액이 정답과 같고 모든 규칙을 지키면 정답)
      const { minCount, minAmount, same } = r.plan.moves;
      expect([minCount.count, minCount.amount]).toEqual(a.minCount);
      expect([minAmount.count, minAmount.amount]).toEqual(a.minAmount);
      const ruleInput = {
        total: r.total,
        newDeposit: c.conditions.newDeposit,
        tolerance: c.conditions.tolerance,
        institutions: r.targets.map((t) => ({ name: t.institution.name, existing: t.institution.existing, target: t.target, rank: t.rank })),
      };
      expect(moveRuleViolations(minCount, ruleInput)).toEqual([]);
      expect(moveRuleViolations(minAmount, ruleInput)).toEqual([]);

      // 두 방법이 같으면 안내 문구
      expect(same).toBe(a.same);
      expect(r.notice).toBe(a.same ? SAME_RESULT_NOTICE : null);
    });
  });
});

describe("계산 전체가 정답(oracle)과 같다 (임의 입력 30건)", () => {
  for (const raw of Array.from({ length: 30 }, (_, i) => randomCase(i + 1))) {
    it(raw.id, () => {
      const c = toCaseInput(raw);
      const r = ok(calculatePlan(c.institutions, c.conditions));
      const e = oracleAnswer(raw);
      expect(r.plan.allocations.map((x) => [x.name, x.rank, x.target, x.yieldMilli])).toEqual(
        e.institutions.map((x) => [x.name, x.rank, x.target, x.yieldMilli]),
      );
      expect(r.plan.totalYieldMilli).toBe(e.totalYieldMilli);
      expect([r.plan.moves.minCount.count, r.plan.moves.minCount.amount]).toEqual([e.minCount.count, e.minCount.amount]);
      expect([r.plan.moves.minAmount.count, r.plan.moves.minAmount.amount]).toEqual([e.minAmount.count, e.minAmount.amount]);
      expect(r.plan.moves.same).toBe(e.same);
    });
  }
});

describe("어느 단계에서 멈췄는지 알려준다", () => {
  const c = exampleCases[0];

  it("목표 금액 단계 — 순위별 배분비율 합이 100%가 아니면", () => {
    const r = calculatePlan(c.institutions, { ...c.conditions, rankRatios: [40, 30, 20, 0] });
    expect(r.ok ? null : r.errors[0]).toMatchObject({ stage: "target", code: "RATIO_SUM" });
  });

  it("상품 배분 단계 — 만기 구성 비율 합이 100%가 아니면", () => {
    const r = calculatePlan(c.institutions, { ...c.conditions, maturityMix: { "1y": 95, "3y": 10 } });
    expect(r.ok ? null : r.errors[0]).toMatchObject({ stage: "product", code: "MIX_INVALID" });
  });

  it("자금 이동 단계 — 허용 오차가 음수이면", () => {
    const r = calculatePlan(c.institutions, { ...c.conditions, tolerance: -1 });
    expect(r.ok ? null : r.errors[0]).toMatchObject({ stage: "move", code: "TOLERANCE_INVALID" });
  });

  it("입력 자료를 바꾸지 않는다 (조건을 고쳐 다시 계산해도 같은 결과)", () => {
    const before = JSON.stringify([c.institutions, c.conditions]);
    const first = ok(calculatePlan(c.institutions, c.conditions));
    const second = ok(calculatePlan(c.institutions, c.conditions));
    expect(JSON.stringify([c.institutions, c.conditions])).toBe(before);
    expect(second.plan).toEqual(first.plan);
  });
});

it("예시 자료는 3건이다 (정상 1건 + 동점·억 원 미만 처리 2건)", () => {
  expect(rawCases.map((c) => c.id)).toEqual(["case1", "case2", "case3"]);
});
