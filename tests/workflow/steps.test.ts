// Design Ref: §2.1 단계 표시줄 — 단계 상태(완료/진행 중/잠김)와 이동 조건
// Plan SC: 작업 10 (앱 기본 틀)

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import { emptyWorkState, type WorkState } from "@/lib/storage/workState";
import { gateFor, STEPS, stepStatus } from "@/lib/workflow/steps";
import { exampleCases } from "../helpers/cases";

function withResult(step: WorkState["step"]): WorkState {
  const c = exampleCases[0];
  const r = calculatePlan(c.institutions, c.conditions);
  if (!r.ok) throw new Error("예시 계산 실패");
  return { ...emptyWorkState(), step, result: r };
}

describe("단계 이동 조건", () => {
  it("5단계: 기초 조건 → PDF 업로드 → 확인·수정 → 계산 결과 → 내려받기", () => {
    expect(STEPS.map((s) => s.label)).toEqual(["기초 조건", "PDF 업로드", "확인·수정", "계산 결과", "내려받기"]);
  });

  it("계산 결과가 없으면 ④·⑤는 잠기고 이유를 알려준다", () => {
    const s = emptyWorkState();
    expect(gateFor(4, s)).toEqual({ ok: false, reason: "③에서 [계산 실행]을 먼저 눌러 주세요." });
    expect(stepStatus(4, s)).toBe("locked");
    expect(stepStatus(5, s)).toBe("locked");
  });

  it("계산 결과가 있으면 ④·⑤로 갈 수 있다", () => {
    const s = withResult(4);
    expect(gateFor(5, s).ok).toBe(true);
    expect(stepStatus(4, s)).toBe("current");
    expect(stepStatus(1, s)).toBe("done");
    expect(stepStatus(5, s)).toBe("open");
  });

  it("앞 단계 조건에 걸리면 뒤 단계도 그 이유로 잠긴다", () => {
    const rules = { 2: () => ({ ok: false as const, reason: "기초 조건을 먼저 채워 주세요." }) };
    expect(gateFor(5, withResult(1), rules)).toEqual({ ok: false, reason: "기초 조건을 먼저 채워 주세요." });
  });
});
