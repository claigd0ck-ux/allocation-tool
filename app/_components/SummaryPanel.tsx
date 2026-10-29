"use client";

// Design Ref: §2.2 ④ 근거 요약 — 코드가 만든 설명 글 (결과 숫자는 외부로 보내지 않는다)
// Plan SC: 작업 17

import { useState } from "react";
import type { CalcSuccess } from "@/lib/calc/view";
import type { MoveChoice } from "@/lib/storage/workState";
import { buildSummary, summaryText } from "@/lib/summary/buildSummary";

export default function SummaryPanel({ result, choice }: { result: CalcSuccess; choice: MoveChoice }) {
  const sections = buildSummary(result, choice);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText(sections));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-labelledby="summary-title" className="rounded-lg border border-zinc-200 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="summary-title" className="text-lg font-semibold">배분 근거 요약</h3>
        <button type="button" onClick={copy} className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100">
          {copied ? "복사했습니다" : "글 복사"}
        </button>
      </div>
      <div className="flex flex-col gap-4 text-sm leading-6">
        {sections.map((s) => (
          <div key={s.title}>
            <h4 className="font-semibold">{s.title}</h4>
            <ul className="list-disc pl-5">
              {s.lines.filter(Boolean).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-500">이 요약은 계산 결과로 툴이 직접 작성했으며, 외부(AI)로 보내지 않았습니다.</p>
    </section>
  );
}
