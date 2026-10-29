// Design Ref: §5 — 화면에서 입력한 글자를 숫자로 바꾸며 범위를 검사한다 (zod 사용)
// Plan SC: 작업 11 (기초 조건 입력 검사). 인식 결과 확인 화면(작업 15)도 같은 검사를 쓴다.

import { z } from "zod";

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** 쉼표·공백을 지운 숫자 글자 (예: " 1,200 " → "1200"). 빈칸이면 빈 글자. */
const cleaned = z.string().transform((v) => v.replace(/[,\s]/g, ""));

const eokSchema = cleaned.pipe(
  z
    .string()
    .min(1, "값을 입력해 주세요.")
    .regex(/^-?\d+(\.\d+)?$/, "숫자만 입력해 주세요.")
    .transform(Number)
    .pipe(z.number().int("억 원 단위 정수로 입력해 주세요 (소수점 없음).").min(0, "0 이상이어야 합니다.")),
);

const pctSchema = cleaned.pipe(
  z
    .string()
    .min(1, "값을 입력해 주세요.")
    .regex(/^-?\d+(\.\d+)?$/, "숫자만 입력해 주세요.")
    .refine((v) => !/\.\d{4,}$/.test(v), "소수 셋째 자리까지만 입력할 수 있습니다.")
    .transform(Number)
    .pipe(z.number().min(0, "0% 이상이어야 합니다.").max(100, "100% 이하여야 합니다.")),
);

function run<T>(schema: z.ZodType<T>, text: string): Parsed<T> {
  const r = schema.safeParse(text);
  return r.success ? { ok: true, value: r.data } : { ok: false, message: r.error.issues[0].message };
}

/** 억 원 금액 입력 (0 이상 정수). 예: "1,200" → 1200 */
export function parseEok(text: string): Parsed<number> {
  return run(eokSchema, text);
}

/** % 입력 (0~100, 소수 셋째 자리까지). 예: "40" → 40, "12.5" → 12.5 */
export function parsePct(text: string): Parsed<number> {
  return run(pctSchema, text);
}

/** % 값들의 합을 0.001% 단위로 정확히 더한다 (0.1 + 0.2 같은 오차 방지). */
export function sumPct(values: readonly number[]): number {
  return values.reduce((s, v) => s + Math.round(v * 1000), 0) / 1000;
}
