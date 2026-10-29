// Design Ref: §3.1 저장 열 — 브라우저 임시 저장·초기화 동작 확인 (브라우저 대신 가짜 저장소 사용)
// Plan SC: 작업 9 (작업 데이터 저장소)

import { describe, expect, it } from "vitest";
import { calculatePlan } from "@/lib/calc";
import {
  clearWorkState,
  emptyWorkState,
  loadWorkState,
  saveWorkState,
  STORAGE_KEY,
  type KeyValueStorage,
  type WorkState,
} from "@/lib/storage/workState";
import { exampleCases } from "../helpers/cases";

/** localStorage를 흉내 내는 메모리 저장소 */
function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** 쓸 때마다 오류를 내는 저장소 (사생활 보호 모드·용량 초과 흉내) */
const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error("차단됨");
  },
  setItem: () => {
    throw new Error("용량 초과");
  },
  removeItem: () => {
    throw new Error("차단됨");
  },
};

function filledState(): WorkState {
  const c = exampleCases[0];
  const result = calculatePlan(c.institutions, c.conditions);
  if (!result.ok) throw new Error("예시 계산 실패");
  return {
    ...emptyWorkState(),
    step: 4,
    conditions: { ...emptyWorkState().conditions, newDeposit: "200", tolerance: "10", rankRatios: ["40", "30", "20", "10"] },
    result,
    selectedMove: "minAmount",
    summary: { text: "근거 요약", polished: null },
  };
}

describe("작업 데이터 저장소", () => {
  it("처음에는 빈 상태 (① 기초 조건 단계)", () => {
    const s = loadWorkState(memoryStorage());
    expect(s).toEqual(emptyWorkState());
    expect(s.step).toBe(1);
  });

  it("저장한 것을 그대로 다시 읽는다 (새로고침해도 유지)", () => {
    const storage = memoryStorage();
    const state = filledState();
    expect(saveWorkState(storage, state)).toBe(true);
    expect(loadWorkState(storage)).toEqual(state);
  });

  it("초기화하면 저장된 데이터가 지워지고 빈 상태로 돌아간다", () => {
    const storage = memoryStorage();
    saveWorkState(storage, filledState());
    clearWorkState(storage);
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
    expect(loadWorkState(storage)).toEqual(emptyWorkState());
  });

  it("깨진 데이터나 다른 버전은 버리고 빈 상태로 시작한다", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{망가진 글자");
    expect(loadWorkState(storage)).toEqual(emptyWorkState());
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...filledState(), version: 999 }));
    expect(loadWorkState(storage)).toEqual(emptyWorkState());
  });

  it("일부 항목이 빠진 데이터는 빈 값으로 채운다", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, step: 3, conditions: { newDeposit: "50" } }));
    const s = loadWorkState(storage);
    expect(s.step).toBe(3);
    expect(s.conditions.newDeposit).toBe("50");
    expect(s.conditions.tolerance).toBe("");
    expect(s.review).toEqual({ files: [], institutions: [] });
  });

  it("단계 값이 잘못되면 ① 단계로", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, step: 9 }));
    expect(loadWorkState(storage).step).toBe(1);
  });

  it("저장소를 쓸 수 없어도 오류 없이 동작한다 (저장 실패는 false로 알려준다)", () => {
    expect(loadWorkState(brokenStorage)).toEqual(emptyWorkState());
    expect(saveWorkState(brokenStorage, filledState())).toBe(false);
    expect(() => clearWorkState(brokenStorage)).not.toThrow();
    expect(loadWorkState(null)).toEqual(emptyWorkState());
    expect(saveWorkState(null, filledState())).toBe(false);
  });

  it("서버로 보내지 않는다 — 저장소 키 하나에만 쓴다", () => {
    const storage = memoryStorage();
    saveWorkState(storage, filledState());
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
  });
});
