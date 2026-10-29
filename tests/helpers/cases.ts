// Design Ref: §8 — 예시 자료(examples/cases.json)를 계산 코드가 쓰는 형식(lib/domain)으로 바꾼다
// Plan SC: 작업 2 (검증 하니스). 이후 계산 작업(3~7)이 이 입력으로 정답과 비교한다.

import raw from "../../examples/cases.json";
import type { Conditions, Institution } from "@/lib/domain/types";
import { pctToMilli } from "@/lib/domain/units";

/** cases.json 한 건의 원본 형식 (금리·수수료율은 % 숫자, 금액은 억 원). */
export interface RawCase {
  id: string;
  title: string;
  newDeposit: number;
  rankRatios: number[];
  maturityMix: { "1y": number; "3y": number };
  tolerance: number;
  institutions: {
    name: string;
    score: number;
    existing: number;
    limitPct: number;
    feeMethod: "whole" | "progressive";
    products: {
      name: string;
      maturity: "1y" | "3y";
      rate: number;
      tiers: { from: number; fee: number }[];
    }[];
  }[];
}

/** 계산 코드의 입력: 기관 목록 + 기초 조건. */
export interface CaseInput {
  id: string;
  title: string;
  institutions: Institution[];
  conditions: Conditions;
}

/** 원본 형식을 계산 코드 형식으로 바꾼다 (%는 0.001% 정수로). */
export function toCaseInput(c: RawCase): CaseInput {
  const institutions: Institution[] = c.institutions.map((i) => ({
    name: i.name,
    score: i.score,
    existing: i.existing,
    limitPct: i.limitPct,
    feeMethod: i.feeMethod,
    products: i.products.map((p) => ({
      name: p.name,
      maturity: p.maturity,
      rate: pctToMilli(p.rate),
      tiers: p.tiers.map((t) => ({ from: t.from, fee: pctToMilli(t.fee) })),
    })),
  }));
  return {
    id: c.id,
    title: c.title,
    institutions,
    conditions: {
      existingTotal: institutions.reduce((sum, i) => sum + i.existing, 0),
      newDeposit: c.newDeposit,
      limits: institutions.map((i) => ({ name: i.name, limitPct: i.limitPct })),
      rankRatios: c.rankRatios,
      maturityMix: c.maturityMix,
      tolerance: c.tolerance,
    },
  };
}

/** 예시 자료 3건 (정상 / 동점 / 억 원 미만 처리). */
export const rawCases = (raw as { cases: RawCase[] }).cases;
export const exampleCases: CaseInput[] = rawCases.map(toCaseInput);
