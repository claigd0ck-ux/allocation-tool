// 보안 점검 중간 3번·낮음 9번 — 서버로 들어오는 JSON과 저장 파일 내용을 zod로 검사한다
// 기관 수·글자 길이·숫자 범위를 제한해 계산 폭주를 막고, 값 자리에 객체(엑셀 수식·링크)가 들어오지 못하게 한다.

import { z } from "zod";

export const MAX_INSTITUTIONS_IN_REQUEST = 20;
const MAX_EOK = 10_000_000; // 1,000조 원 — 이보다 큰 금액은 입력 실수로 본다

const name = z.string().max(100);
const eok = z.number().int().min(0).max(MAX_EOK);
const milli = z.number().int().min(0).max(20_000);
const pct = z.number().min(0).max(100);

const institution = z.object({
  name,
  score: z.number().finite().min(-1_000).max(1_000),
  existing: eok,
  limitPct: pct,
  feeMethod: z.enum(["whole", "progressive"]),
  products: z
    .array(z.object({ name, maturity: z.enum(["1y", "3y"]), rate: milli, tiers: z.array(z.object({ from: eok, fee: milli })).min(1).max(20) }))
    .max(4),
});

const conditions = z.object({
  existingTotal: eok,
  newDeposit: eok,
  limits: z.array(z.object({ name, limitPct: pct })).max(MAX_INSTITUTIONS_IN_REQUEST),
  rankRatios: z.array(pct).max(MAX_INSTITUTIONS_IN_REQUEST),
  maturityMix: z.object({ "1y": pct, "3y": pct }),
  amount3y: eok.optional(),
  tolerance: eok.max(1_000),
  toleranceTargets: z.array(name).max(MAX_INSTITUTIONS_IN_REQUEST).optional(),
});

/** 결과 엑셀 요청: 기관 자료 + 기초 조건 + 고른 이동 방법 */
export const exportRequestSchema = z.object({
  institutions: z.array(institution).min(1).max(MAX_INSTITUTIONS_IN_REQUEST),
  conditions,
  choice: z.enum(["minCount", "minAmount"]),
});

// ───────── 작업 데이터 (저장·불러오기) ─────────

const text = z.string().max(200);
/** 값은 글자·숫자·빈칸만 (객체 금지 — 엑셀 수식·링크로 바뀌지 않게) */
const field = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    status: z.enum(["ok", "uncertain", "missing", "error"]),
    confirmed: z.boolean(),
    raw: text.optional(),
    note: text.optional(),
  });
const num = z.number().finite();

const reviewInstitution = z.object({
  id: text,
  sourceFile: text,
  name: field(text),
  score: field(num),
  existing: field(num),
  feeMethod: field(z.enum(["whole", "progressive"])),
  products: z
    .array(
      z.object({
        name: field(text),
        maturity: field(z.enum(["1y", "3y"])),
        rate: field(num),
        tiers: z.array(z.object({ from: field(num), fee: field(num) })).max(20),
      }),
    )
    .max(4),
  matchedName: text.nullable(),
});

export const workBackupSchema = z.object({
  conditions: z.object({
    existingTotal: text,
    newDeposit: text,
    limits: z.array(z.object({ name: text, limitPct: text, tolerance: z.boolean().optional() })).max(MAX_INSTITUTIONS_IN_REQUEST),
    rankRatios: z.array(text).max(MAX_INSTITUTIONS_IN_REQUEST),
    mix1y: text,
    mix3y: text,
    amount3y: text,
    tolerance: text,
  }),
  review: z.object({
    files: z.array(z.object({ name: text, method: z.enum(["text", "ocr", "failed"]), message: text.optional() })).max(40),
    institutions: z.array(reviewInstitution).max(40),
  }),
});
