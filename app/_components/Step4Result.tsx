"use client";

// Design Ref: §2.2 ④ 계산 결과 — 목표 배분안(기관·상품별 금액, 수익률)과 두 이동 방법(송금 내역, 횟수·금액)을 나란히 보여준다
// Plan SC: 작업 16 (결과 화면)

import type { ReactNode } from "react";
import { allocationRows, MOVE_LABEL, type CalcSuccess } from "@/lib/calc/view";
import type { MovePlan } from "@/lib/domain/types";
import { formatEok, formatMilli } from "@/lib/domain/units";
import type { MoveChoice, WorkState } from "@/lib/storage/workState";

interface Props {
  state: WorkState;
  update: (fn: (s: WorkState) => WorkState) => void;
  /** 근거 요약 자리 (작업 17) */
  summary?: ReactNode;
}

export default function Step4Result({ state, update, summary }: Props) {
  const r = state.result;
  if (!r) return <p className="text-zinc-500">③에서 [계산 실행]을 먼저 눌러 주세요.</p>;
  const rows = allocationRows(r);
  const choose = (m: MoveChoice) => update((s) => ({ ...s, selectedMove: m, summary: null }));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="target-title">
        <h3 id="target-title" className="mb-3 text-lg font-semibold">목표 배분안</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 text-right text-zinc-600">
              <th className="py-2 text-left font-medium">순위</th>
              <th className="py-2 text-left font-medium">기관</th>
              <th className="py-2 font-medium">평가 점수</th>
              <th className="py-2 font-medium">배분비율</th>
              <th className="py-2 font-medium">목표 금액</th>
              <th className="py-2 font-medium">1년물</th>
              <th className="py-2 font-medium">3년물</th>
              <th className="py-2 font-medium">수수료 차감 수익률</th>
              <th className="py-2 font-medium">한도</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-zinc-100 text-right">
                <td className="py-2 text-left">{row.rank}</td>
                <td className="py-2 text-left font-medium">{row.name}</td>
                <td className="py-2">{row.score}</td>
                <td className="py-2">{row.ratioPct}%</td>
                <td className="py-2 font-semibold">
                  {formatEok(row.target)}
                  {row.roundedUp && <span className="ml-1 text-xs text-zinc-500" title={`정확한 값 ${row.exact}억`}>(+1억 보정)</span>}
                </td>
                <td className="py-2">{formatEok(row.amount1y)}</td>
                <td className="py-2">{formatEok(row.amount3y)}</td>
                <td className="py-2">{formatMilli(row.yieldMilli)}</td>
                <td className="py-2">
                  {row.limitExact}억
                  {row.overLimitByRounding && <span className="ml-1 text-xs text-amber-700">(억 원 미만 처리로 1억 미만 초과, 허용)</span>}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-zinc-300 text-right font-semibold">
              <td className="py-2 text-left" colSpan={4}>합계</td>
              <td className="py-2">{formatEok(r.total)}</td>
              <td className="py-2">{formatEok(r.amount1y)}</td>
              <td className="py-2">{formatEok(r.amount3y)}</td>
              <td className="py-2">전체 {formatMilli(r.plan.totalYieldMilli)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="move-title">
        <h3 id="move-title" className="mb-3 text-lg font-semibold">자금 이동 방법 비교</h3>
        {r.notice && <p className="mb-3 rounded-md bg-sky-50 px-4 py-2 text-sm text-sky-900">ℹ {r.notice}</p>}
        <div className="grid grid-cols-2 gap-4">
          {(["minCount", "minAmount"] as const).map((m) => (
            <MoveCard key={m} label={MOVE_LABEL[m]} plan={r.plan.moves[m]} result={r} selected={state.selectedMove === m} onSelect={() => choose(m)} />
          ))}
        </div>
      </section>

      {summary}

      <div>
        <button type="button" onClick={() => update((s) => ({ ...s, step: 1 }))}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100">
          조건 수정 후 다시 계산
        </button>
      </div>
    </div>
  );
}

function MoveCard(props: { label: string; plan: MovePlan; result: CalcSuccess; selected: boolean; onSelect: () => void }) {
  const { plan, result } = props;
  return (
    <div className={"rounded-lg border-2 p-4 " + (props.selected ? "border-zinc-900" : "border-zinc-200")}>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="radio" name="move" checked={props.selected} onChange={props.onSelect} />
        <span className="font-semibold">{props.label}</span>
        <span className="ml-auto text-sm">
          <strong>{plan.count}회</strong> · <strong>{formatEok(plan.amount)}</strong>
        </span>
      </label>
      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {plan.transfers.length === 0 && <li className="text-zinc-500">옮길 자금이 없습니다.</li>}
        {plan.transfers.map((t, i) => (
          <li key={i} className="flex justify-between border-b border-zinc-100 py-1">
            <span>{t.from} → {t.to}</span>
            <span>{formatEok(t.amount)}</span>
          </li>
        ))}
      </ul>
      <table className="mt-3 w-full text-xs text-zinc-600">
        <thead>
          <tr className="text-right">
            <th className="text-left font-medium">기관</th>
            <th className="font-medium">현재</th>
            <th className="font-medium">목표</th>
            <th className="font-medium">이동 후</th>
          </tr>
        </thead>
        <tbody>
          {result.targets.map((t) => {
            const final = plan.finalAmounts[t.institution.name];
            return (
              <tr key={t.institution.name} className="text-right">
                <td className="text-left">{t.institution.name}</td>
                <td>{formatEok(t.institution.existing)}</td>
                <td>{formatEok(t.target)}</td>
                <td className={final !== t.target ? "font-semibold text-zinc-900" : ""}>
                  {formatEok(final)}
                  {final !== t.target && ` (${final > t.target ? "+" : ""}${final - t.target})`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
