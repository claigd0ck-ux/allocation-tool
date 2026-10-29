// Design Ref: §8 L1 — 상품별 배분(목표 배분안 완성)을 정답(oracle)과 비교하고 3년물 금액·상품 구성 검사를 확인한다
// Plan SC: 작업 6 (상품별 배분), 성공 기준 ④(목표 배분안 100% 일치)

import { describe, expect, it } from "vitest";
import { allocateTargets } from "@/lib/calc/allocate";
import { allocateProducts, yieldMilli, type ProductResult } from "@/lib/calc/products";
import type { Conditions, Institution } from "@/lib/domain/types";
import { exampleCases, rawCases, toCaseInput, type CaseInput } from "../helpers/cases";
import { oracleAnswer } from "../helpers/oracle";
import { randomCase } from "../helpers/randomCase";

/** 목표 금액(작업 4) → 상품 배분(작업 6)을 이어서 계산한다. */
function plan(c: CaseInput, patch: Partial<Conditions> = {}, institutions: Institution[] = c.institutions): ProductResult {
  const conditions = { ...c.conditions, ...patch };
  const targets = allocateTargets(institutions, conditions);
  if (!targets.ok) throw new Error(`목표 금액 계산 실패: ${targets.errors.map((e) => e.message).join(" / ")}`);
  return allocateProducts(targets.allocations, targets.total, conditions);
}

function ok(result: ProductResult) {
  if (!result.ok) throw new Error(`상품 배분 실패: ${result.errors.map((e) => e.message).join(" / ")}`);
  return result;
}

describe("목표 배분안이 정답과 같다 (예시 3건 + 임의 입력 30건)", () => {
  const all = [...rawCases, ...Array.from({ length: 30 }, (_, i) => randomCase(i + 1))];
  for (const raw of all) {
    it(raw.id, () => {
      const r = ok(plan(toCaseInput(raw)));
      const expected = oracleAnswer(raw);
      expect(r.totalNet).toBe(expected.totalNet);
      expect(r.totalYieldMilli).toBe(expected.totalYieldMilli);
      expect(r.amount3y).toBe((expected.total * raw.maturityMix["3y"]) / 100);

      // 규칙: 상품 합 = 기관 목표, 3년물 합 = 전체 3년물 금액
      for (const a of r.allocations) expect(a.products.reduce((s, p) => s + p.amount, 0)).toBe(a.target);
      const sum3y = r.allocations.reduce((s, a) => {
        const inst = raw.institutions.find((x) => x.name === a.name)!;
        return s + a.products.filter((_, j) => inst.products[j].maturity === "3y").reduce((t, p) => t + p.amount, 0);
      }, 0);
      expect(sum3y).toBe(r.amount3y);

      // 최대 수익 조합이 하나뿐이면 상품별 금액·수익률까지 정답과 같아야 한다
      if (expected.productOptimumWays === 1) {
        expect(
          r.allocations.map((a) => ({ name: a.name, yield: a.yieldMilli, products: a.products.map((p) => [p.amount, p.yieldMilli]) })),
        ).toEqual(
          expected.institutions.map((i) => ({ name: i.name, yield: i.yieldMilli, products: i.products.map((p) => [p.amount, p.yieldMilli]) })),
        );
      }
    });
  }
});

describe("예시 자료 세부 결과 (answers.md)", () => {
  it("예시 1: 3년물 120억은 모두 B증권, 전체 3.411%", () => {
    const r = ok(plan(exampleCases[0]));
    expect(r.allocations.map((a) => [a.name, a.products.map((p) => p.amount), a.yieldMilli])).toEqual([
      ["A은행", [480, 0], 3400],
      ["B증권", [240, 120], 3483],
      ["C은행", [240, 0], 3350],
      ["D은행", [120, 0], 3363],
    ]);
    expect([r.amount1y, r.amount3y, r.totalYieldMilli]).toEqual([1080, 120, 3411]);
  });

  it("예시 3: 3년물 103억은 모두 B증권, 전체 3.422%", () => {
    const r = ok(plan(exampleCases[2]));
    expect(r.allocations.map((a) => a.products.map((p) => p.amount))).toEqual([
      [371, 0],
      [185, 103],
      [216, 0],
      [155, 0],
    ]);
    expect(r.totalYieldMilli).toBe(3422);
  });

  it("배분 금액이 0인 상품은 수익률을 표시하지 않는다(null)", () => {
    const r = ok(plan(exampleCases[0]));
    expect(r.allocations[0].products[1]).toMatchObject({ amount: 0, yieldMilli: null });
  });
});

