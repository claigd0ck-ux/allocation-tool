// Design Ref: §2.2 ③, §5 — 인식 결과 확인·수정: 누락·불확실·범위 오류 표시, 기관 이름 짝 맞추기, 모두 확인 전 계산 잠금
// Plan SC: 작업 15 (인식 결과 확인·수정 화면). PDF 인식(작업 13·14)이 없어도 실무자가 직접 입력할 수 있다.

import type { Conditions, FeeMethod, Field, Institution, Maturity } from "@/lib/domain/types";
import type { ReviewInstitution, ReviewProduct, ReviewState, ReviewTier } from "@/lib/domain/review";
import { pctToMilli } from "@/lib/domain/units";

/** 값의 종류에 따른 검사 규칙 (PRD 5절 ①: 금리·수수료 0~20%, 금액 0 이상). */
export type FieldKind = "text" | "score" | "eok" | "rate" | "feeMethod" | "maturity";

// ───────── 값 만들기·고치기 ─────────

/** PDF에 없던 값: 비워 두고 "누락". */
export function missing<T>(): Field<T> {
  return { value: null, status: "missing", confirmed: false };
}

/** 인식한 값 (불확실하면 노란색, 확인 전까지 계산 잠금). 범위를 벗어나면 오류. */
export function recognized<T>(kind: FieldKind, value: T, uncertain = false): Field<T> {
  const problem = rangeProblem(kind, value);
  if (problem) return { value, status: "error", confirmed: false, note: problem };
  return { value, status: uncertain ? "uncertain" : "ok", confirmed: !uncertain };
}

/** 실무자가 칸을 고쳤을 때: 글자를 검사해 값으로 바꾼다. 고친 값은 확인한 것으로 본다. */
export function editField(kind: FieldKind, text: string): Field<string | number> {
  const t = text.trim();
  if (t === "") return { value: null, status: "missing", confirmed: false };
  if (kind === "text") return { value: t, status: "ok", confirmed: true };
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { value: null, status: "error", confirmed: false, raw: text, note: "숫자만 입력해 주세요." };
  const problem = rangeProblem(kind, n);
  if (problem) return { value: n, status: "error", confirmed: false, raw: text, note: problem };
  return { value: n, status: "ok", confirmed: true };
}

/** 노란 칸(불확실)을 실무자가 "확인" 눌렀을 때. */
export function confirmField<T>(field: Field<T>): Field<T> {
  return field.status === "uncertain" ? { ...field, confirmed: true } : field;
}

function rangeProblem(kind: FieldKind, value: unknown): string | null {
  switch (kind) {
    case "eok":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 ? null : "0 이상의 억 원 정수여야 합니다.";
    case "rate":
      if (typeof value !== "number" || value < 0 || value > 20) return "0~20% 사이여야 합니다.";
      return /\.\d{4,}$/.test(String(value)) ? "소수 셋째 자리까지만 입력할 수 있습니다." : null;
    case "score":
      return typeof value === "number" && Number.isFinite(value) ? null : "숫자여야 합니다.";
    case "feeMethod":
      return value === "whole" || value === "progressive" ? null : "구간 전체 또는 누진 중 하나여야 합니다.";
    case "maturity":
      return value === "1y" || value === "3y" ? null : "1년물 또는 3년물이어야 합니다.";
    default:
      return null;
  }
}

/** 값이 계산에 쓸 수 있는 상태인지: 값이 있고, 오류가 아니고, 불확실하면 확인을 받았다. */
export function isSettled<T>(field: Field<T>): boolean {
  return field.value !== null && field.status !== "error" && field.status !== "missing" && (field.status !== "uncertain" || field.confirmed);
}

// ───────── 빈 기관 (직접 입력용) ─────────

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `inst-${Date.now().toString(36)}-${idCounter}`;
}

export function emptyTier(from?: number): ReviewTier {
  return { from: from === undefined ? missing() : recognized("eok", from), fee: missing() };
}

export function emptyProduct(maturity: Maturity): ReviewProduct {
  return { name: missing(), maturity: recognized("maturity", maturity), rate: missing(), tiers: [emptyTier(0)] };
}

/** 직접 입력할 빈 기관 하나 (이름은 기초 조건의 기관 명단에서 가져올 수 있다). */
export function emptyInstitution(name?: string): ReviewInstitution {
  return {
    id: newId(),
    sourceFile: "직접 입력",
    name: name ? recognized("text", name) : missing(),
    score: missing(),
    existing: missing(),
    feeMethod: missing(),
    products: [emptyProduct("1y"), emptyProduct("3y")],
    matchedName: name ?? null,
  };
}

// ───────── 기관 이름 짝 맞추기 ─────────

/** 비교용 이름: 공백·(주)·주식회사를 없앤다. */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").replace(/\(주\)|㈜|주식회사/g, "");
}

