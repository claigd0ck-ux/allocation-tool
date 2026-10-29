// Design Ref: §4.3 pdf/toTable.ts, examples/pdf/FORMAT.md — 제안서 글자에서 기관·상품·수수료 표를 읽는다
// Plan SC: 작업 13 (PDF 글자 추출). 없는 값은 "누락", 애매한 값은 노란색(불확실), 범위 밖은 오류. 추측하지 않는다.

import type { FeeMethod, Field, Maturity } from "@/lib/domain/types";
import type { ReviewInstitution, ReviewProduct, ReviewTier } from "@/lib/domain/review";
import { missing, recognized } from "@/lib/review/review";

export type ParsedInstitution = Omit<ReviewInstitution, "id" | "sourceFile" | "matchedName">;

export interface ParsedProposal {
  institution: ParsedInstitution;
  /** 찾은 항목 수 (0이면 이 양식의 제안서가 아니다) */
  foundLabels: number;
}

/** 항목 이름 (긴 것부터 — "수수료 적용 방식"이 "수수료"보다 먼저) */
const LABEL = /(수수료\s*적용\s*방식|현재\s*예치\s*잔액|평가\s*점수|기관명|상품명|금리|수수료|담당자)\s*[:：]|\[\s*([13])\s*년물\s*\]/g;

type Key = "feeMethod" | "existing" | "score" | "name" | "productName" | "rate" | "tiers" | "contact" | "section1y" | "section3y";

function keyOf(label: string | undefined, section: string | undefined): Key {
  if (section) return section === "1" ? "section1y" : "section3y";
  const l = (label ?? "").replace(/\s+/g, "");
  return (
    {
      수수료적용방식: "feeMethod",
      현재예치잔액: "existing",
      평가점수: "score",
      기관명: "name",
      상품명: "productName",
      금리: "rate",
      수수료: "tiers",
    } as Record<string, Key>
  )[l] ?? "contact";
}

/** 제안서 글자(줄바꿈이 흐트러져도 됨)를 읽어 확인 화면용 기관 자료로 바꾼다. */
export function parseProposal(text: string): ParsedProposal {
  const tokens: { key: Key; value: string }[] = [];
  const matches = [...text.matchAll(LABEL)];
  matches.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    tokens.push({ key: keyOf(m[1], m[2]), value: text.slice(start, end).replace(/\s+/g, " ").trim() });
  });

  const inst: ParsedInstitution = {
    name: missing(),
    score: missing(),
    existing: missing(),
    feeMethod: missing(),
    products: [blankProduct("1y"), blankProduct("3y")],
  };
  let section: ReviewProduct | null = null;

  for (const { key, value } of tokens) {
    switch (key) {
      case "name":
        if (value) inst.name = value.includes("?") ? unsure(value, "글자가 분명하지 않습니다.") : recognized("text", value);
        break;
      case "score":
        inst.score = readNumber(value, "score");
        break;
      case "existing":
        inst.existing = readEok(value);
        break;
      case "feeMethod":
        inst.feeMethod = readFeeMethod(value);
        break;
      case "section1y":
        section = inst.products[0];
        break;
      case "section3y":
        section = inst.products[1];
        break;
      case "productName":
        if (section && value) section.name = value.includes("?") ? unsure(value, "글자가 분명하지 않습니다.") : recognized("text", value);
        break;
      case "rate":
        if (section) section.rate = readPct(value);
        break;
      case "tiers":
        if (section) section.tiers = readTiers(value);
        break;
      default:
        // 담당자 등 사람 이름·연락처는 읽지 않는다 (PRD 7절)
        break;
    }
  }

  // 같은 항목이 두 번 이상 나오면(숨은 글자로 값 바꿔치기 등) 어느 값이 맞는지 모르므로 노란색으로 확인을 받는다
  const seen = new Map<string, number>();
  let section2 = "";
  for (const { key } of tokens) {
    if (key === "section1y" || key === "section3y") section2 = key;
    const scoped = ["productName", "rate", "tiers"].includes(key) ? `${section2}:${key}` : key;
    seen.set(scoped, (seen.get(scoped) ?? 0) + 1);
  }
  const dup = (k: string) => (seen.get(k) ?? 0) > 1;
  const flag = <T>(f: Field<T>): Field<T> =>
    f.status === "ok" ? { ...f, status: "uncertain", confirmed: false, note: "PDF에 같은 항목이 두 번 이상 있습니다. 원본과 대조해 확인해 주세요." } : f;
  if (dup("name")) inst.name = flag(inst.name);
  if (dup("score")) inst.score = flag(inst.score);
  if (dup("existing")) inst.existing = flag(inst.existing);
  if (dup("feeMethod")) inst.feeMethod = flag(inst.feeMethod);
  inst.products.forEach((p, i) => {
    const s = i === 0 ? "section1y" : "section3y";
    if (dup(`${s}:productName`)) p.name = flag(p.name);
    if (dup(`${s}:rate`)) p.rate = flag(p.rate);
    if (dup(`${s}:tiers`)) p.tiers = p.tiers.map((t) => ({ from: flag(t.from), fee: flag(t.fee) }));
  });

  return { institution: inst, foundLabels: tokens.filter((t) => t.key !== "contact").length };
}

