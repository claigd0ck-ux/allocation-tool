"use client";

// Design Ref: §2.2 ① 상단 [엑셀 양식 내려받기] [채운 엑셀 올리기]
// Plan SC: 작업 12

import { useRef, useState } from "react";
import type { ConditionsDraft, WorkState } from "@/lib/storage/workState";

interface Props {
  update: (fn: (s: WorkState) => WorkState) => void;
}

export default function ConditionsExcelButtons({ update }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/excel/parse", { method: "POST", body });
      const data = (await res.json()) as { ok: true; draft: ConditionsDraft } | { ok: false; message: string };
      if (!data.ok) {
        setMessage({ ok: false, text: data.message });
        return;
      }
      update((s) => ({ ...s, conditions: data.draft, result: null, summary: null }));
      setMessage({ ok: true, text: `${file.name}의 값으로 기초 조건을 채웠습니다. 빨간 칸이 있으면 확인해 주세요.` });
    } catch {
      setMessage({ ok: false, text: "파일을 올리지 못했습니다. 다시 시도해 주세요." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <a href="/api/excel/template" download className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100">
          엑셀 양식 내려받기
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
        >
          {busy ? "읽는 중…" : "채운 엑셀 올리기"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          aria-label="채운 기초 조건 엑셀 파일"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      {message && (
        <p role="status" className={"text-sm " + (message.ok ? "text-emerald-700" : "text-red-600")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
