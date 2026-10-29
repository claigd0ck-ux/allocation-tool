"use client";

// Design Ref: §2.2 ② PDF 업로드 — PDF 인식(작업 13·14)이 들어오기 전까지는 직접 입력 안내만 보인다
// Plan SC: 작업 13·14 자리

export default function Step2Upload() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="rounded-md bg-zinc-100 px-4 py-3 text-zinc-700">
        PDF 자동 인식은 아직 준비 중입니다. [다음 단계]로 넘어가 ③에서 [명단의 기관 직접 입력]으로 기관 자료를 입력해 주세요.
      </p>
    </div>
  );
}
