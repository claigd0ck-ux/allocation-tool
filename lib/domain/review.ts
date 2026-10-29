// Design Ref: §2.2 ③, §3.2 Field — PDF 인식 결과를 실무자가 확인·수정하는 동안의 데이터 형식
// Plan SC: 작업 9 (작업 데이터 저장소가 담는 형식), 작업 13~15에서 채운다.

import type { FeeMethod, Field, Maturity } from "./types";

/** 수수료 구간 하나 (화면 표시 그대로: 금액은 억 원, 수수료율은 % 숫자). */
export interface ReviewTier {
  from: Field<number>;
  fee: Field<number>;
}

/** 인식된 상품 하나 (금리는 % 숫자). */
export interface ReviewProduct {
  name: Field<string>;
  maturity: Field<Maturity>;
  rate: Field<number>;
  tiers: ReviewTier[];
}

/** PDF 하나에서 인식한 기관 하나. */
export interface ReviewInstitution {
  /** 화면에서 행을 구분하는 값 */
  id: string;
  /** 이 기관을 읽어 온 PDF 파일 이름 */
  sourceFile: string;
  name: Field<string>;
  score: Field<number>;
  /** 현재 잔액 (억 원) */
  existing: Field<number>;
  feeMethod: Field<FeeMethod>;
  products: ReviewProduct[];
  /** 기초 조건의 기관 명단 중 이 기관과 같다고 확인한 이름 (아직 짝을 안 맞췄으면 null) */
  matchedName: string | null;
}

/** 올린 PDF 파일 하나의 처리 상태. */
export interface ReviewFile {
  name: string;
  /** text: 글자 추출 / ocr: AI 인식 / failed: 표 인식 실패(값은 누락, AI 전송은 동의 시에만) */
  method: "text" | "ocr" | "failed";
  message?: string;
}

export interface ReviewState {
  files: ReviewFile[];
  institutions: ReviewInstitution[];
}
