"use client";

// Design Ref: §2.1 공통 틀 — 상단 바(제목·초기화), 단계 표시줄, 현재 단계 내용, 하단 이전/다음
// Plan SC: 작업 10 (앱 기본 틀). 단계별 화면은 작업 11~18에서 채운다.

import { useState } from "react";
import { useWorkState } from "@/lib/storage/useWorkState";
import type { Step } from "@/lib/storage/workState";
import { gateFor, STEPS, stepStatus } from "@/lib/workflow/steps";
import ConditionsExcelButtons from "./ConditionsExcelButtons";
import Step1Conditions from "./Step1Conditions";

export default function Workspace() {
  const { state, update, reset } = useWorkState();
  const [message, setMessage] = useState<string | null>(null);
  // 다음 단계로 가려다 막힌 적이 있으면 빈칸도 빨갛게 표시한다
  const [attempted, setAttempted] = useState(false);

  const goTo = (step: Step) => {
    const gate = gateFor(step, state);
    if (!gate.ok) {
      setMessage(gate.reason);
      setAttempted(true);
      return;
    }
    setMessage(null);
    update((s) => ({ ...s, step }));
  };

  const onReset = () => {
    if (window.confirm("입력한 조건, 인식 결과, 계산 결과를 모두 지웁니다. 초기화할까요?")) {
      reset();
      setAttempted(false);
      setMessage("초기화했습니다.");
    }
  };

  const current = state.step;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1280px] flex-col px-8">
      <header className="flex items-center justify-between border-b border-zinc-200 py-5">
        <h1 className="text-2xl font-bold tracking-tight">적립금 배분 툴</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100"
          >
            초기화
          </button>
        </div>
      </header>

      <nav aria-label="진행 단계" className="border-b border-zinc-200 py-4">
        <ol className="flex items-center gap-2">
          {STEPS.map(({ step, label }, i) => {
            const status = stepStatus(step, state);
            const gate = gateFor(step, state);
            return (
              <li key={step} className="flex items-center gap-2">
                {i > 0 && <span className="text-zinc-400">→</span>}
                <button
                  type="button"
                  onClick={() => goTo(step)}
                  aria-current={status === "current" ? "step" : undefined}
                  aria-label={`${label}${status === "locked" ? " (잠김)" : status === "done" ? " (완료)" : ""}`}
                  title={gate.ok ? undefined : gate.reason}
                  className={
                    "rounded-full px-4 py-1.5 text-sm font-medium " +
                    (status === "current"
                      ? "bg-zinc-900 text-white"
                      : status === "locked"
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200")
                  }
                >
                  {status === "done" ? "✅ " : status === "locked" ? "🔒 " : ""}
                  {"①②③④⑤"[step - 1]} {label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {message && (
        <p role="status" className="mt-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {message}
        </p>
      )}

      <main className="flex-1 py-8">
        <section aria-labelledby="step-title">
          <h2 id="step-title" className="mb-4 text-xl font-semibold">
            {"①②③④⑤"[current - 1]} {STEPS[current - 1].label}
          </h2>
          {current === 1 ? (
            <Step1Conditions
              state={state}
              update={update}
              showRequired={attempted}
              toolbar={<ConditionsExcelButtons update={update} />}
            />
          ) : (
            <p className="text-zinc-500">이 단계 화면은 준비 중입니다.</p>
          )}
        </section>
      </main>

      <footer className="flex justify-between border-t border-zinc-200 py-5">
        <button
          type="button"
          disabled={current === 1}
          onClick={() => goTo((current - 1) as Step)}
          className="rounded-md border border-zinc-300 px-5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:invisible"
        >
          이전 단계
        </button>
        <button
          type="button"
          disabled={current === 5}
          onClick={() => goTo((current + 1) as Step)}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:invisible"
        >
          다음 단계
        </button>
      </footer>
    </div>
  );
}
