// PRD 5절 ② (2026-10-29 추가) — 기관이 9곳 이상이면 평가 하위 2곳 제외
// 제외 기관: 목표 0억, 이동 때 허용 오차 없이 0억(잔액 전액 이동). 배분비율은 남는 기관 수만큼. 경계 동점이면 계산 중지.

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import { allocateTargets } from "@/lib/calc/allocate";
import { includedCount } from "@/lib/calc/exclusion";
import { checkConditions } from "@/lib/validate/conditions";
import { toCaseInput, type RawCase } from "../helpers/cases";
import { moveRuleViolations } from "../helpers/moveRules";
import { oracleAnswer } from "../helpers/oracle";

/** 바탕화면 샘플(은행1~9)과 같은 기관 자료. 은행6·7은 동점(84점), 남는 7곳의 배분비율 20·18·16·14·12·10·10 */
function nineBanks(overrides: Partial<RawCase> = {}, scores?: number[]): RawCase {
  const rows: [number, number, "whole" | "progressive", number, number[][], number, number[][]][] = [
    [96, 150, "whole", 3.42, [[0, 0.15], [100, 0.1]], 3.85, [[0, 0.2]]],
    [93, 130, "progressive", 3.48, [[0, 0.14], [80, 0.09]], 3.9, [[0, 0.24], [30, 0.16]]],
    [91, 120, "whole", 3.38, [[0, 0.08]], 3.8, [[0, 0.15]]],
    [90, 110, "progressive", 3.51, [[0, 0.18], [60, 0.11]], 3.78, [[0, 0.1]]],
    [88, 110, "whole", 3.45, [[0, 0.12], [90, 0.07]], 3.92, [[0, 0.22], [20, 0.18]]],
    [84, 100, "progressive", 3.4, [[0, 0.1]], 3.83, [[0, 0.14]]],
    [84, 100, "whole", 3.36, [[0, 0.06]], 3.75, [[0, 0.08]]],
    [80, 90, "progressive", 3.55, [[0, 0.2], [50, 0.13]], 3.81, [[0, 0.12]]],
    [78, 90, "whole", 3.47, [[0, 0.11]], 3.88, [[0, 0.19]]],
  ];
  const limits = [20, 18, 16, 14, 12, 10, 10, 0, 0];
  return {
    id: "nine",
    title: "기관 9곳",
    newDeposit: 200,
    rankRatios: [20, 18, 16, 14, 12, 10, 10],
    maturityMix: { "1y": 90, "3y": 10 },
    tolerance: 1,
    institutions: rows.map(([score, existing, feeMethod, r1, t1, r3, t3], i) => ({
      name: `은행${i + 1}`,
      score: scores?.[i] ?? score,
      existing,
      limitPct: limits[i],
      feeMethod,
      products: [
        { name: `은행${i + 1} 1년`, maturity: "1y", rate: r1, tiers: t1.map(([from, fee]) => ({ from, fee })) },
        { name: `은행${i + 1} 3년`, maturity: "3y", rate: r3, tiers: t3.map(([from, fee]) => ({ from, fee })) },
      ],
    })),
    ...overrides,
  };
}

