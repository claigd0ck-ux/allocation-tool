// Design Ref: §8 L1 — 기관별 목표 금액 계산을 정답(oracle)과 비교하고 계산 전 검사를 확인한다
// Plan SC: 작업 4 (기관별 목표 금액), 성공 기준 ③(한도 위반 차단)·④(정답 일치)

import { describe, expect, it } from "vitest";
import { allocateTargets, type TargetResult } from "@/lib/calc/allocate";
import type { Conditions, Institution } from "@/lib/domain/types";
import { exampleCases, rawCases, toCaseInput } from "../helpers/cases";
import { oracleAnswer } from "../helpers/oracle";
import { randomCase } from "../helpers/randomCase";

/** 성공 결과만 꺼낸다 (실패면 이유를 보여주며 테스트 실패). */
function ok(result: TargetResult) {
  if (!result.ok) throw new Error(`계산 실패: ${result.errors.map((e) => e.message).join(" / ")}`);
  return result;
}

/** 예시 자료의 기초 조건 일부를 바꿔 계산한다. */
function runWith(index: number, patch: Partial<Conditions>, institutions?: Institution[]) {
  const c = exampleCases[index];
  return allocateTargets(institutions ?? c.institutions, { ...c.conditions, ...patch });
}

function errorCodes(result: TargetResult) {
  return result.ok ? [] : result.errors.map((e) => e.code);
}

describe("기관별 목표 금액이 정답과 같다 (예시 3건 + 임의 입력 30건)", () => {
  const all = [...rawCases, ...Array.from({ length: 30 }, (_, i) => randomCase(i + 1))];
  for (const raw of all) {
    it(raw.id, () => {
      const c = toCaseInput(raw);
      const result = ok(allocateTargets(c.institutions, c.conditions));
      const expected = oracleAnswer(raw);
      expect(result.total).toBe(expected.total);
      expect(result.allocations.map((a) => ({ name: a.institution.name, rank: a.rank, target: a.target }))).toEqual(
        expected.institutions.map((i) => ({ name: i.name, rank: i.rank, target: i.target })),
      );
      // 합계 = 전체 적립금, 순위가 뒤인 기관이 더 많이 받지 않는다
      expect(result.allocations.reduce((s, a) => s + a.target, 0)).toBe(result.total);
      for (const a of result.allocations) {
        for (const b of result.allocations) {
          if (a.rank < b.rank) expect(a.target).toBeGreaterThanOrEqual(b.target);
        }
      }
    });
  }
});

describe("예시 자료의 세부 결과", () => {
  it("예시 2: 공동 2위는 2위·3위 비율을 합쳐 25%씩, D은행은 4위 10%", () => {
    const r = ok(runWith(1, {}));
    expect(r.allocations.map((a) => [a.institution.name, a.rank, a.ratioPct, a.target])).toEqual([
      ["A은행", 1, 40, 400],
      ["B증권", 2, 25, 250],
      ["C은행", 2, 25, 250],
      ["D은행", 4, 10, 100],
    ]);
  });

  it("예시 3: 억 원 미만 버림 후 소수점이 큰 A은행(.8)·D은행(.5)이 1억씩 더 받는다", () => {
    const r = ok(runWith(2, {}));
    expect(r.allocations.map((a) => [a.institution.name, a.exact.num / a.exact.den, a.roundedUp, a.target])).toEqual([
      ["A은행", 370.8, true, 371],
      ["B증권", 288.4, false, 288],
      ["C은행", 216.3, false, 216],
      ["D은행", 154.5, true, 155],
    ]);
  });

  it("예시 3: 억 원 미만 처리로 생긴 1억 미만 한도 초과는 허용하고 표시만 한다", () => {
    const r = ok(runWith(2, {}));
    expect(r.allocations.map((a) => [a.institution.name, a.limitExact, a.overLimitByRounding])).toEqual([
      ["A은행", 370.8, true],
      ["B증권", 288.4, false],
      ["C은행", 216.3, false],
      ["D은행", 154.5, true],
    ]);
  });
});

