// Design Ref: examples/pdf/FORMAT.md — 제안서 글자 읽기 규칙
// Plan SC: 작업 13 (PDF 글자 추출)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "@/lib/pdf/extractText";
import { parseProposal, readEok, readPct, readTiers } from "@/lib/pdf/parseProposal";
import { checkReview } from "@/lib/review/review";
import { exampleCases } from "../helpers/cases";

const PDF_DIR = join(__dirname, "../../examples/pdf");
const pdf = (name: string) => new Uint8Array(readFileSync(join(PDF_DIR, name)));

describe("값 읽기 규칙", () => {
  it("금액: 억 원 표기와 원 단위", () => {
    expect(readEok("1,200억 원").value).toBe(1200);
    expect(readEok("1200억원").value).toBe(1200);
    expect(readEok("30,000,000,000원").value).toBe(300);
    expect(readEok("30,050,000,000원")).toMatchObject({ value: null, status: "uncertain", raw: "30,050,000,000원" });
    expect(readEok("3OO억 원").status).toBe("uncertain");
    expect(readEok("").status).toBe("missing");
  });

  it("비율: 쉼표 소수점·이상한 글자는 불확실, 20% 넘으면 오류", () => {
    expect(readPct("3.500%").value).toBe(3.5);
    expect(readPct("3,500%")).toMatchObject({ status: "uncertain", note: "소수점이 쉼표로 적혀 있습니다. 확인해 주세요." });
    expect(readPct("3.5?0%").status).toBe("uncertain");
    expect(readPct("25.000%").status).toBe("error");
  });

  it("수수료 구간: 여러 구간과 천 단위 쉼표", () => {
    const tiers = readTiers("0억 원 이상 0.150%, 1,200억 원 이상 0.100%");
    expect(tiers.map((t) => [t.from.value, t.fee.value])).toEqual([
      [0, 0.15],
      [1200, 0.1],
    ]);
  });
});

describe("표준 양식 제안서 읽기", () => {
  it("줄바꿈이 흐트러져도 항목 이름으로 나눠 읽고, 담당자는 읽지 않는다", () => {
    const text = "기관명: A은행 평가 점수: 95 현재 예치 잔액: 300억 원 수수료 적용 방식: 구간 전체 [1년물] 상품명: A은행 1년물 금리: 3.500% 수수료: 0억 원 이상 0.150% [3년물] 상품명: A은행 3년물 금리: 3.900% 수수료: 0억 원 이상 0.200% 담당자: 김담당";
    const { institution: i, foundLabels } = parseProposal(text);
    // 기관 4항목 + 만기 칸 2개 × (표시 + 상품명·금리·수수료) = 12 (담당자는 세지 않음)
    expect(foundLabels).toBe(12);
    expect([i.name.value, i.score.value, i.existing.value, i.feeMethod.value]).toEqual(["A은행", 95, 300, "whole"]);
    expect(i.products.map((p) => [p.name.value, p.rate.value])).toEqual([
      ["A은행 1년물", 3.5],
      ["A은행 3년물", 3.9],
    ]);
    expect(JSON.stringify(i)).not.toContain("김담당");
  });

  it("양식이 아닌 글자는 항목을 하나도 찾지 못한다", () => {
    expect(parseProposal("안녕하세요. 회의 자료입니다.").foundLabels).toBe(0);
  });
});

describe("예시 PDF (examples/pdf)", () => {
  it("A~D 네 기관 PDF를 읽으면 예시 1 기관 자료와 같다", async () => {
    for (const [k, expected] of exampleCases[0].institutions.entries()) {
      const text = await extractPdfText(pdf(`${expected.name}.pdf`));
      expect(text.ok).toBe(true);
      if (!text.ok) return;
      const { institution } = parseProposal(text.text);
      const review = { files: [], institutions: [{ ...institution, id: `p${k}`, sourceFile: "", matchedName: expected.name }] };
      const conditions = { ...exampleCases[0].conditions, existingTotal: expected.existing, limits: [{ name: expected.name, limitPct: 100 }] };
      const check = checkReview(review, conditions);
      expect(check.institutions?.[0]).toEqual({ ...expected, limitPct: 100 });
    }
  });

  it("수수료 적용 방식이 빠진 PDF는 그 칸만 누락", async () => {
    const text = await extractPdfText(pdf("C은행_누락.pdf"));
    const { institution } = parseProposal(text.ok ? text.text : "");
    expect(institution.feeMethod.status).toBe("missing");
    expect(institution.existing.value).toBe(150);
  });

  it("스캔본(글자를 그림으로 그린 PDF)은 글자가 나오지 않는다", async () => {
    const text = await extractPdfText(pdf("D은행_스캔본.pdf"));
    expect(text.ok && text.text).toBe("");
  });

  it("PDF가 아니면 읽을 수 없다고 알려준다", async () => {
    const text = await extractPdfText(new TextEncoder().encode("PDF 아님"));
    expect(text.ok).toBe(false);
  });
});
