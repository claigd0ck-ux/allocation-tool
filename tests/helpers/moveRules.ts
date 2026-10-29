// Design Ref: §8 — 이동 방법이 PRD 규칙을 모두 지키는지 검사하는 함수
// Plan SC: 작업 2 (검증 하니스). 송금 내역은 여러 안이 있을 수 있어, 내역 자체가 아니라 규칙 준수 여부로 판단한다.

import type { Eok } from "@/lib/domain/types";

export interface MoveToCheck {
  count: number;
  amount: Eok;
  finalAmounts: Record<string, Eok>;
  transfers: { from: string; to: string; amount: Eok }[];
}

export interface MoveCheckInput {
  total: Eok;
  newDeposit: Eok;
  tolerance: Eok;
  /** 순위 순서대로 정렬된 기관 (기존 잔액, 목표 금액, 순위) */
  institutions: { name: string; existing: Eok; target: Eok; rank: number }[];
}

/** 규칙 위반 내용을 문장 목록으로 돌려준다. 비어 있으면 모든 규칙을 지킨 것이다. */
export function moveRuleViolations(move: MoveToCheck, input: MoveCheckInput): string[] {
  const errors: string[] = [];
  const names = input.institutions.map((i) => i.name);

  // 최종 금액: 합계 = 전체 적립금, 목표 ± 허용 오차, 0 이상
  const finalSum = names.reduce((s, n) => s + move.finalAmounts[n], 0);
  if (finalSum !== input.total) errors.push(`최종 금액 합계 ${finalSum} ≠ 전체 ${input.total}`);
  for (const i of input.institutions) {
    const f = move.finalAmounts[i.name];
    if (f < 0) errors.push(`${i.name} 최종 금액이 음수`);
    if (Math.abs(f - i.target) > input.tolerance) errors.push(`${i.name} 최종 ${f}가 목표 ${i.target} ± ${input.tolerance} 밖`);
  }

  // 순위 순서 규칙: 순위가 더 뒤인 기관이 더 앞선 기관보다 많이 받으면 안 된다 (같은 순위끼리는 비교 안 함)
  for (const a of input.institutions) {
    for (const b of input.institutions) {
      if (a.rank < b.rank && move.finalAmounts[a.name] < move.finalAmounts[b.name]) {
        errors.push(`${b.name}(${b.rank}위)가 ${a.name}(${a.rank}위)보다 많이 받음`);
      }
    }
  }

  // 송금 내역: 건수 = 이동 횟수, 금액 합 = 이동 금액, 신규 예치금 전액 사용, 기관별 잔액 흐름이 최종 금액과 일치
  if (move.transfers.length !== move.count) errors.push(`송금 ${move.transfers.length}건 ≠ 이동 횟수 ${move.count}`);
  const transferSum = move.transfers.reduce((s, t) => s + t.amount, 0);
  if (transferSum !== move.amount) errors.push(`송금 합계 ${transferSum} ≠ 이동 금액 ${move.amount}`);
  const fromNew = move.transfers.filter((t) => t.from === "신규").reduce((s, t) => s + t.amount, 0);
  if (fromNew !== input.newDeposit) errors.push(`신규에서 나간 금액 ${fromNew} ≠ 신규 예치금 ${input.newDeposit}`);
  for (const i of input.institutions) {
    const incoming = move.transfers.filter((t) => t.to === i.name).reduce((s, t) => s + t.amount, 0);
    const outgoing = move.transfers.filter((t) => t.from === i.name).reduce((s, t) => s + t.amount, 0);
    const result = i.existing + incoming - outgoing;
    if (result !== move.finalAmounts[i.name]) errors.push(`${i.name} 잔액 흐름 ${result} ≠ 최종 ${move.finalAmounts[i.name]}`);
  }
  for (const t of move.transfers) {
    if (t.amount <= 0) errors.push(`송금 금액이 0 이하: ${t.from} → ${t.to}`);
    if (t.from === t.to) errors.push(`같은 기관 안의 이동: ${t.from}`);
  }
  return errors;
}
