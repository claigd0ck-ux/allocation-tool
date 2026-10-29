// Design Ref: §3.2 — 기관·상품·수수료 구간·기초 조건·계산 결과의 공통 데이터 형식
// Plan SC: 작업 1 (공통 데이터 형식 정의). 화면·계산·파일 처리 코드가 모두 이 파일의 타입을 공유한다.

// ───────── 단위 ─────────

/** 억 원 단위 금액. 항상 정수다(소수점 없음). */
export type Eok = number;

/** 0.001% 단위 정수. 금리·수수료율·수익률에 쓴다 (예: 3.500% = 3500). */
export type Milli = number;

// ───────── 입력 데이터 ─────────

/** 수수료 구간: 예치 금액이 `from`(억 원) 이상일 때 `fee`를 적용한다. */
export interface FeeTier {
  from: Eok;
  fee: Milli;
}

/** 수수료 적용 방식: whole = 해당 구간 요율을 전체 금액에, progressive = 구간별로 나눠 적용(누진). */
export type FeeMethod = "whole" | "progressive";

/** 만기 구분: 1년물 / 3년물. */
export type Maturity = "1y" | "3y";

/** 기관이 제시한 상품 하나. */
export interface Product {
  name: string;
  maturity: Maturity;
  rate: Milli;
  tiers: FeeTier[];
}

/** 예치기관 하나. 상품은 만기별로 1개씩(1년물·3년물). */
export interface Institution {
  name: string;
  /** 평가 점수. 높을수록 순위가 높고, 같으면 같은 순위로 본다. */
  score: number;
  /** 현재 예치 잔액 (억 원). */
  existing: Eok;
  /** 배분 한도: 전체 적립금 대비 %. 기관 전체의 합이 100이어야 한다. */
  limitPct: number;
  feeMethod: FeeMethod;
  products: Product[];
}

/** 기초 조건 (화면 ① 또는 엑셀 양식으로 입력). */
export interface Conditions {
  /** 입력한 기존 예치금액. 기관별 현재 잔액의 합과 같아야 한다. */
  existingTotal: Eok;
  newDeposit: Eok;
  /** 기관 명단과 한도(%). 합계 100. */
  limits: { name: string; limitPct: number }[];
  /** 순위별 배분비율(%). 1위부터 순서대로, 합계 100, 순위순으로 같거나 작아야 한다. */
  rankRatios: number[];
  /** 만기 구성 비율(%) — 전체 적립금 기준. */
  maturityMix: { "1y": number; "3y": number };
  /** 전체 × 3년물 비율이 억 원 정수가 아닐 때 실무자가 정한 3년물 금액. */
  amount3y?: Eok;
  /** 허용 오차 (억 원 정수, ±). 모든 기관에 같은 폭. */
  tolerance: Eok;
}

// ───────── 인식 결과의 상태 표시 (화면 ③) ─────────

/** 값의 상태: ok 정상 / uncertain 인식이 불확실(노란색) / missing 누락 / error 범위 오류(빨간색). */
export type FieldStatus = "ok" | "uncertain" | "missing" | "error";

/** PDF 인식 결과의 값 하나. 실무자가 확인(confirmed)해야 계산 잠금이 풀린다. */
export interface Field<T> {
  value: T | null;
  status: FieldStatus;
  confirmed: boolean;
  /** 숫자로 바꿀 수 없는 글자를 입력했을 때 그 글자 (화면에 그대로 보여주고 빨갛게 표시) */
  raw?: string;
  /** 오류·불확실 이유 */
  note?: string;
}

// ───────── 계산 결과 ─────────

/** 기관 안의 상품별 배분 결과. */
export interface ProductAllocation {
  name: string;
  amount: Eok;
  /** 수수료 차감 수익률. 배분 금액이 0이면 null. */
  yieldMilli: Milli | null;
}

/** 기관별 목표 배분 결과. */
export interface Allocation {
  name: string;
  /** 순위(1부터). 동점이면 같은 순위. */
  rank: number;
  target: Eok;
  products: ProductAllocation[];
  yieldMilli: Milli;
}

/** 송금 1건: "어디서 → 어디로". 신규 예치금은 from = "신규". */
export interface Transfer {
  from: string;
  to: string;
  amount: Eok;
}

/** 자금 이동 방법 하나. */
export interface MovePlan {
  /** 기관별 최종 금액 (기관 이름 → 금액). */
  finalAmounts: Record<string, Eok>;
  count: number;
  amount: Eok;
  transfers: Transfer[];
}

/** 전체 계산 결과. */
export interface PlanResult {
  allocations: Allocation[];
  totalYieldMilli: Milli;
  moves: {
    minCount: MovePlan;
    minAmount: MovePlan;
    /** 두 방법의 기관별 최종 금액이 같으면 true (안내 문구 표시 조건). */
    same: boolean;
  };
}
