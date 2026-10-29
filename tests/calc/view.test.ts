// Design Ref: §2.2 ④ — 결과 화면용 목표 배분안 표
// Plan SC: 작업 16

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import { allocationRows, movePlanOf } from "@/lib/calc/view";
import { exampleCases } from "../helpers/cases";

function result(index: number) {
  const c = exampleCases[index];
  const r = calculatePlan(c.institutions, c.conditions);
  if (!r.ok) throw new Error("계산 실패");
  return r;
}

describe("결과 화면 표", () => {
  it("예시 3: 기관별 1년물·3년물, 억 원 미만 보정, 한도 초과(허용) 표시", () => {
    expect(allocationRows(result(2)).map((x) => [x.name, x.exact, x.target, x.amount1y, x.amount3y, x.roundedUp, x.overLimitByRounding])).toEqual([
      ["A은행", 370.8, 371, 371, 0, true, true],
      ["B증권", 288.4, 288, 185, 103, false, false],
      ["C은행", 216.3, 216, 216, 0, false, false],
      ["D은행", 154.5, 155, 155, 0, true, true],
    ]);
  });

  it("예시 2: 공동 2위의 순위·비율", () => {
    expect(allocationRows(result(1)).map((x) => [x.rank, x.ratioPct])).toEqual([
      [1, 40],
      [2, 25],
      [2, 25],
      [4, 10],
    ]);
  });

  it("고른 이동 방법을 꺼낸다", () => {
    const r = result(2);
    expect(movePlanOf(r, "minCount").count).toBe(3);
    expect(movePlanOf(r, "minAmount").count).toBe(4);
  });
});
