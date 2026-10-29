// Design Ref: §3.3 검증 행 — examples/oracle.mjs의 정답을 비교하기 쉬운 형태로 정리한다
// Plan SC: 작업 2 (검증 하니스). 계산 코드(작업 3~7)는 이 정답과 필드별로 비교한다.

import { solve, yieldMilli } from "../../examples/oracle.mjs";
import type { Eok, Milli } from "@/lib/domain/types";
import type { RawCase } from "./cases";

export interface OracleMove {
  count: number;
  amount: Eok;
  /** 기관 이름 → 최종 금액 */
  finalAmounts: Record<string, Eok>;
  /** 같은 (횟수, 금액)을 내는 최적안의 개수 (송금 내역은 여럿일 수 있어 비교 대상이 아니다) */
  ties: number;
  transfers: { from: string; to: string; amount: Eok }[];
}

export interface OracleAnswer {
  total: Eok;
  /** 순위 순서대로 정렬된 기관별 정답 */
  institutions: {
    name: string;
    rank: number;
    target: Eok;
    yieldMilli: Milli;
    products: { name: string; maturity: "1y" | "3y"; amount: Eok; yieldMilli: Milli | null }[];
  }[];
  totalYieldMilli: Milli;
  /** 전체 수수료 차감 수익 (억 원 × 0.001%) */
  totalNet: number;
  /** 전체 수익이 최대인 상품 배분 조합의 개수 (1이면 상품별 금액까지 정답이 하나로 정해진다) */
  productOptimumWays: number;
  minCount: OracleMove;
  minAmount: OracleMove;
  /** 두 이동 방법의 기관별 최종 금액이 같은지 (안내 문구 표시 조건) */
  same: boolean;
}

/** oracle.mjs(JS)의 solve가 돌려주는 값 중 이 하니스가 쓰는 부분. */
interface OracleRawMove {
  count: number;
  amount: number;
  F: number[];
  ties: number;
  transfers: { from: string; to: string; amount: number }[];
}

interface OracleRaw {
  T: number;
  totalYield: number;
  totalNet: number;
  productOptimumWays: number;
  nodes: { name: string }[];
  alloc: {
    inst: { name: string };
    rank: number;
    target: number;
    net: number;
    products: { name: string; maturity: "1y" | "3y"; amount: number; yield: number | null }[];
  }[];
  minCount: OracleRawMove;
  minAmount: OracleRawMove;
}

/** 정답 계산기(oracle)를 실행해 비교용 형태로 돌려준다. */
export function oracleAnswer(c: RawCase): OracleAnswer {
  const r = (solve as unknown as (input: RawCase) => OracleRaw)(c);
  const names = r.nodes.map((n) => n.name);
  const toMove = (m: OracleRawMove): OracleMove => ({
    count: m.count,
    amount: m.amount,
    ties: m.ties,
    finalAmounts: Object.fromEntries(names.map((name, i) => [name, m.F[i]])),
    transfers: m.transfers,
  });
  const minCount = toMove(r.minCount);
  const minAmount = toMove(r.minAmount);
  return {
    total: r.T,
    institutions: r.alloc.map((a) => ({
      name: a.inst.name,
      rank: a.rank,
      target: a.target,
      yieldMilli: (yieldMilli as (net: number, amount: number) => number)(a.net, a.target),
      products: a.products.map((p) => ({
        name: p.name,
        maturity: p.maturity,
        amount: p.amount,
        yieldMilli: p.yield,
      })),
    })),
    totalYieldMilli: r.totalYield,
    totalNet: r.totalNet,
    productOptimumWays: r.productOptimumWays,
    minCount,
    minAmount,
    same: names.every((n) => minCount.finalAmounts[n] === minAmount.finalAmounts[n]),
  };
}
