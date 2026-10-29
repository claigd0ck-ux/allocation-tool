// Design Ref: §3.1 저장 열 — 입력·인식 결과·계산 결과를 이 PC의 브라우저에만 임시 저장하고 "초기화"로 지운다
// Plan SC: 작업 9 (작업 데이터 저장소). 서버·데이터베이스에는 저장하지 않는다(PRD 7절).

import type { CalcResult } from "@/lib/calc";
import type { ReviewState } from "@/lib/domain/review";

/** 브라우저 저장소의 키. 형식이 바뀌면 버전을 올려 예전 데이터를 버린다. */
export const STORAGE_KEY = "allocation-tool:work";
export const WORK_STATE_VERSION = 1;

/** 화면 단계: ① 기초 조건 ② PDF 업로드 ③ 확인·수정 ④ 계산 결과 ⑤ 내려받기 */
export type Step = 1 | 2 | 3 | 4 | 5;

/**
 * 기초 조건 입력 중인 값. 입력하는 도중의 빈칸·잘못된 값도 그대로 보존하려고 글자로 들고 있는다.
 * 계산할 때 검사를 거쳐 숫자(Conditions)로 바꾼다.
 */
export interface ConditionsDraft {
  existingTotal: string;
  newDeposit: string;
  /** tolerance: 이 기관에 허용 오차를 적용 (최대 2곳) */
  limits: { name: string; limitPct: string; tolerance?: boolean }[];
  rankRatios: string[];
  mix1y: string;
  mix3y: string;
  /** 전체 × 3년물 비율이 정수가 아닐 때만 쓰는 3년물 금액 */
  amount3y: string;
  tolerance: string;
}

export type MoveChoice = "minCount" | "minAmount";

export interface WorkState {
  version: typeof WORK_STATE_VERSION;
  step: Step;
  conditions: ConditionsDraft;
  review: ReviewState;
  /** 마지막 계산 결과 (조건을 바꾸면 지운다) */
  result: Extract<CalcResult, { ok: true }> | null;
  /** 실무자가 고른 이동 방법 */
  selectedMove: MoveChoice;
  /** 근거 요약: 코드가 만든 글과 (켰다면) AI로 다듬은 글 */
  summary: { text: string; polished: string | null } | null;
}

/** 아무것도 입력하지 않은 처음 상태. */
export function emptyWorkState(): WorkState {
  return {
    version: WORK_STATE_VERSION,
    step: 1,
    conditions: {
      existingTotal: "",
      newDeposit: "",
      limits: [],
      rankRatios: [],
      mix1y: "",
      mix3y: "",
      amount3y: "",
      tolerance: "",
    },
    review: { files: [], institutions: [] },
    result: null,
    selectedMove: "minCount",
    summary: null,
  };
}

/** 브라우저 저장소에서 필요한 부분만 (localStorage와 같은 모양, 테스트에서는 가짜를 넣는다). */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * 저장된 작업 데이터를 읽는다. 없거나, 깨졌거나, 버전이 다르면 처음 상태를 돌려준다.
 * 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서도 오류 없이 처음 상태로 시작한다.
 */
export function loadWorkState(storage: KeyValueStorage | null): WorkState {
  const raw = readRaw(storage);
  return raw === null ? emptyWorkState() : parseWorkState(raw);
}

/** 저장된 글자를 작업 데이터로 바꾼다. 형식이 맞지 않으면 처음 상태. */
export function parseWorkState(raw: string): WorkState {
  try {
    const data = JSON.parse(raw) as Partial<WorkState> | null;
    if (!data || data.version !== WORK_STATE_VERSION) return emptyWorkState();
    const base = emptyWorkState();
    return {
      ...base,
      ...data,
      conditions: { ...base.conditions, ...data.conditions },
      review: { ...base.review, ...data.review },
      step: isStep(data.step) ? data.step : 1,
    };
  } catch {
    return emptyWorkState();
  }
}

/** 작업 데이터를 저장한다. 저장에 실패하면(용량 초과 등) false. */
export function saveWorkState(storage: KeyValueStorage | null, state: WorkState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** "초기화": 저장된 작업 데이터를 모두 지운다. */
export function clearWorkState(storage: KeyValueStorage | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다
  }
}

/** 저장된 글자 그대로 (없으면 null). */
export function readRaw(storage: KeyValueStorage | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function isStep(value: unknown): value is Step {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}