describe("수익률 반올림 — 소수 넷째 자리에서 사사오입", () => {
  it("3.4565% → 3.457%, 3.4564% → 3.456%", () => {
    // 수익 단위는 억 원 × 0.001%. 금액 1,000억에 수익 3,456,500 → 3456.5 → 3457
    expect(yieldMilli(3_456_500, 1000)).toBe(3457);
    expect(yieldMilli(3_456_400, 1000)).toBe(3456);
  });

  it("금액이 0이면 오류", () => {
    expect(() => yieldMilli(0, 0)).toThrow();
  });
});

describe("3년물 금액이 억 원 정수가 아닐 때", () => {
  // 예시 1에 신규 예치금을 35억 늘리면 전체 1,235억 × 10% = 123.5억
  const base = exampleCases[0];
  const institutions = base.institutions;
  const conditions = (amount3y?: number): Partial<Conditions> => ({
    newDeposit: 235,
    rankRatios: [40, 30, 20, 10],
    amount3y,
  });

  it("실무자가 3년물 금액을 정하지 않으면 계산하지 않고 가까운 두 값을 안내한다", () => {
    const r = plan(base, conditions(), institutions);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe("AMOUNT3Y_REQUIRED");
      expect(r.errors[0].message).toContain("123억 또는 124억");
    }
  });

  it("정한 3년물 금액(123억)대로 나눈다", () => {
    const r = ok(plan(base, conditions(123), institutions));
    expect([r.amount3y, r.amount1y]).toEqual([123, 1112]);
  });

  it("정한 금액이 정수가 아니거나 범위를 벗어나면 오류", () => {
    for (const bad of [123.5, -1, 5000]) {
      const r = plan(base, conditions(bad), institutions);
      expect(r.ok ? null : r.errors[0].code).toBe("AMOUNT3Y_INVALID");
    }
  });
});

describe("계산 전 검사", () => {
  const base = exampleCases[0];
  const editFirst = (edit: (i: Institution) => Institution) => base.institutions.map((inst, k) => (k === 0 ? edit(inst) : inst));

  it("만기 구성 비율 합이 100%가 아니면", () => {
    const r = plan(base, { maturityMix: { "1y": 80, "3y": 10 } });
    expect(r.ok ? null : r.errors[0].code).toBe("MIX_INVALID");
  });

  it("1년물·3년물 상품이 하나씩이 아니면 (3년물 없음)", () => {
    const institutions = editFirst((i) => ({ ...i, products: i.products.filter((p) => p.maturity === "1y") }));
    const r = plan(base, {}, institutions);
    expect(r.ok ? null : r.errors[0]).toMatchObject({ code: "PRODUCT_SHAPE", institution: "A은행" });
  });

  it("금리가 0~20% 밖이면", () => {
    const institutions = editFirst((i) => ({ ...i, products: i.products.map((p, j) => (j === 0 ? { ...p, rate: 25_000 } : p)) }));
    const r = plan(base, {}, institutions);
    expect(r.ok ? null : r.errors[0].code).toBe("RATE_RANGE");
  });

  it("수수료 구간이 잘못되면", () => {
    const institutions = editFirst((i) => ({ ...i, products: i.products.map((p, j) => (j === 0 ? { ...p, tiers: [] } : p)) }));
    const r = plan(base, {}, institutions);
    expect(r.ok ? null : r.errors[0].code).toBe("TIER_INVALID");
  });
});