function blankProduct(maturity: Maturity): ReviewProduct {
  return { name: missing(), maturity: recognized("maturity", maturity), rate: missing(), tiers: [{ from: missing(), fee: missing() }] };
}

/** 값을 확정하지 못한 칸: 원래 글자를 보여주고 노란색으로 확인을 받는다. */
function unsure<T>(raw: string, note: string): Field<T> {
  return { value: null, status: "uncertain", confirmed: false, raw, note };
}

const NUMBER = /^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+(\.\d+)?$/;

function readNumber(value: string, kind: "score"): Field<number> {
  const v = value.replace(/점$/, "").trim();
  if (!v) return missing();
  if (!NUMBER.test(v)) return unsure(value, "숫자를 분명하게 읽지 못했습니다.");
  return recognized(kind, Number(v.replace(/,/g, "")));
}

/** 금액: "1,200억 원" → 1200. 원 단위는 억 원으로 딱 떨어질 때만. */
export function readEok(value: string): Field<number> {
  const v = value.replace(/\s+/g, "");
  if (!v) return missing();
  const eok = /^([\d,]+)억(원)?$/.exec(v);
  if (eok && NUMBER.test(eok[1])) return recognized("eok", Number(eok[1].replace(/,/g, "")));
  const won = /^([\d,]+)원$/.exec(v);
  if (won && NUMBER.test(won[1])) {
    const n = Number(won[1].replace(/,/g, ""));
    if (n % 100_000_000 === 0) return recognized("eok", n / 100_000_000);
    return unsure(value, "억 원 단위로 딱 떨어지지 않습니다. 억 원 정수로 고쳐 주세요.");
  }
  return unsure(value, "금액을 분명하게 읽지 못했습니다.");
}

/** 금리·수수료율: "3.500%" → 3.5. 쉼표 소수점("3,500%")이나 다른 글자가 섞이면 불확실. */
export function readPct(value: string): Field<number> {
  const v = value.replace(/\s+/g, "");
  if (!v) return missing();
  const m = /^(\d+(\.\d+)?)%$/.exec(v);
  if (!m) return unsure(value, /^\d+,\d+%$/.test(v) ? "소수점이 쉼표로 적혀 있습니다. 확인해 주세요." : "비율을 분명하게 읽지 못했습니다.");
  return recognized("rate", Number(m[1]));
}

function readFeeMethod(value: string): Field<FeeMethod> {
  const v = value.replace(/\s+/g, "");
  if (!v) return missing();
  if (v === "구간전체") return recognized("feeMethod", "whole");
  if (v === "누진") return recognized("feeMethod", "progressive");
  return unsure(value, "'구간 전체' 또는 '누진'이 아닙니다. 골라 주세요.");
}

/** 수수료 구간: "0억 원 이상 0.150%, 300억 원 이상 0.100%" */
export function readTiers(value: string): ReviewTier[] {
  if (!value.trim()) return [{ from: missing(), fee: missing() }];
  const parts = value
    .split(/%\s*[,/]\s*/)
    .map((p, i, all) => (i < all.length - 1 ? `${p}%` : p).trim())
    .filter(Boolean);
  return parts.map((part) => {
    const m = /^(.+?)이상\s*(.+)$/.exec(part.replace(/\s+/g, " "));
    if (!m) return { from: unsure<number>(part, "구간을 분명하게 읽지 못했습니다."), fee: unsure<number>(part, "구간을 분명하게 읽지 못했습니다.") };
    return { from: readEok(m[1]), fee: readPct(m[2]) };
  });
}
