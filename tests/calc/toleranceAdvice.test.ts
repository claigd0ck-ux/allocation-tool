// PRD 5절 ② (2026-10-29 추가) — 허용 오차는 고른 기관(최대 2곳)에만, 툴은 가장 적게 옮기는 기관 조합을 안내
// 정답 계산기(oracle)도 같은 규칙(toleranceTargets)으로 비교한다.

import { describe, expect, it } from "vitest";
import { allocateTargets } from "@/lib/calc/allocate";
import { adviseTolerance, MAX_TOLERANCE_TARGETS } from "@/lib/calc/toleranceAdvice";
import { planMoves } from "@/lib/calc/transfers";
import type { ConditionsDraft } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";
import { rawCases, toCaseInput, type RawCase } from "../helpers/cases";
import { oracleAnswer } from "../helpers/oracle";
import { randomCase } from "../helpers/randomCase";

function targetsOf(raw: RawCase) {
  const c = toCaseInput(raw);
  const t = allocateTargets(c.institutions, c.conditions);
  if (!t.ok) throw new Error("목표 금액 실패");
  return { c, t };
}

describe("고른 기관에만 허용 오차", () => {
  const cases: RawCase[] = [];
  for (const raw of [...rawCases, ...Array.from({ length: 15 }, (_, i) => randomCase(200 + i))]) {
    const names = raw.institutions.map((i) => i.name);
    cases.push({ ...raw, id: `${raw.id}-none`, toleranceTargets: [] });
    cases.push({ ...raw, id: `${raw.id}-one`, toleranceTargets: [names[1]] });
    cases.push({ ...raw, id: `${raw.id}-two`, toleranceTargets: [names[0], names[names.length - 1]] });
  }
  for (const raw of cases) {
    it(`${raw.id}: 정답과 같고, 고르지 않은 기관은 목표 금액 그대로`, () => {
      const { c, t } = targetsOf(raw);
      const r = planMoves(t.allocations, c.conditions);
      const e = oracleAnswer(raw);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      for (const m of ["minCount", "minAmount"] as const) {
        expect([r[m].count, r[m].amount, r[m].finalAmounts]).toEqual([e[m].count, e[m].amount, e[m].finalAmounts]);
        for (const a of t.allocations) {
          if (!raw.toleranceTargets!.includes(a.institution.name)) expect(r[m].finalAmounts[a.institution.name]).toBe(a.target);
        }
      }
    });
  }
});

describe("허용 오차 기관 안내", () => {
  it("예시 1: 아무 기관도 고르지 않았을 때보다 적게 옮기는 2곳 이하의 조합을 안내한다", () => {
    const raw = { ...rawCases[0], toleranceTargets: [] };
    const { c, t } = targetsOf(raw);
    const advice = adviseTolerance(t.allocations, c.conditions)!;
    expect(advice.current.names).toEqual([]);
    expect(advice.better).not.toBeNull();
    expect(advice.better!.names.length).toBeLessThanOrEqual(MAX_TOLERANCE_TARGETS);
    expect(advice.better!.count < advice.current.count || advice.better!.amount < advice.current.amount).toBe(true);
    // 안내 결과는 정답 계산기로 그 조합을 계산한 값과 같다
    const e = oracleAnswer({ ...rawCases[0], toleranceTargets: advice.better!.names });
    expect([advice.better!.count, advice.better!.amount]).toEqual([e.minCount.count, e.minCount.amount]);
  });

  it("안내한 조합은 2곳 이하 모든 조합 중 가장 적게 옮긴다 (임의 입력 10건)", () => {
    for (let s = 300; s < 310; s++) {
      const raw = { ...randomCase(s), tolerance: 3, toleranceTargets: [] as string[] };
      const { c, t } = targetsOf(raw);
      const advice = adviseTolerance(t.allocations, c.conditions)!;
      const best = advice.better ?? advice.current;
      const names = raw.institutions.map((i) => i.name);
      const all: string[][] = [[], ...names.map((n) => [n]), ...names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]))];
      for (const pick of all) {
        const e = oracleAnswer({ ...raw, toleranceTargets: pick });
        expect(best.count < e.minCount.count || (best.count === e.minCount.count && best.amount <= e.minCount.amount)).toBe(true);
      }
    }
  });

  it("지금 고른 것이 이미 가장 좋으면 따로 안내하지 않는다", () => {
    const raw = { ...rawCases[0], toleranceTargets: [] };
    const { c, t } = targetsOf(raw);
    const first = adviseTolerance(t.allocations, c.conditions)!;
    const again = adviseTolerance(t.allocations, { ...c.conditions, toleranceTargets: first.better!.names })!;
    expect(again.better).toBeNull();
  });

  it("허용 오차가 0이면 안내하지 않는다", () => {
    const raw = { ...rawCases[1], toleranceTargets: [] };
    const { c, t } = targetsOf(raw);
    expect(adviseTolerance(t.allocations, c.conditions)?.better).toBeNull();
  });
});

describe("기초 조건 검사 — 허용 오차 적용 기관", () => {
  const draft: ConditionsDraft = {
    existingTotal: "1000",
    newDeposit: "200",
    limits: [
      { name: "A은행", limitPct: "40", tolerance: true },
      { name: "B증권", limitPct: "30" },
      { name: "C은행", limitPct: "20", tolerance: true },
      { name: "D은행", limitPct: "10" },
    ],
    rankRatios: ["40", "30", "20", "10"],
    mix1y: "90",
    mix3y: "10",
    amount3y: "",
    tolerance: "10",
  };

  it("고른 기관 이름이 조건에 들어간다", () => {
    const r = checkConditions(draft);
    expect(r.ok && r.conditions.toleranceTargets).toEqual(["A은행", "C은행"]);
  });

  it(`${MAX_TOLERANCE_TARGETS + 1}곳 이상 고르면 막는다`, () => {
    const r = checkConditions({ ...draft, limits: draft.limits.map((l) => ({ ...l, tolerance: true })) });
    expect(r.errors.toleranceTargets).toBe("허용 오차는 2곳까지만 적용할 수 있습니다 (지금 4곳).");
  });
});
