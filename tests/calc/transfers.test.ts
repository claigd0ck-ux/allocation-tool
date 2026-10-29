// Design Ref: §8 L1 — 자금 이동 방법 두 가지를 정답(oracle)과 비교하고 모든 이동 규칙을 지키는지 확인한다
// Plan SC: 작업 7 (자금 이동 방법), 성공 기준 ④(두 이동 방법의 횟수·금액 정답 일치)

import { describe, expect, it } from "vitest";
import { allocateTargets } from "@/lib/calc/allocate";
import { planMoves, type MoveResult } from "@/lib/calc/transfers";
import type { Conditions } from "@/lib/domain/types";
import { exampleCases, rawCases, toCaseInput, type CaseInput, type RawCase } from "../helpers/cases";
import { moveRuleViolations } from "../helpers/moveRules";
import { oracleAnswer } from "../helpers/oracle";
import { randomCase } from "../helpers/randomCase";

/** 목표 금액(작업 4) → 자금 이동(작업 7)을 이어서 계산한다. */
function moves(c: CaseInput, patch: Partial<Conditions> = {}) {
  const conditions = { ...c.conditions, ...patch };
  const targets = allocateTargets(c.institutions, conditions);
  if (!targets.ok) throw new Error(`목표 금액 계산 실패: ${targets.errors.map((e) => e.message).join(" / ")}`);
  return { targets, result: planMoves(targets.allocations, conditions) };
}

function ok(result: MoveResult) {
  if (!result.ok) throw new Error(`이동 계산 실패: ${result.errors.map((e) => e.message).join(" / ")}`);
  return result;
}

/** 허용 오차를 바꾼 임의 입력 (정답 계산기가 모든 경우를 따질 수 있는 크기). */
function withTolerance(raw: RawCase, tolerance: number): RawCase {
  return { ...raw, id: `${raw.id}-tol${tolerance}`, tolerance };
}

describe("두 이동 방법이 정답과 같고 모든 규칙을 지킨다", () => {
  const all = [
    ...rawCases,
    ...Array.from({ length: 30 }, (_, i) => randomCase(i + 1)),
    // 허용 오차가 큰 경우 (±8억)
    ...Array.from({ length: 5 }, (_, i) => withTolerance(randomCase(100 + i), 8)),
  ];
  for (const raw of all) {
    it(raw.id, () => {
      const { targets, result } = moves(toCaseInput(raw));
      const r = ok(result);
      const expected = oracleAnswer(raw);

      for (const [mine, theirs] of [
        [r.minCount, expected.minCount],
        [r.minAmount, expected.minAmount],
      ] as const) {
        expect({ count: mine.count, amount: mine.amount }).toEqual({ count: theirs.count, amount: theirs.amount });
        // 고르는 순서(목표와의 차이 → 순위순)까지 같으므로 최종 금액도 정답과 같다
        expect(mine.finalAmounts).toEqual(theirs.finalAmounts);
      }
      expect(r.same).toBe(expected.same);

      const input = {
        total: targets.total,
        newDeposit: raw.newDeposit,
        tolerance: raw.tolerance,
        institutions: targets.allocations.map((a) => ({
          name: a.institution.name,
          existing: a.institution.existing,
          target: a.target,
          rank: a.rank,
        })),
      };
      expect(moveRuleViolations(r.minCount, input)).toEqual([]);
      expect(moveRuleViolations(r.minAmount, input)).toEqual([]);
    });
  }
});

describe("예시 자료 세부 결과 (answers.md)", () => {
  it("예시 1: 두 방법 모두 3회 270억, 결과가 같다", () => {
    const r = ok(moves(exampleCases[0]).result);
    expect([r.minCount.count, r.minCount.amount, r.minAmount.count, r.minAmount.amount, r.same]).toEqual([3, 270, 3, 270, true]);
  });

  it("예시 2: 허용 오차 0억이라 최종 금액 = 목표, 두 방법 모두 3회 150억", () => {
    const r = ok(moves(exampleCases[1]).result);
    expect(r.minCount.finalAmounts).toEqual({ A은행: 400, B증권: 250, C은행: 250, D은행: 100 });
    expect([r.minCount.count, r.minCount.amount, r.same]).toEqual([3, 150, true]);
  });

  it("예시 3: 최소 횟수 3회 113억, 최소 금액 4회 104억으로 결과가 다르다", () => {
    const r = ok(moves(exampleCases[2]).result);
    expect([r.minCount.count, r.minCount.amount]).toEqual([3, 113]);
    expect([r.minAmount.count, r.minAmount.amount]).toEqual([4, 104]);
    expect(r.same).toBe(false);
  });

  it("예시 1: 한도는 이동에 적용하지 않는다 (D은행 한도 120억이지만 130억 허용)", () => {
    const r = ok(moves(exampleCases[0]).result);
    expect(r.minCount.finalAmounts["D은행"]).toBe(130);
  });

  it("신규 예치금 송금은 '신규'에서 나간다", () => {
    const r = ok(moves(exampleCases[0]).result);
    const fromNew = r.minCount.transfers.filter((t) => t.from === "신규").reduce((s, t) => s + t.amount, 0);
    expect(fromNew).toBe(200);
  });
});

describe("입력 검사와 계산량 상한", () => {
  it("허용 오차가 음수이거나 정수가 아니면 계산하지 않는다", () => {
    for (const tolerance of [-1, 2.5]) {
      const { result } = moves(exampleCases[0], { tolerance });
      expect(result.ok ? null : result.errors[0].code).toBe("TOLERANCE_INVALID");
    }
  });

  it("계산량이 상한을 넘으면 계산하지 않고 허용 오차를 줄이라고 안내한다", () => {
    // 기관 4곳 × ±150억 → 301³ ≈ 2,700만 조합 × 묶음 계산 160 ≈ 44억 > 상한 10억
    const { result } = moves(exampleCases[0], { tolerance: 150 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].code).toBe("SEARCH_TOO_LARGE");
      expect(result.errors[0].message).toContain("허용 오차를 줄여 주세요");
    }
  });

  it("기관 4곳·허용 오차 ±10억은 계산된다", () => {
    expect(ok(moves(exampleCases[0], { tolerance: 10 }).result).minCount.count).toBeGreaterThan(0);
  });
});
