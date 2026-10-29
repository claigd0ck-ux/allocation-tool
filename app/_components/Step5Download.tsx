"use client";

// Design Ref: §2.2 ⑤ 내려받기 — 선택한 이동 방법 확인 후 결과 엑셀(목표 배분안·이동 내역·근거 요약) 내려받기
// Plan SC: 작업 18

import { useState } from "react";
import { MOVE_LABEL } from "@/lib/calc/view";
import { formatEok, formatMilli } from "@/lib/domain/units";
import type { WorkState } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";

export default function Step5Download({ state }: { state: WorkState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = state.result;
  const check = checkConditions(state.conditions);
  if (!r) return <p className="text-zinc-500">계산 결과가 있어야 내려받을 수 있습니다.</p>;
  const plan = r.plan.moves[state.selectedMove];

  const download = async () => {
    if (!check.ok) {
      setError("① 기초 조건이 바뀌어 다시 계산해야 합니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/excel/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutions: r.targets.map((t) => t.institution), conditions: check.conditions, choice: state.selectedMove }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? "엑셀을 만들지 못했습니다.");
        return;
      }
      const blob = await res.blob();
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "배분결과.xlsx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("엑셀을 내려받지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <dl className="grid max-w-xl grid-cols-[10rem_1fr] gap-y-2">
        <dt className="text-zinc-500">전체 적립금</dt>
        <dd>{formatEok(r.total)} (1년물 {formatEok(r.amount1y)} / 3년물 {formatEok(r.amount3y)})</dd>
        <dt className="text-zinc-500">전체 수익률</dt>
        <dd>{formatMilli(r.plan.totalYieldMilli)}</dd>
        <dt className="text-zinc-500">선택한 이동 방법</dt>
        <dd>
          {MOVE_LABEL[state.selectedMove]} — 송금 {plan.count}회, {formatEok(plan.amount)}{" "}
          <span className="text-zinc-500">(④에서 바꿀 수 있습니다)</span>
        </dd>
      </dl>
      <div>
        <button type="button" onClick={download} disabled={busy}
          className="rounded-md bg-zinc-900 px-6 py-2.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
          {busy ? "만드는 중…" : "결과 엑셀 내려받기"}
        </button>
        <p className="mt-2 text-xs text-zinc-500">엑셀: 시트1 목표 배분안 · 시트2 이동 내역 · 시트3 근거 요약</p>
      </div>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
