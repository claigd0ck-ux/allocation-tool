"use client";

// Design Ref: §4.3 storage/useWorkState.ts — 화면들이 함께 쓰는 작업 데이터(브라우저 임시 저장)
// Plan SC: 작업 9. 새로고침해도 유지되고, reset()("초기화")으로 지운다.

import { useCallback, useSyncExternalStore } from "react";
import {
  clearWorkState,
  emptyWorkState,
  parseWorkState,
  readRaw,
  saveWorkState,
  STORAGE_KEY,
  type KeyValueStorage,
  type WorkState,
} from "./workState";

/** 같은 탭 안에서 저장이 바뀌었음을 알리는 이벤트 이름 (다른 탭은 브라우저의 storage 이벤트로 안다). */
const CHANGE_EVENT = "allocation-tool:work-change";

/** 서버에서 그릴 때와 처음 화면에서 쓰는 빈 상태 (매번 같은 객체여야 한다). */
const SERVER_SNAPSHOT = emptyWorkState();

let cachedRaw: string | null | undefined;
let cachedState: WorkState = SERVER_SNAPSHOT;
/** 저장소에 쓸 수 없을 때(사생활 보호 모드·용량 초과) 이 화면 안에서만 들고 있는 데이터 */
let memoryState: WorkState | null = null;

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 저장된 글자가 바뀌었을 때만 새로 읽어, 같은 내용이면 같은 객체를 돌려준다. */
function getSnapshot(): WorkState {
  if (memoryState) return memoryState;
  const raw = readRaw(browserStorage());
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = raw === null ? SERVER_SNAPSHOT : parseWorkState(raw);
  }
  return cachedState;
}

function getServerSnapshot(): WorkState {
  return SERVER_SNAPSHOT;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * 작업 데이터를 읽고 고친다.
 * - state: 지금 작업 데이터
 * - update(fn): 고친 결과를 저장하고 화면을 다시 그린다
 *   돌려주는 값: 브라우저에 저장됐으면 true, 저장소를 못 써서 이 화면 안에서만 유지되면 false(새로고침하면 사라진다고 안내)
 * - reset(): 초기화 (저장된 데이터를 모두 지운다)
 */
export function useWorkState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((fn: (current: WorkState) => WorkState) => {
    const next = fn(getSnapshot());
    const ok = saveWorkState(browserStorage(), next);
    memoryState = ok ? null : next;
    notify();
    return ok;
  }, []);

  const reset = useCallback(() => {
    clearWorkState(browserStorage());
    memoryState = null;
    cachedRaw = undefined;
    cachedState = SERVER_SNAPSHOT;
    notify();
  }, []);

  return { state, update, reset };
}