describe("기관 9곳 이상이면 평가 하위 2곳 제외", () => {
  it("배분 대상 수: 8곳까지는 그대로, 9곳부터 2곳을 뺀다", () => {
    expect([3, 8, 9, 11].map(includedCount)).toEqual([3, 8, 7, 9]);
  });

  it("하위 2곳(은행8·9)은 목표 0억, 남는 7곳이 전체 1,200억을 배분비율대로 나눈다", () => {
    const c = toCaseInput(nineBanks());
    const r = allocateTargets(c.institutions, c.conditions);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.allocations.map((a) => [a.institution.name, a.target, a.excluded])).toEqual([
      ["은행1", 240, false],
      ["은행2", 216, false],
      ["은행3", 192, false],
      ["은행4", 168, false],
      ["은행5", 144, false],
      ["은행6", 120, false],
      ["은행7", 120, false],
      ["은행8", 0, true],
      ["은행9", 0, true],
    ]);
  });

  it("계산 전체가 정답(oracle)과 같고, 제외 기관은 이동 후 0억(잔액 전액 이동)", () => {
    const raw = nineBanks();
    const c = toCaseInput(raw);
    const r = calculatePlan(c.institutions, c.conditions);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = oracleAnswer(raw);
    // 제외 기관(목표 0억)은 수익률이 없으므로 비교하지 않는다 (oracle은 0÷0)
    const yieldOf = (target: number, y: number) => (target === 0 ? null : y);
    expect(r.plan.allocations.map((a) => [a.name, a.target, yieldOf(a.target, a.yieldMilli)])).toEqual(
      e.institutions.map((x) => [x.name, x.target, yieldOf(x.target, x.yieldMilli)]),
    );
    expect(r.plan.totalYieldMilli).toBe(e.totalYieldMilli);
    for (const m of ["minCount", "minAmount"] as const) {
      expect([r.plan.moves[m].count, r.plan.moves[m].amount]).toEqual([e[m].count, e[m].amount]);
      expect(r.plan.moves[m].finalAmounts).toEqual(e[m].finalAmounts);
      expect([r.plan.moves[m].finalAmounts["은행8"], r.plan.moves[m].finalAmounts["은행9"]]).toEqual([0, 0]);
      const violations = moveRuleViolations(r.plan.moves[m], {
        total: r.total,
        newDeposit: raw.newDeposit,
        tolerance: raw.tolerance,
        institutions: r.targets.map((t) => ({ name: t.institution.name, existing: t.institution.existing, target: t.target, rank: t.rank })),
      });
      expect(violations).toEqual([]);
    }
  });

  it("배분비율을 기관 수(9개)만큼 넣으면 남는 기관 수(7개)만큼 넣으라고 알려준다", () => {
    const c = toCaseInput(nineBanks({ rankRatios: [20, 18, 16, 14, 12, 10, 6, 2, 2] }));
    const r = allocateTargets(c.institutions, c.conditions);
    expect(r.ok ? null : r.errors.find((e) => e.code === "RATIO_COUNT")?.message).toBe(
      "순위별 배분비율은 평가 하위 2곳을 뺀 7곳만큼 입력해야 합니다. 지금 9개입니다.",
    );
  });

  it("제외 경계에 동점이 걸치면(7·8위 같은 점수) 계산하지 않고 동점 기관을 알려준다", () => {
    const scores = [96, 93, 91, 90, 88, 84, 84, 84, 78];
    const c = toCaseInput(nineBanks({}, scores));
    const r = allocateTargets(c.institutions, c.conditions);
    expect(r.ok ? null : r.errors[0]).toMatchObject({ code: "EXCLUSION_TIE", message: expect.stringContaining("은행6·은행7·은행8") });
  });

  it("경계가 아닌 곳의 동점(6·7위)은 그대로 계산된다", () => {
    const c = toCaseInput(nineBanks());
    expect(allocateTargets(c.institutions, c.conditions).ok).toBe(true);
  });

  it("기초 조건 화면 검사도 남는 기관 수만큼의 배분비율을 요구한다", () => {
    const draft = {
      existingTotal: "1000",
      newDeposit: "200",
      limits: Array.from({ length: 9 }, (_, i) => ({ name: `은행${i + 1}`, limitPct: String([20, 18, 16, 14, 12, 10, 10, 0, 0][i]) })),
      rankRatios: ["20", "18", "16", "14", "12", "10", "10"],
      mix1y: "90",
      mix3y: "10",
      amount3y: "",
      tolerance: "1",
    };
    expect(checkConditions(draft).ok).toBe(true);
    expect(checkConditions({ ...draft, rankRatios: [...draft.rankRatios, "0", "0"] }).errors.rankRatios).toContain("7개를 입력해야 합니다");
  });
});
