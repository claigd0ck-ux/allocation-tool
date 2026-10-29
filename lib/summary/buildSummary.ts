// Design Ref: §3.1 ④ 근거 요약, §6 1번 결정 — 근거 요약은 코드가 정해진 문장 틀에 계산 결과를 채워 만든다(외부 전송 없음)
// Plan SC: 작업 17 (근거 요약 생성), 성공 기준 ⑤

import { allocationRows, MOVE_LABEL, type CalcSuccess } from "@/lib/calc/view";
import { formatEok, formatMilli } from "@/lib/domain/units";
import type { MoveChoice } from "@/lib/storage/workState";

export interface SummarySection {
  title: string;
  lines: string[];
}

/**
 * 결재·보고용 배분 근거 요약을 만든다. 숫자는 모두 계산 결과에서 그대로 가져온다.
 * 항목: ① 전체 규모 ② 순위와 기관별 배분 ③ 상품(만기) 배분과 수익률 ④ 한도 확인 ⑤ 선택한 자금 이동 방법
 */
export function buildSummary(r: CalcSuccess, choice: MoveChoice): SummarySection[] {
  const rows = allocationRows(r);
  const existingTotal = rows.reduce((s, x) => s + x.existing, 0);
  const newDeposit = r.total - existingTotal;
  const mix3 = r.total > 0 ? Math.round((r.amount3y / r.total) * 1000) / 10 : 0;

  const scale: SummarySection = {
    title: "1. 전체 규모",
    lines: [
      `전체 적립금은 ${formatEok(r.total)}입니다 (기존 예치금 ${formatEok(existingTotal)} + 신규 예치금 ${formatEok(newDeposit)}).`,
      `만기 구성은 1년물 ${formatEok(r.amount1y)}, 3년물 ${formatEok(r.amount3y)}(${mix3}%)입니다.`,
    ],
  };

  const ties = groupTies(rows);
  const rounded = rows.filter((x) => x.roundedUp);
  const ranking: SummarySection = {
    title: "2. 순위와 기관별 배분",
    lines: [
      "평가 점수로 순위를 정하고, 순위별 배분비율대로 기관별 금액을 정했습니다.",
      ...rows
        .filter((x) => !x.excluded)
        .map((x) => `${x.rank}위 ${x.name}(평가 ${x.score}점): 배분비율 ${x.ratioPct}% → ${formatEok(x.target)}`),
      ...(rows.some((x) => x.excluded)
        ? [
            `기관이 ${rows.length}곳이라 평가 하위 ${rows.filter((x) => x.excluded).length}곳은 배분에서 제외했습니다: ${rows
              .filter((x) => x.excluded)
              .map((x) => `${x.rank}위 ${x.name}(평가 ${x.score}점, 현재 잔액 ${formatEok(x.existing)}은 전액 다른 기관으로 이동)`)
              .join(", ")}.`,
          ]
        : []),
      ...ties.map((names) => `${names.join("·")}은(는) 평가 점수가 같아 같은 순위로 보고, 차지한 순위들의 배분비율을 합쳐 똑같이 나눴습니다.`),
      ...(rounded.length > 0
        ? [
            `억 원 미만은 버린 뒤, 모자란 금액은 버린 소수점이 큰 기관부터 1억씩 더했습니다: ${rounded
              .map((x) => `${x.name}(${x.exact}억 → ${formatEok(x.target)})`)
              .join(", ")}.`,
          ]
        : []),
    ],
  };

  const with3y = rows.filter((x) => x.amount3y > 0);
  const products: SummarySection = {
    title: "3. 상품(만기) 배분과 수익률",
    lines: [
      `전체 3년물 ${formatEok(r.amount3y)}을(를) 수수료 차감 수익이 가장 커지도록 ${
        with3y.length > 0 ? with3y.map((x) => `${x.name} ${formatEok(x.amount3y)}`).join(", ") : "배정할 기관 없이"
      }에 배정했습니다.`,
      ...rows
        .filter((x) => !x.excluded)
        .map((x) => `${x.name}: 1년물 ${formatEok(x.amount1y)}, 3년물 ${formatEok(x.amount3y)}, 수수료 차감 수익률 ${formatMilli(x.yieldMilli)}`),
      `전체 수수료 차감 수익률은 ${formatMilli(r.plan.totalYieldMilli)}입니다 (금리 − 수수료율, 소수 넷째 자리에서 반올림).`,
    ],
  };

  const overByRounding = rows.filter((x) => x.overLimitByRounding);
  const limits: SummarySection = {
    title: "4. 한도 확인",
    lines: [
      "모든 기관의 목표 금액이 배분 한도 안에 있습니다 (한도는 억 원 미만 처리 전 정확한 값으로 확인).",
      ...overByRounding.map(
        (x) => `${x.name}은(는) 억 원 미만 처리로 한도(${x.limitExact}억)를 1억 미만 넘지만(${formatEok(x.target)}), 규칙상 허용됩니다.`,
      ),
    ],
  };

  const plan = r.plan.moves[choice];
  const other: MoveChoice = choice === "minCount" ? "minAmount" : "minCount";
  const otherPlan = r.plan.moves[other];
  const deviations = rows.filter((x) => plan.finalAmounts[x.name] !== x.target);
  const moves: SummarySection = {
    title: "5. 자금 이동 방법",
    lines: [
      `${MOVE_LABEL[choice]} 기준을 선택했습니다: 송금 ${plan.count}회, 이동 금액 ${formatEok(plan.amount)}.`,
      ...plan.transfers.map((t) => `${t.from} → ${t.to} ${formatEok(t.amount)}`),
      ...(deviations.length > 0
        ? [
            `허용 오차 안에서 목표와 다르게 둔 기관: ${deviations
              .map((x) => {
                const d = plan.finalAmounts[x.name] - x.target;
                return `${x.name} ${formatEok(plan.finalAmounts[x.name])}(목표 대비 ${d > 0 ? "+" : ""}${d}억)`;
              })
              .join(", ")}.`,
          ]
        : ["모든 기관의 최종 금액이 목표 금액과 같습니다."]),
      r.plan.moves.same
        ? (r.notice ?? "")
        : `비교: ${MOVE_LABEL[other]} 기준은 송금 ${otherPlan.count}회, 이동 금액 ${formatEok(otherPlan.amount)}입니다.`,
    ],
  };

  return [scale, ranking, products, limits, moves];
}

/** 요약을 한 덩어리 글로 (엑셀·복사용). */
export function summaryText(sections: SummarySection[]): string {
  return sections.map((s) => [s.title, ...s.lines.map((l) => `- ${l}`)].join("\n")).join("\n\n");
}

/** 같은 순위로 묶인 기관 이름들 (두 곳 이상인 묶음만). */
function groupTies(rows: { rank: number; name: string }[]): string[][] {
  const byRank = new Map<number, string[]>();
  for (const r of rows) byRank.set(r.rank, [...(byRank.get(r.rank) ?? []), r.name]);
  return [...byRank.values()].filter((names) => names.length > 1);
}
