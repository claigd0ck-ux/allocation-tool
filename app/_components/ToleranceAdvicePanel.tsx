"use client";

// PRD 5절 ② (2026-10-29 추가) — 허용 오차를 줄 기관(최대 2곳)을 안내하고, 담당자가 [이대로 적용]으로 고친다
// 결과 화면 ④에 보인다.

import { useState } from "react";
import { adviseTolerance } from "@/lib/calc/toleranceAdvice";
import { formatEok } from "@/lib/domain/units";
import type { WorkState } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";
import { recalculate } from "@/lib/workflow/recalc";

interface Props {
  state: WorkState;
  update: (fn: (s: WorkState) => WorkState) => void;
}

export default function ToleranceAdvicePanel({ state, update }: Props) {
  const [error, setError] = useState<string | null>(null);
  const r = state.result;
  const check = checkConditions(state.conditions);
  if (!r || !check.ok) return null;
  const advice = adviseTolerance(r.targets, check.conditions);
  if (!advice) return null;

  const apply = (names: string[]) => {
    const next: WorkState = {
      ...state,
      conditions: { ...state.conditions, limits: state.conditions.limits.map((l) => ({ ...l, tolerance: names.includes(l.name.trim()) })) },
    };
    const again = recalculate(next);
    if (!again.ok) {
      setError(again.reasons.join(" / "));
      return;
    }
    setError(null);
    update(() => again.state);
  };

  const label = (names: string[]) => (names.length > 0 ? names.join("·") : "적용 기관 없음");
  return (
    <section aria-labelledby="tolerance-title" className="rounded-lg border border-zinc-200 p-4 text-sm">
      <h3 id="tolerance-title" className="mb-2 font-semibold">허용 오차 안내 (±{check.conditions.tolerance}억, 최대 2곳)</h3>
      <p>
        지금: {label(advice.current.names)} → 최소 이동 {advice.current.count}회 · {formatEok(advice.current.amount)}
      </p>
      {advice.better ? (
        <div className="mt-2 flex items-center gap-3 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
          <span>
            ▶ <strong>{label(advice.better.names)}</strong>에 허용 오차를 주면 이동이 줄어듭니다: {advice.better.count}회 · {formatEok(advice.better.amount)}
          </span>
          <button type="button" onClick={() => apply(advice.better!.names)} className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
            이대로 적용하고 다시 계산
          </button>
        </div>
      ) : (
        <p className="mt-1 text-zinc-500">
          {check.conditions.tolerance > 0 ? "지금 고른 기관이 가장 적게 옮기는 조합입니다." : "허용 오차가 0억이라 안내할 것이 없습니다."}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500">다른 기관을 고르려면 ① 기초 조건의 [허용 오차 적용] 칸을 고친 뒤 다시 계산하세요.</p>
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </section>
  );
}
