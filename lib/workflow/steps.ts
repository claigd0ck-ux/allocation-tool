// Design Ref: §2.1 공통 틀 — 단계 표시줄(완료 / 진행 중 / 잠김)과 단계 이동 조건
// Plan SC: 작업 10 (앱 기본 틀). 각 단계의 잠금 조건은 해당 작업(11·15·16)에서 채워 넣는다.

import type { Step, WorkState } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";

export const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "기초 조건" },
  { step: 2, label: "PDF 업로드" },
  { step: 3, label: "확인·수정" },
  { step: 4, label: "계산 결과" },
  { step: 5, label: "내려받기" },
];

/** 단계에 들어갈 수 있는지와, 못 들어가면 그 이유. */
export type StepGate = { ok: true } | { ok: false; reason: string };

/** 단계별 진입 조건을 계산하는 함수 모음. 앞 단계 조건을 모두 통과해야 다음 단계에 들어간다. */
export type GateRules = Partial<Record<Step, (state: WorkState) => StepGate>>;

/** 기본 진입 조건: 기초 조건이 올바라야 ②로, 계산 결과가 있어야 ④·⑤로 갈 수 있다. */
export const defaultGateRules: GateRules = {
  2: (s) =>
    checkConditions(s.conditions).ok ? { ok: true } : { ok: false, reason: "① 기초 조건의 빨간 칸을 먼저 고쳐 주세요." },
  4: (s) => (s.result ? { ok: true } : { ok: false, reason: "③에서 [계산 실행]을 먼저 눌러 주세요." }),
  5: (s) => (s.result ? { ok: true } : { ok: false, reason: "계산 결과가 있어야 내려받을 수 있습니다." }),
};

/** 목표 단계에 들어갈 수 있는지 — 목표 단계까지의 조건을 차례로 확인한다. */
export function gateFor(target: Step, state: WorkState, rules: GateRules = defaultGateRules): StepGate {
  for (let s = 2; s <= target; s++) {
    const rule = rules[s as Step];
    const gate = rule ? rule(state) : { ok: true as const };
    if (!gate.ok) return gate;
  }
  return { ok: true };
}

/** 단계 표시줄에 보일 상태. */
export function stepStatus(step: Step, state: WorkState, rules: GateRules = defaultGateRules): "current" | "done" | "open" | "locked" {
  if (step === state.step) return "current";
  if (!gateFor(step, state, rules).ok) return "locked";
  return step < state.step ? "done" : "open";
}
