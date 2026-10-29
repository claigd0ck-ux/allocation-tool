// Design Ref: §2.1 단계 표시줄 — 단계 상태(완료/진행 중/잠김)와 이동 조건
// Plan SC: 작업 10 (앱 기본 틀), 작업 11 (기초 조건이 올바라야 ②로)

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import { emptyWorkState, type ConditionsDraft, type WorkState } from "@/lib/storage/workState";
import { gateFor, STEPS, stepStatus } from "@/lib/workflow/steps";
import { exampleCases } from "../helpers/cases";

const validDraft: ConditionsDraft = {
  existingTotal: "1000",
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

function filled(step: WorkState["step"], withResult: boolean): WorkState {
  const c = exampleCases[0];
  const r = calculatePlan(c.institutions, c.conditions);
  if (!r.ok) throw new Error("예시 계산 실패");
  return { ...emptyWorkState(), step, conditions: validDraft, result: withResult ? r : null };
}

describe("단계 이동 조건", () => {
  it("5단계: 기초 조건 → PDF 업로드 → 확인·수정 → 계산 결과 → 내려받기", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["기초 조건", "PDF 업로드", "확인·수정", "계산 결과", "내려받기"]);
  });

  it("기초 조건이 비었거나 틀리면 ②부터 잠긴다", () => {
    const s = emptyWorkState();
    expect(gateFor(2, s)).toEqual({ ok: false, reason: "① 기초 조건의 빨간 칸을 먼저 고쳐 주세요." });
    expect(stepStatus(2, s)).toBe("locked");
    expect(stepStatus(5, s)).toBe("locked");
  });

  it("기초 조건이 올바르면 ②·③으로 갈 수 있지만, 계산 결과가 없으면 ④·⑤는 잠긴다", () => {
    const s = filled(1, false);
    expect(gateFor(3, s).ok).toBe(true);
    expect(gateFor(4, s)).toEqual({ ok: false, reason: "③에서 [계산 실행]을 먼저 눌러 주세요." });
    expect(stepStatus(5, s)).toBe("locked");
  });

  it("계산 결과가 있으면 ④·⑤로 갈 수 있다", () => {
    const s = filled(4, true);
    expect(gateFor(5, s).ok).toBe(true);
    expect(stepStatus(4, s)).toBe("current");
    expect(stepStatus(1, s)).toBe("done");
    expect(stepStatus(5, s)).toBe("open");
  });

  it("앞 단계 조건에 걸리면 뒤 단계도 그 이유로 잠긴다", () => {
    const rules = { 2: () => ({ ok: false as const, reason: "기초 조건을 먼저 채워 주세요." }) };
    expect(gateFor(5, filled(1, true), rules)).toEqual({ ok: false, reason: "기초 조건을 먼저 채워 주세요." });
  });
});
