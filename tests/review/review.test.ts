// Design Ref: §2.2 ③ / §5 — 인식 결과 확인·수정 규칙 (누락·불확실·범위 오류, 기관 짝 맞추기, 계산 잠금)
// Plan SC: 작업 15

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import type { ReviewInstitution, ReviewState } from "@/lib/domain/review";
import {
  checkReview,
  confirmField,
  editField,
  emptyInstitution,
  missing,
  nameSimilarity,
  recognized,
  suggestMatch,
} from "@/lib/review/review";
import { exampleCases, rawCases } from "../helpers/cases";

/** 예시 자료 한 건을 "PDF에서 모두 정상 인식한" 확인 화면 상태로 만든다 (기관 이름은 PDF 표기 그대로). */
function reviewOf(index: number, rename: (n: string) => string = (n) => n): ReviewState {
  const raw = rawCases[index];
  return {
    files: [],
    institutions: raw.institutions.map(
      (i, k): ReviewInstitution => ({
        id: `r${k}`,
        sourceFile: `${i.name}.pdf`,
        name: recognized("text", rename(i.name)),
        score: recognized("score", i.score),
        existing: recognized("eok", i.existing),
        feeMethod: recognized("feeMethod", i.feeMethod),
        products: i.products.map((p) => ({
          name: recognized("text", p.name),
          maturity: recognized("maturity", p.maturity),
          rate: recognized("rate", p.rate),
          tiers: p.tiers.map((t) => ({ from: recognized("eok", t.from), fee: recognized("rate", t.fee) })),
        })),
        matchedName: rename(i.name) === i.name ? i.name : null,
      }),
    ),
  };
}

describe("값 상태", () => {
  it("PDF에 없는 값은 누락, 범위를 벗어난 값은 오류", () => {
    expect(missing()).toEqual({ value: null, status: "missing", confirmed: false });
    expect(recognized("rate", 25).status).toBe("error");
    expect(recognized("eok", -1).status).toBe("error");
    expect(recognized("eok", 10.5).status).toBe("error");
  });

  it("불확실한 값은 노란색, 확인을 누르면 풀린다", () => {
    const f = recognized("rate", 3.5, true);
    expect([f.status, f.confirmed]).toEqual(["uncertain", false]);
    expect(confirmField(f).confirmed).toBe(true);
  });

  it("직접 고친 값은 검사 후 확인된 것으로 본다", () => {
    expect(editField("rate", "3.45")).toEqual({ value: 3.45, status: "ok", confirmed: true });
    expect(editField("eok", "1,200")).toEqual({ value: 1200, status: "ok", confirmed: true });
    expect(editField("rate", "abc")).toMatchObject({ status: "error", raw: "abc" });
    expect(editField("rate", "21")).toMatchObject({ status: "error", note: "0~20% 사이여야 합니다." });
    expect(editField("rate", "")).toMatchObject({ status: "missing" });
  });
});

describe("기관 이름 짝 맞추기", () => {
  it("국민은행 ↔ KB국민은행처럼 비슷한 이름을 제안한다", () => {
    expect(nameSimilarity("국민은행", "KB국민은행")).toBeGreaterThanOrEqual(0.9);
    expect(suggestMatch("KB국민은행", ["국민은행", "신한은행"])).toBe("국민은행");
    expect(suggestMatch("(주)미래증권", ["미래 증권", "신한은행"])).toBe("미래 증권");
  });

  it("비슷한 이름이 없으면 제안하지 않는다", () => {
    expect(suggestMatch("하나은행", ["국민은행", "신한증권"])).toBeNull();
  });
});

describe("계산 잠금", () => {
  const conditions = exampleCases[0].conditions;

  it("모두 정상 인식·짝 맞춤이 끝나면 계산용 기관이 만들어지고, 계산하면 정답과 같다", () => {
    const check = checkReview(reviewOf(0), conditions);
    expect(check.institutions).toEqual(exampleCases[0].institutions);
    const plan = calculatePlan(check.institutions!, conditions);
    expect(plan.ok && plan.plan.totalYieldMilli).toBe(3411);
  });

  it("불확실·누락·오류가 하나라도 있으면 잠긴다", () => {
    const r = reviewOf(0);
    r.institutions[0].score = recognized("score", 95, true);
    r.institutions[1].existing = missing();
    r.institutions[2].products[0].rate = recognized("rate", 30);
    const check = checkReview(r, conditions);
    expect([check.uncertain, check.missing, check.errors]).toEqual([1, 1, 1]);
    expect(check.institutions).toBeNull();
  });

  it("PDF 이름이 명단과 다르면 짝을 맞추기 전까지 잠긴다", () => {
    const r = reviewOf(0, (n) => (n === "A은행" ? "KB A은행" : n));
    const check = checkReview(r, conditions);
    expect(check.unmatched).toEqual(["KB A은행"]);
    expect(check.onlyInConditions).toEqual(["A은행"]);
    expect(check.institutions).toBeNull();

    r.institutions[0].matchedName = suggestMatch("KB A은행", conditions.limits.map((l) => l.name));
    expect(checkReview(r, conditions).institutions?.[0].name).toBe("A은행");
  });

  it("두 기관을 같은 명단 이름에 연결하면 잠긴다", () => {
    const r = reviewOf(0);
    r.institutions[1].matchedName = "A은행";
    expect(checkReview(r, conditions).duplicated).toEqual(["A은행"]);
  });

  it("기관별 현재 잔액 합이 ①의 기존 예치금액과 다르면 잠긴다", () => {
    const check = checkReview(reviewOf(0), { ...conditions, existingTotal: 999 });
    expect(check.problems).toContain("기관별 현재 잔액의 합(1000억)이 ①의 기존 예치금액(999억)과 다릅니다.");
    expect(check.institutions).toBeNull();
  });

  it("직접 입력할 빈 기관은 모두 누락으로 시작한다", () => {
    const check = checkReview({ files: [], institutions: [emptyInstitution("A은행")] }, conditions);
    expect(check.missing).toBeGreaterThan(0);
    expect(check.institutions).toBeNull();
  });

  it("기초 조건이 없으면 잠긴다", () => {
    expect(checkReview(reviewOf(0), null).problems).toContain("① 기초 조건을 먼저 모두 입력해 주세요.");
  });
});
