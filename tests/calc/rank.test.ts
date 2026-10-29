// Design Ref: §8 L1 — 순위 계산 코드를 정답(oracle)과 비교한다
// Plan SC: 작업 3 (순위 계산)

import { describe, expect, it } from "vitest";
import { rankByScore } from "@/lib/calc/rank";
import { exampleCases, rawCases } from "../helpers/cases";
import { oracleAnswer } from "../helpers/oracle";
import { randomCase } from "../helpers/randomCase";

/** 묶음을 펼쳐 [기관 이름, 순위] 목록으로 만든다 (oracle과 같은 순서). */
function flatten<T extends { name: string; score: number }>(items: T[]) {
  return rankByScore(items).flatMap((g) => g.members.map((m) => ({ name: m.name, rank: g.rank })));
}

describe("순위 계산이 정답과 같다", () => {
  const all = [...rawCases, ...Array.from({ length: 30 }, (_, i) => randomCase(i + 1))];
  for (const c of all) {
    it(c.id, () => {
      const expected = oracleAnswer(c).institutions.map((i) => ({ name: i.name, rank: i.rank }));
      expect(flatten(c.institutions)).toEqual(expected);
    });
  }

  it("예시 2: B증권·C은행 공동 2위, D은행은 4위 (3위 없음)", () => {
    const groups = rankByScore(exampleCases[1].institutions);
    expect(groups.map((g) => ({ rank: g.rank, start: g.start, names: g.members.map((m) => m.name) }))).toEqual([
      { rank: 1, start: 0, names: ["A은행"] },
      { rank: 2, start: 1, names: ["B증권", "C은행"] },
      { rank: 4, start: 3, names: ["D은행"] },
    ]);
  });
});

describe("순위 계산 규칙", () => {
  const item = (name: string, score: number) => ({ name, score });

  it("점수가 높을수록 순위가 높고, 입력 순서와 상관없다", () => {
    expect(flatten([item("가", 80), item("나", 95), item("다", 90)])).toEqual([
      { name: "나", rank: 1 },
      { name: "다", rank: 2 },
      { name: "가", rank: 3 },
    ]);
  });

  it("동점 묶음 다음 순위는 묶인 기관 수만큼 건너뛴다", () => {
    const groups = rankByScore([item("가", 90), item("나", 90), item("다", 90), item("라", 70)]);
    expect(groups.map((g) => [g.rank, g.start, g.members.length])).toEqual([
      [1, 0, 3],
      [4, 3, 1],
    ]);
  });

  it("동점 안에서는 입력 순서를 유지한다", () => {
    const groups = rankByScore([item("나", 88), item("가", 88)]);
    expect(groups[0].members.map((m) => m.name)).toEqual(["나", "가"]);
  });

  it("소수 점수도 비교한다", () => {
    expect(flatten([item("가", 88.5), item("나", 88.25)]).map((x) => x.rank)).toEqual([1, 2]);
  });

  it("기관이 없으면 빈 목록", () => {
    expect(rankByScore([])).toEqual([]);
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const input = [item("가", 80), item("나", 95)];
    rankByScore(input);
    expect(input.map((x) => x.name)).toEqual(["가", "나"]);
  });

  it("점수가 숫자가 아니면 오류를 낸다", () => {
    expect(() => rankByScore([item("가", Number.NaN)])).toThrow("평가 점수가 숫자가 아닙니다");
  });
});