describe("억 원 미만 처리 규칙", () => {
  const inst = (name: string, score: number, existing: number): Institution => ({
    name,
    score,
    existing,
    limitPct: 0,
    feeMethod: "whole",
    products: [],
  });

  it("소수점이 같으면 순위가 높은 기관이 먼저 1억을 받는다", () => {
    // 전체 1,005억 × 40·30·30% = 402 · 301.5 · 301.5 → 남는 1억은 2위에게
    const institutions = [inst("가", 95, 500), inst("나", 90, 300), inst("다", 85, 205)];
    const r = ok(
      allocateTargets(institutions, {
        existingTotal: 1005,
        newDeposit: 0,
        limits: [
          { name: "가", limitPct: 40 },
          { name: "나", limitPct: 30 },
          { name: "다", limitPct: 30 },
        ],
        rankRatios: [40, 30, 30],
        maturityMix: { "1y": 90, "3y": 10 },
        tolerance: 0,
      }),
    );
    expect(r.allocations.map((a) => a.target)).toEqual([402, 302, 301]);
  });
});

describe("계산 전 검사 — 걸리면 계산하지 않는다", () => {
  it("순위별 배분비율 합이 100%가 아니면", () => {
    expect(errorCodes(runWith(0, { rankRatios: [40, 30, 10, 10] }))).toContain("RATIO_SUM");
  });

  it("순위별 배분비율이 순위순으로 작아지지 않으면 (예: 10·20·30·40)", () => {
    expect(errorCodes(runWith(0, { rankRatios: [10, 20, 30, 40] }))).toContain("RATIO_ORDER");
  });

  it("순위별 배분비율 개수가 기관 수와 다르면", () => {
    expect(errorCodes(runWith(0, { rankRatios: [50, 30, 20] }))).toContain("RATIO_COUNT");
  });

  it("비율이 소수 셋째 자리를 넘으면", () => {
    expect(errorCodes(runWith(0, { rankRatios: [40.0001, 30, 20, 9.9999] }))).toContain("INVALID_PCT");
  });

  it("기관별 한도 합이 100%가 아니면", () => {
    const limits = exampleCases[0].conditions.limits.map((l) => ({ ...l, limitPct: 20 }));
    expect(errorCodes(runWith(0, { limits }))).toContain("LIMIT_SUM");
  });

  it("한도가 없는 기관이 있으면", () => {
    const limits = exampleCases[0].conditions.limits.slice(0, 3);
    const r = runWith(0, { limits });
    expect(errorCodes(r)).toContain("LIMIT_MISSING");
    expect(r.ok ? null : r.errors[0].institution).toBe("D은행");
  });

  it("억 원 미만 처리 전 정확한 값이 한도를 넘으면 막고 그 기관을 알려준다", () => {
    // 예시 1: A은행 목표 480억(40%)인데 한도를 39%(468억)로 낮춘다
    const limits = [
      { name: "A은행", limitPct: 39 },
      { name: "B증권", limitPct: 31 },
      { name: "C은행", limitPct: 20 },
      { name: "D은행", limitPct: 10 },
    ];
    const r = runWith(0, { limits });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toMatchObject({ code: "OVER_LIMIT", institution: "A은행" });
      expect(r.errors[0].message).toContain("468억");
    }
  });

  it("입력한 기존 예치금액이 기관별 잔액 합과 다르면", () => {
    expect(errorCodes(runWith(0, { existingTotal: 999 }))).toContain("EXISTING_MISMATCH");
  });

  it("금액이 억 원 정수가 아니면", () => {
    expect(errorCodes(runWith(0, { newDeposit: 1.5 }))).toContain("AMOUNT_NOT_INTEGER");
  });

  it("기관이 없으면", () => {
    expect(errorCodes(runWith(0, {}, []))).toEqual(["NO_INSTITUTIONS"]);
  });

  it("여러 문제가 있으면 한 번에 모두 알려준다", () => {
    const codes = errorCodes(runWith(0, { rankRatios: [10, 20, 30, 30], existingTotal: 1 }));
    expect(codes).toEqual(expect.arrayContaining(["RATIO_SUM", "RATIO_ORDER", "EXISTING_MISMATCH"]));
  });
});
