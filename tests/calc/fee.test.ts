// Design Ref: §8 L1 — 수수료 계산을 정답(oracle)과 비교하고 구간 경계·검사 규칙을 확인한다
// Plan SC: 작업 5 (수수료 계산)

import { describe, expect, it } from "vitest";
import { feeUnits as oracleFeeUnits } from "../../examples/oracle.mjs";
import { EOK_MILLI_PER_EOK, feeUnits, tierProblems } from "@/lib/calc/fee";
import type { FeeMethod, FeeTier } from "@/lib/domain/types";
import { exampleCases, rawCases, toCaseInput } from "../helpers/cases";
import { randomCase } from "../helpers/randomCase";

const oracleFee = oracleFeeUnits as unknown as (
  amount: number,
  tiers: { from: number; fee: number }[],
  method: FeeMethod,
) => number;

describe("수수료가 정답과 같다 (예시·임의 입력의 모든 상품, 0~600억, 두 방식 모두)", () => {
  const all = [...rawCases, ...Array.from({ length: 30 }, (_, i) => randomCase(i + 1))];
  for (const raw of all) {
    it(raw.id, () => {
      const converted = toCaseInput(raw);
      raw.institutions.forEach((inst, i) => {
        inst.products.forEach((p, j) => {
          const tiers = converted.institutions[i].products[j].tiers;
          expect(tierProblems(tiers)).toEqual([]);
          for (const method of ["whole", "progressive"] as const) {
            for (let amount = 0; amount <= 600; amount++) {
              const mine = feeUnits(amount, tiers, method);
              if (mine !== oracleFee(amount, p.tiers, method)) {
                throw new Error(`${p.name} ${method} ${amount}억: ${mine} ≠ ${oracleFee(amount, p.tiers, method)}`);
              }
            }
          }
        });
      });
    });
  }
});

describe("수수료 적용 방식 (PRD 예시)", () => {
  // 100억까지 0.15%, 100억 이상 0.10%
  const tiers: FeeTier[] = [
    { from: 0, fee: 150 },
    { from: 100, fee: 100 },
  ];

  it("구간 전체: 250억이면 250억 전체에 0.10% = 0.25억", () => {
    expect(feeUnits(250, tiers, "whole")).toBe(25_000);
    expect(feeUnits(250, tiers, "whole") / EOK_MILLI_PER_EOK).toBe(0.25);
  });

  it("누진: 250억이면 100억 × 0.15% + 150억 × 0.10% = 0.30억", () => {
    expect(feeUnits(250, tiers, "progressive")).toBe(30_000);
  });

  it("두 방식은 첫 구간 안의 금액에서 같다", () => {
    expect(feeUnits(80, tiers, "whole")).toBe(feeUnits(80, tiers, "progressive"));
  });

  it("예치 금액이 0억이면 수수료도 0", () => {
    expect(feeUnits(0, tiers, "whole")).toBe(0);
    expect(feeUnits(0, tiers, "progressive")).toBe(0);
  });
});

describe("구간 경계 — 시작 금액 '이상'부터 그 구간", () => {
  // 예시 1 A은행 1년물: 300억 미만 0.15%, 300억 이상 0.10% (구간 전체)
  const aBank = exampleCases[0].institutions[0].products[0].tiers;

  it("299억은 0.15%, 300억은 0.10%", () => {
    expect(feeUnits(299, aBank, "whole")).toBe(299 * 150);
    expect(feeUnits(300, aBank, "whole")).toBe(300 * 100);
  });

  it("누진에서 경계 금액은 앞 구간에 모두 들어간다", () => {
    expect(feeUnits(300, aBank, "progressive")).toBe(300 * 150);
    expect(feeUnits(301, aBank, "progressive")).toBe(300 * 150 + 1 * 100);
  });

  it("예시 1 B증권(누진): 1년물 240억 = 0.232억, 3년물 120억 = 0.251억", () => {
    const [y1, y3] = exampleCases[0].institutions[1].products;
    expect(feeUnits(240, y1.tiers, "progressive")).toBe(23_200);
    expect(feeUnits(120, y3.tiers, "progressive")).toBe(25_100);
  });

  it("구간이 하나뿐이면 두 방식이 같다", () => {
    const single: FeeTier[] = [{ from: 0, fee: 50 }];
    expect(feeUnits(240, single, "whole")).toBe(12_000);
    expect(feeUnits(240, single, "progressive")).toBe(12_000);
  });
});

describe("잘못된 입력", () => {
  const tiers: FeeTier[] = [{ from: 0, fee: 100 }];

  it("예치 금액이 음수이거나 억 원 정수가 아니면 오류", () => {
    expect(() => feeUnits(-1, tiers, "whole")).toThrow("예치 금액");
    expect(() => feeUnits(10.5, tiers, "whole")).toThrow("예치 금액");
  });

  it("구간이 없으면 오류", () => {
    expect(() => feeUnits(10, [], "progressive")).toThrow("수수료 구간이 없습니다");
  });

  it("구간 검사: 정상이면 빈 목록", () => {
    expect(tierProblems([{ from: 0, fee: 150 }, { from: 100, fee: 100 }])).toEqual([]);
  });

  it("구간 검사: 비어 있음 / 0억부터 시작 안 함 / 오름차순 아님 / 요율 범위 밖 / 정수 아님", () => {
    expect(tierProblems([])).toEqual(["수수료 구간이 없습니다."]);
    expect(tierProblems([{ from: 50, fee: 100 }])).toContain("첫 수수료 구간은 0억부터 시작해야 합니다.");
    expect(tierProblems([{ from: 0, fee: 100 }, { from: 0, fee: 90 }])).toContain(
      "2번째 구간의 시작 금액이 앞 구간보다 커야 합니다.",
    );
    expect(tierProblems([{ from: 0, fee: 20_001 }])).toContain("1번째 구간의 수수료율은 0~20% 사이여야 합니다.");
    expect(tierProblems([{ from: 0, fee: 100 }, { from: 10.5, fee: 90 }])).toContain(
      "2번째 구간의 시작 금액은 0 이상의 억 원 정수여야 합니다.",
    );
  });
});
