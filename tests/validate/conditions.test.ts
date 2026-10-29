// Design Ref: §2.2 ① / §5 — 기초 조건 입력 검사
// Plan SC: 작업 11 (기초 조건 입력 화면)

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import type { ConditionsDraft } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";
import { parseEok, parsePct, sumPct } from "@/lib/validate/numbers";
import { exampleCases } from "../helpers/cases";

/** 예시 1을 화면에 입력한 모습 */
const example1: ConditionsDraft = {
  existingTotal: "1,000",
  newDeposit: "200",
  limits: [
    { name: "A은행", limitPct: "40" },
    { name: "B증권", limitPct: "30" },
    { name: "C은행", limitPct: "20" },
    { name: "D은행", limitPct: "10" },
  ],
  rankRatios: ["40", "30", "20", "10"],
  mix1y: "90",
  mix3y: "10",
  amount3y: "",
  tolerance: "10",
};

describe("숫자 입력 바꾸기", () => {
  it("억 원: 쉼표·공백을 지우고 정수만 받는다", () => {
    expect(parseEok(" 1,200 ")).toEqual({ ok: true, value: 1200 });
    expect(parseEok("1.5")).toEqual({ ok: false, message: "억 원 단위 정수로 입력해 주세요 (소수점 없음)." });
    expect(parseEok("")).toEqual({ ok: false, message: "값을 입력해 주세요." });
    expect(parseEok("abc")).toEqual({ ok: false, message: "숫자만 입력해 주세요." });
    expect(parseEok("-3")).toEqual({ ok: false, message: "0 이상이어야 합니다." });
  });

  it("%: 0~100, 소수 셋째 자리까지", () => {
    expect(parsePct("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(parsePct("0.1234").ok).toBe(false);
    expect(parsePct("101").ok).toBe(false);
  });

  it("% 합계는 오차 없이 더한다 (0.1 + 0.2 = 0.3)", () => {
    expect(sumPct([0.1, 0.2])).toBe(0.3);
    expect(sumPct([33.333, 33.333, 33.334])).toBe(100);
  });
});

describe("기초 조건 검사", () => {
  it("예시 1을 입력하면 통과하고, 그 조건으로 계산하면 정답과 같다", () => {
    const r = checkConditions(example1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 화면 입력은 허용 오차 적용 기관을 명시한다 (아무것도 고르지 않음 = 빈 목록)
    expect(r.conditions).toEqual({ ...exampleCases[0].conditions, toleranceTargets: [] });
    const plan = calculatePlan(exampleCases[0].institutions, r.conditions);
    expect(plan.ok && plan.plan.totalYieldMilli).toBe(3411);
  });

  it("빈 화면은 칸마다 이유를 알려준다", () => {
    const r = checkConditions({ ...example1, existingTotal: "", newDeposit: "", tolerance: "", mix1y: "", mix3y: "", limits: [], rankRatios: [] });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(["existingTotal", "limits", "mix1y", "mix3y", "newDeposit", "tolerance"]);
  });

  it("한도 합계·이름 중복·빈 이름", () => {
    const r = checkConditions({
      ...example1,
      limits: [
        { name: "A은행", limitPct: "40" },
        { name: "A은행", limitPct: "30" },
        { name: " ", limitPct: "20" },
        { name: "D은행", limitPct: "5" },
      ],
    });
    expect(r.errors["limits.1.name"]).toBe("같은 이름의 기관이 이미 있습니다.");
    expect(r.errors["limits.2.name"]).toBe("기관 이름을 입력해 주세요.");
    expect(r.errors.limits).toBe("한도 합계가 100%가 아닙니다 (지금 95%).");
  });

  it("배분비율: 개수·합계·순서", () => {
    expect(checkConditions({ ...example1, rankRatios: ["50", "30", "20"] }).errors.rankRatios).toContain("기관 수(4곳)만큼");
    expect(checkConditions({ ...example1, rankRatios: ["40", "30", "20", "5"] }).errors.rankRatios).toContain("지금 95%");
    expect(checkConditions({ ...example1, rankRatios: ["10", "20", "30", "40"] }).errors.rankRatios).toBe(
      "배분비율은 1위부터 순서대로 같거나 작아야 합니다.",
    );
  });

  it("만기 구성 비율 합이 100%가 아니면", () => {
    expect(checkConditions({ ...example1, mix1y: "80" }).errors.mix).toContain("지금 90%");
  });

  it("허용 오차는 필수, 0 이상 정수", () => {
    expect(checkConditions({ ...example1, tolerance: "" }).errors.tolerance).toBe("값을 입력해 주세요.");
    expect(checkConditions({ ...example1, tolerance: "0" }).ok).toBe(true);
  });

  it("3년물 금액이 정수가 아니면(1,235억 × 10%) 실무자가 정하게 하고, 정하면 통과", () => {
    const draft = { ...example1, newDeposit: "235" };
    const r = checkConditions(draft);
    expect(r.amount3yNeeded).toEqual({ exact: 123.5, lower: 123, upper: 124 });
    expect(r.errors.amount3y).toBe("값을 입력해 주세요.");

    const filled = checkConditions({ ...draft, amount3y: "124" });
    expect(filled.ok && filled.conditions.amount3y).toBe(124);
    expect(checkConditions({ ...draft, amount3y: "5000" }).errors.amount3y).toContain("전체 적립금(1235억)");
  });

  it("3년물 금액이 정수면 3년물 금액 칸은 쓰지 않는다", () => {
    const r = checkConditions({ ...example1, amount3y: "999" });
    expect(r.amount3yNeeded).toBeNull();
    expect(r.ok && "amount3y" in r.conditions).toBe(false);
  });
});
