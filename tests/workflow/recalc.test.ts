// Design Ref: §2.2 ④ [조건 수정 후 다시 계산]
// Plan SC: 작업 20, 성공 기준 ②

import { describe, expect, it } from "vitest";
import type { ReviewInstitution } from "@/lib/domain/review";
import { recognized } from "@/lib/review/review";
import { emptyWorkState, type WorkState } from "@/lib/storage/workState";
import { recalculate } from "@/lib/workflow/recalc";
import { rawCases } from "../helpers/cases";

/** 예시 1을 ①·③까지 모두 마친 작업 데이터 */
function finishedExample1(): WorkState {
  const raw = rawCases[0];
  const institutions = raw.institutions.map(
    (i, k): ReviewInstitution => ({
      id: `r${k}`,
      sourceFile: `${i.name}.pdf`,
      name: recognized("text", i.name),
      score: recognized("score", i.score),
      existing: recognized("eok", i.existing),
      feeMethod: recognized("feeMethod", i.feeMethod),
      products: i.products.map((p) => ({
        name: recognized("text", p.name),
        maturity: recognized("maturity", p.maturity),
        rate: recognized("rate", p.rate),
        tiers: p.tiers.map((t) => ({ from: recognized("eok", t.from), fee: recognized("rate", t.fee) })),
      })),
      matchedName: i.name,
    }),
  );
  return {
    ...emptyWorkState(),
    step: 1,
    conditions: {
      existingTotal: "1000",
      newDeposit: "200",
      limits: raw.institutions.map((i) => ({ name: i.name, limitPct: String(i.limitPct) })),
      rankRatios: raw.rankRatios.map(String),
      mix1y: "90",
      mix3y: "10",
      amount3y: "",
      tolerance: "10",
    },
    review: { files: [], institutions },
  };
}

describe("조건 수정 후 다시 계산", () => {
  it("처음 계산: 예시 1 정답", () => {
    const r = recalculate(finishedExample1());
    expect(r.ok && [r.state.step, r.state.result?.total, r.state.result?.plan.totalYieldMilli]).toEqual([4, 1200, 3411]);
  });

  it("신규 예치금을 바꾸면 ②·③을 다시 거치지 않고 바로 새 결과가 나온다", () => {
    const s = finishedExample1();
    s.conditions.newDeposit = "300";
    const r = recalculate(s);
    expect(r.ok && r.state.result?.total).toBe(1300);
  });

  it("허용 오차를 0으로 바꾸면 이동 결과가 바뀐다", () => {
    const s = finishedExample1();
    s.conditions.tolerance = "0";
    const r = recalculate(s);
    expect(r.ok && r.state.result?.plan.moves.minCount.finalAmounts).toEqual({ A은행: 480, B증권: 360, C은행: 240, D은행: 120 });
  });

  it("조건이 틀리면 이유를 알려주고 계산하지 않는다", () => {
    const s = finishedExample1();
    s.conditions.rankRatios = ["10", "20", "30", "40"];
    expect(recalculate(s)).toEqual({ ok: false, reasons: ["① 기초 조건의 빨간 칸을 먼저 고쳐 주세요."] });
  });

  it("기관 명단을 바꾸면 짝 맞추기를 다시 하라고 알려준다", () => {
    const s = finishedExample1();
    s.conditions.limits[0].name = "에이은행";
    const r = recalculate(s);
    expect(r.ok ? [] : r.reasons).toContain("③ 확인·수정에서 기관 짝 맞추기를 끝내 주세요 (기관 명단이 바뀌었으면 다시 연결해야 합니다).");
  });

  it("기존 예치금액이 잔액 합과 달라지면 그 이유를 알려준다", () => {
    const s = finishedExample1();
    s.conditions.existingTotal = "1100";
    const r = recalculate(s);
    expect(r.ok ? [] : r.reasons).toContain("기관별 현재 잔액의 합(1000억)이 ①의 기존 예치금액(1100억)과 다릅니다.");
  });
});
