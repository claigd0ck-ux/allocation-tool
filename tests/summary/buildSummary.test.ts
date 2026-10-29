// Design Ref: §3.1 ④ 근거 요약 — 코드가 만든 요약이 계산 결과 숫자를 그대로 담는지
// Plan SC: 작업 17, 성공 기준 ⑤

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import { buildSummary, summaryText } from "@/lib/summary/buildSummary";
import { exampleCases } from "../helpers/cases";

function result(index: number) {
  const c = exampleCases[index];
  const r = calculatePlan(c.institutions, c.conditions);
  if (!r.ok) throw new Error("계산 실패");
  return r;
}

describe("배분 근거 요약", () => {
  it("다섯 항목으로 구성된다", () => {
    expect(buildSummary(result(0), "minCount").map((s) => s.title)).toEqual([
      "1. 전체 규모",
      "2. 순위와 기관별 배분",
      "3. 상품(만기) 배분과 수익률",
      "4. 한도 확인",
      "5. 자금 이동 방법",
    ]);
  });

  it("예시 1: 전체 규모·3년물 배정·전체 수익률·두 방법이 같다는 안내", () => {
    const text = summaryText(buildSummary(result(0), "minCount"));
    expect(text).toContain("전체 적립금은 1,200억입니다 (기존 예치금 1,000억 + 신규 예치금 200억)");
    expect(text).toContain("전체 3년물 120억을(를) 수수료 차감 수익이 가장 커지도록 B증권 120억에 배정했습니다");
    expect(text).toContain("전체 수수료 차감 수익률은 3.411%");
    expect(text).toContain("송금 3회, 이동 금액 270억");
    expect(text).toContain("두 방법의 결과가 같습니다");
  });

  it("예시 2: 동점 기관 설명", () => {
    const text = summaryText(buildSummary(result(1), "minCount"));
    expect(text).toContain("B증권·C은행은(는) 평가 점수가 같아 같은 순위로 보고");
    expect(text).toContain("2위 C은행(평가 88점): 배분비율 25% → 250억");
  });

  it("예시 3: 억 원 미만 보정과 한도 1억 미만 초과(허용) 설명, 다른 방법과 비교", () => {
    const text = summaryText(buildSummary(result(2), "minAmount"));
    expect(text).toContain("A은행(370.8억 → 371억), D은행(154.5억 → 155억)");
    expect(text).toContain("A은행은(는) 억 원 미만 처리로 한도(370.8억)를 1억 미만 넘지만(371억), 규칙상 허용됩니다.");
    expect(text).toContain("최소 이동 금액 기준을 선택했습니다: 송금 4회, 이동 금액 104억.");
    expect(text).toContain("비교: 최소 이동 횟수 기준은 송금 3회, 이동 금액 113억입니다.");
  });

  it("고른 방법이 바뀌면 요약도 바뀐다", () => {
    const r = result(2);
    expect(summaryText(buildSummary(r, "minCount"))).toContain("최소 이동 횟수 기준을 선택했습니다: 송금 3회, 이동 금액 113억.");
  });
});
