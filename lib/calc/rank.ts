// Design Ref: §3.3 순위·목표 금액 행 — 점수 내림차순, 동점은 같은 순위로 묶는다
// Plan SC: 작업 3 (순위 계산). 작업 4(기관별 목표 금액)가 이 묶음으로 순위별 배분비율을 나눈다.

/** 같은 점수로 묶인 기관들. */
export interface RankGroup<T> {
  score: number;
  /** 이 묶음의 순위 (1부터). 앞 묶음의 기관 수만큼 건너뛴다 (예: 1, 2, 2, 4). */
  rank: number;
  /** 이 묶음이 차지하는 순위 칸의 시작 위치 (0부터). 순위별 배분비율 배열의 시작 인덱스와 같다. */
  start: number;
  /** 입력 순서를 유지한 묶음 안의 기관들. */
  members: T[];
}

/**
 * 평가 점수로 순위를 매긴다.
 * - 점수가 높을수록 순위가 높다.
 * - 점수가 같으면 같은 순위로 묶고, 다음 순위는 묶인 기관 수만큼 건너뛴다 (공동 2위 2곳 → 다음은 4위).
 * - 같은 점수 안에서는 입력 순서를 그대로 유지한다.
 */
export function rankByScore<T extends { score: number }>(items: readonly T[]): RankGroup<T>[] {
  for (const item of items) {
    if (!Number.isFinite(item.score)) {
      throw new RangeError(`평가 점수가 숫자가 아닙니다: ${item.score}`);
    }
  }

  // Array.prototype.sort는 안정 정렬이라 같은 점수끼리는 입력 순서가 유지된다.
  const sorted = [...items].sort((a, b) => b.score - a.score);

  const groups: RankGroup<T>[] = [];
  let position = 0;
  for (const item of sorted) {
    const last = groups.at(-1);
    if (last && last.score === item.score) {
      last.members.push(item);
    } else {
      groups.push({ score: item.score, rank: position + 1, start: position, members: [item] });
    }
    position += 1;
  }
  return groups;
}
