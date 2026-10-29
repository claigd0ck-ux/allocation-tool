"use client";

// Design Ref: §2.1 상단 바 [데이터 저장] [불러오기]
// Plan SC: 작업 19

import { useRef, useState } from "react";
import type { WorkBackup } from "@/lib/excel/workBackup";
import type { WorkState } from "@/lib/storage/workState";

interface Props {
  state: WorkState;
  update: (fn: (s: WorkState) => WorkState) => void;
  onMessage: (text: string) => void;
}

export default function WorkBackupButtons({ state, update, onMessage }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/excel/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: state.conditions, review: state.review } satisfies WorkBackup),
      });
      if (!res.ok) {
        onMessage("저장 파일을 만들지 못했습니다.");
        return;
      }
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "작업데이터.xlsx");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      onMessage("작업 데이터를 엑셀로 저장했습니다. 공용 PC라면 파일과 [초기화]를 잊지 마세요.");
    } catch {
      onMessage("저장 파일을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (!window.confirm("지금 입력한 내용을 저장 파일의 내용으로 바꿉니다. 계속할까요?")) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/excel/work", { method: "POST", body });
      const data = (await res.json()) as { ok: true; backup: WorkBackup } | { ok: false; message: string };
      if (!data.ok) {
        onMessage(data.message);
        return;
      }
      update((s) => ({ ...s, conditions: data.backup.conditions, review: data.backup.review, result: null, summary: null, step: 3 }));
      onMessage(`${file.name}을(를) 불러왔습니다. ③에서 확인한 뒤 [계산 실행]을 눌러 주세요.`);
    } catch {
      onMessage("파일을 불러오지 못했습니다.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const cls = "rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50";
  return (
    <>
      <button type="button" className={cls} disabled={busy} onClick={save}>데이터 저장</button>
      <button type="button" className={cls} disabled={busy} onClick={() => fileRef.current?.click()}>불러오기</button>
      <input ref={fileRef} type="file" accept=".xlsx" className="hidden" aria-label="작업 데이터 저장 파일" onChange={(e) => load(e.target.files?.[0])} />
    </>
  );
}