/** 두 이름이 비슷한 정도 (0~1). 한쪽이 다른 쪽을 포함하면(국민은행 ⊂ KB국민은행) 높게 본다. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const pairs = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const px = pairs(x);
  const py = pairs(y);
  const common = [...px].filter((p) => py.has(p)).length;
  return px.size + py.size === 0 ? 0 : (2 * common) / (px.size + py.size);
}

/** 기초 조건 명단에서 이 기관과 같은 기관일 것 같은 이름 (비슷한 정도 0.5 이상, 가장 비슷한 것). 같은 이름이면 그 이름. */
export function suggestMatch(recognizedName: string, conditionNames: readonly string[]): string | null {
  let best: { name: string; score: number } | null = null;
  for (const name of conditionNames) {
    const score = nameSimilarity(recognizedName, name);
    if (score >= 0.5 && (!best || score > best.score)) best = { name, score };
  }
  return best?.name ?? null;
}

// ───────── 계산 잠금 확인 ─────────

export interface ReviewCheck {
  /** 표시 항목 수 (화면 맨 위 요약) */
  uncertain: number;
  missing: number;
  errors: number;
  /** 짝을 안 맞춘 기관 (PDF 쪽) */
  unmatched: string[];
  /** 기초 조건 명단에만 있고 PDF에는 없는 기관 */
  onlyInConditions: string[];
  /** 같은 명단 이름에 두 기관 이상이 연결됨 */
  duplicated: string[];
  /** 그 밖의 이유 (잔액 합 불일치 등) */
  problems: string[];
  /** 계산할 수 있으면 계산용 기관 목록 */
  institutions: Institution[] | null;
}

/** 확인·수정 상태를 점검해, 계산할 수 있으면 계산용 기관 목록을 만든다. */
export function checkReview(review: ReviewState, conditions: Conditions | null): ReviewCheck {
  const count = { uncertain: 0, missing: 0, errors: 0 };
  const visit = (f: Field<unknown>) => {
    if (f.status === "error") count.errors += 1;
    else if (f.status === "missing" || f.value === null) count.missing += 1;
    else if (f.status === "uncertain" && !f.confirmed) count.uncertain += 1;
  };
  for (const inst of review.institutions) {
    [inst.name, inst.score, inst.existing, inst.feeMethod].forEach(visit);
    for (const p of inst.products) {
      [p.name, p.maturity, p.rate].forEach(visit);
      p.tiers.forEach((t) => [t.from, t.fee].forEach(visit));
    }
  }

  const conditionNames = conditions?.limits.map((l) => l.name) ?? [];
  const unmatched = review.institutions.filter((i) => !i.matchedName || !conditionNames.includes(i.matchedName)).map(displayName);
  const used = review.institutions.map((i) => i.matchedName).filter((n): n is string => !!n);
  const duplicated = [...new Set(used.filter((n, i) => used.indexOf(n) !== i))];
  const onlyInConditions = conditionNames.filter((n) => !used.includes(n));

  const problems: string[] = [];
  if (!conditions) problems.push("① 기초 조건을 먼저 모두 입력해 주세요.");
  if (review.institutions.length === 0) problems.push("기관 자료가 없습니다. PDF를 올리거나 [기관 직접 입력]으로 추가해 주세요.");

  const ready =
    conditions !== null &&
    review.institutions.length > 0 &&
    count.uncertain + count.missing + count.errors === 0 &&
    unmatched.length === 0 &&
    duplicated.length === 0 &&
    onlyInConditions.length === 0;

  let institutions: Institution[] | null = null;
  if (ready) {
    institutions = review.institutions.map((i) => toInstitution(i, conditions));
    const sum = institutions.reduce((s, i) => s + i.existing, 0);
    if (sum !== conditions.existingTotal) {
      problems.push(`기관별 현재 잔액의 합(${sum}억)이 ①의 기존 예치금액(${conditions.existingTotal}억)과 다릅니다.`);
      institutions = null;
    }
  }

  return { ...count, unmatched, onlyInConditions, duplicated, problems, institutions };
}

/** 확인을 마친 기관을 계산용 형식으로 바꾼다 (이름은 기초 조건 명단의 이름, 한도는 기초 조건의 값). */
function toInstitution(i: ReviewInstitution, conditions: Conditions): Institution {
  const name = i.matchedName!;
  return {
    name,
    score: i.score.value!,
    existing: i.existing.value!,
    limitPct: conditions.limits.find((l) => l.name === name)!.limitPct,
    feeMethod: i.feeMethod.value as FeeMethod,
    products: i.products.map((p) => ({
      name: p.name.value!,
      maturity: p.maturity.value!,
      rate: pctToMilli(p.rate.value!),
      tiers: p.tiers.map((t) => ({ from: t.from.value!, fee: pctToMilli(t.fee.value!) })),
    })),
  };
}

export function displayName(i: ReviewInstitution): string {
  return i.name.value ?? i.name.raw ?? `(이름 없음 · ${i.sourceFile})`;
}
