"use client";

// Design Ref: §2.2 ② PDF 업로드 — 기관별 PDF를 올리면 서버가 읽어 ③ 확인·수정 표에 넣는다
// Plan SC: 작업 13·14. 글자 PDF는 서버 안에서, 스캔본은 AI로, 표 인식 실패 시 AI 전송은 파일마다 동의할 때만.

import { useRef, useState } from "react";
import type { ReviewFile, ReviewInstitution } from "@/lib/domain/review";
import { MAX_UPLOAD_BYTES } from "@/lib/excel/http";
import type { Recognition } from "@/lib/pdf/recognize";
import { suggestMatch } from "@/lib/review/review";
import type { WorkState } from "@/lib/storage/workState";

interface Props {
  state: WorkState;
  update: (fn: (s: WorkState) => WorkState) => void;
}

type Pending = { name: string; status: "reading" | "ocr-consent"; file: File; message?: string };

export default function Step2Upload({ state, update }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const conditionNames = state.conditions.limits.map((l) => l.name.trim()).filter(Boolean);

  const record = (file: File, result: Recognition) => {
    const entry: ReviewFile = result.ok
      ? { name: file.name, method: result.method, message: result.method === "ocr" ? "스캔본이라 AI로 읽었습니다. 모든 값을 확인해 주세요." : undefined }
      : { name: file.name, method: "failed", message: result.message };
    update((s) => {
      const files = [...s.review.files.filter((f) => f.name !== file.name), entry];
      // 같은 파일을 다시 올리면 예전 인식 결과를 바꾼다
      let institutions = s.review.institutions.filter((i) => i.sourceFile !== file.name);
      if (result.ok) {
        const name = result.institution.name.value ?? "";
        const inst: ReviewInstitution = {
          ...result.institution,
          id: `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          sourceFile: file.name,
          // 이름이 명단과 똑같을 때만 바로 연결하고, 비슷하기만 하면 ③에서 "같은 기관인가요?"로 확인받는다
          matchedName: conditionNames.includes(name) ? name : null,
        };
        institutions = [...institutions, inst];
      }
      return { ...s, review: { files, institutions }, result: null, summary: null };
    });
  };

  const send = async (file: File, allowOcr: boolean) => {
    setPending((p) => [...p.filter((x) => x.name !== file.name), { name: file.name, status: "reading", file }]);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/pdf${allowOcr ? "?allowOcr=1" : ""}`, { method: "POST", body });
      const data = (await res.json()) as Recognition | { ok: false; message: string };
      if ("method" in data && !data.ok && data.canUseOcr) {
        setPending((p) => p.map((x) => (x.name === file.name ? { ...x, status: "ocr-consent", message: data.message } : x)));
        return;
      }
      record(file, "method" in data ? data : { ok: false, method: "failed", canUseOcr: false, message: data.message });
    } catch {
      record(file, { ok: false, method: "failed", canUseOcr: false, message: "파일을 보내지 못했습니다. 다시 시도해 주세요." });
    }
    setPending((p) => p.filter((x) => x.name !== file.name || x.status === "ocr-consent"));
  };

  const onFiles = (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        record(file, { ok: false, method: "failed", canUseOcr: false, message: "PDF 파일만 올릴 수 있습니다." });
      } else if (file.size > MAX_UPLOAD_BYTES) {
        record(file, { ok: false, method: "failed", canUseOcr: false, message: "4MB보다 큰 파일은 올릴 수 없습니다. ③에서 직접 입력해 주세요." });
      } else {
        void send(file, false);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (name: string) =>
    update((s) => ({
      ...s,
      review: { files: s.review.files.filter((f) => f.name !== name), institutions: s.review.institutions.filter((i) => i.sourceFile !== name) },
      result: null,
      summary: null,
    }));

  const METHOD_TEXT = { text: "글자 인식 ✔", ocr: "AI 인식 ✔ (확인 필요)", failed: "인식 실패" } as const;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700">
          PDF 올리기
        </button>
        <span className="text-zinc-500">기관별 제안서 PDF (여러 개 한 번에 가능, 한 파일 4MB 이하)</span>
        <input ref={inputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" aria-label="예치기관 제안서 PDF" onChange={(e) => onFiles(e.target.files)} />
      </div>
      <p className="rounded-md bg-zinc-100 px-4 py-2 text-zinc-700">
        글자를 선택할 수 있는 PDF는 이 서버 안에서만 읽습니다. 글자가 없는 스캔본만 AI(OpenAI)로 보내 읽으며, 사람 이름·연락처는 읽지 않습니다.
      </p>

      <ul className="flex flex-col divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {state.review.files.length === 0 && pending.length === 0 && <li className="px-4 py-3 text-zinc-500">아직 올린 파일이 없습니다.</li>}
        {state.review.files.map((f) => (
          <li key={f.name} className="flex items-center gap-4 px-4 py-2">
            <span className="flex-1">{f.name}</span>
            <span className={f.method === "failed" ? "text-red-600" : f.method === "ocr" ? "text-amber-700" : "text-emerald-700"}>{METHOD_TEXT[f.method]}</span>
            {f.message && <span className="max-w-md text-xs text-zinc-500">{f.message}</span>}
            <button type="button" onClick={() => removeFile(f.name)} className="text-zinc-500 hover:text-zinc-900">삭제</button>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.name} className="flex items-center gap-4 px-4 py-2">
            <span className="flex-1">{p.name}</span>
            {p.status === "reading" ? (
              <span className="text-zinc-500">읽는 중… (스캔본이면 AI로 읽어 시간이 걸릴 수 있습니다)</span>
            ) : (
              <>
                <span className="max-w-md text-xs text-amber-800">{p.message}</span>
                <button
                  type="button"
                  className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white"
                  onClick={() => {
                    if (window.confirm(`${p.name}을(를) AI(OpenAI)로 보내 읽습니다. 자료가 외부로 전송됩니다. 동의하십니까?`)) void send(p.file, true);
                  }}
                >
                  AI로 읽기 (동의)
                </button>
                <button
                  type="button"
                  className="text-xs text-zinc-500"
                  onClick={() => {
                    setPending((x) => x.filter((y) => y.name !== p.name));
                    record(p.file, { ok: false, method: "failed", canUseOcr: false, message: "AI로 보내지 않았습니다. ③에서 직접 입력해 주세요." });
                  }}
                >
                  직접 입력
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {state.review.institutions.length > 0 && (
        <p className="text-zinc-600">
          인식한 기관 {state.review.institutions.length}곳 —{" "}
          {state.review.institutions
            .map((i) => `${i.name.value ?? i.name.raw ?? "(이름 없음)"}${i.matchedName ? "" : suggestMatch(i.name.value ?? "", conditionNames) ? " (이름 확인 필요)" : " (명단에 없음)"}`)
            .join(", ")}
          . [다음 단계]에서 확인해 주세요.
        </p>
      )}
    </div>
  );
}
