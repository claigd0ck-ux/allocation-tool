"use client";

// Design Ref: §2.2 ① 기초 조건 — 금액·기관 명단과 한도·순위별 배분비율·만기 구성 비율·허용 오차를 입력하고 바로 검사한다
// Plan SC: 작업 11 (기초 조건 입력 화면)

import { useState, type ReactNode } from "react";
import { includedCount } from "@/lib/calc/exclusion";
import type { ConditionsDraft, WorkState } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";
import { parsePct, sumPct } from "@/lib/validate/numbers";
import { recalculate } from "@/lib/workflow/recalc";

interface Props {
  state: WorkState;
  update: (fn: (s: WorkState) => WorkState) => void;
  /** 엑셀 양식 내려받기·올리기 버튼 자리 (작업 12) */
  toolbar?: ReactNode;
  /** [다음 단계]를 눌러 본 뒤면 true — 그때부터 빈칸도 빨갛게 표시한다 */
  showRequired: boolean;
}

const REQUIRED = "값을 입력해 주세요.";

export default function Step1Conditions({ state, update, toolbar, showRequired }: Props) {
  const draft = state.conditions;
  const check = checkConditions(draft);
  // 처음 화면부터 빈칸이 모두 빨갛지 않도록, "값을 입력해 주세요"·"기관을 한 곳 이상"은 [다음 단계]를 눌러 본 뒤에만 보인다
  const err = showRequired
    ? check.errors
    : Object.fromEntries(
        Object.entries(check.errors).filter(([key, msg]) => msg !== REQUIRED && !(key === "limits" && draft.limits.length === 0)),
      );

  // 조건을 바꾸면 예전 계산 결과·근거 요약은 맞지 않으므로 지운다
  const edit = (fn: (d: ConditionsDraft) => ConditionsDraft) =>
    update((s) => ({ ...s, conditions: fn(s.conditions), result: null, summary: null }));
  const set = (key: Exclude<keyof ConditionsDraft, "limits" | "rankRatios">) => (value: string) =>
    edit((d) => ({ ...d, [key]: value }));

  // 배분비율 칸 수 = 배분 대상 기관 수 (9곳 이상이면 하위 2곳 제외)
  const resizeRatios = (ratios: string[], institutionCount: number) => {
    const n = includedCount(institutionCount);
    return ratios.length >= n ? ratios.slice(0, n) : [...ratios, ...Array<string>(n - ratios.length).fill("")];
  };
  const addInstitution = () =>
    edit((d) => ({ ...d, limits: [...d.limits, { name: "", limitPct: "" }], rankRatios: resizeRatios(d.rankRatios, d.limits.length + 1) }));
  const removeInstitution = (i: number) =>
    edit((d) => ({ ...d, limits: d.limits.filter((_, k) => k !== i), rankRatios: resizeRatios(d.rankRatios, d.limits.length - 1) }));
  const excludedCount = draft.limits.length - includedCount(draft.limits.length);

  const pctSum = (texts: string[]) => {
    if (texts.length === 0) return null;
    const values = texts.map((t) => parsePct(t));
    return values.every((v) => v.ok) ? sumPct(values.map((v) => (v.ok ? v.value : 0))) : null;
  };
  const limitSum = pctSum(draft.limits.map((l) => l.limitPct));
  const ratioSum = pctSum(draft.rankRatios);

  return (
    <div className="flex flex-col gap-8">
      {toolbar && <div className="flex gap-2">{toolbar}</div>}

      <Group title="예치금액 (억 원)">
        <NumberField label="기존 예치금액" unit="억" value={draft.existingTotal} onChange={set("existingTotal")} error={err.existingTotal}
          hint="기관별 현재 잔액의 합과 같아야 합니다 (③에서 확인)" />
        <NumberField label="신규 예치금액" unit="억" value={draft.newDeposit} onChange={set("newDeposit")} error={err.newDeposit} />
      </Group>

      <Group title="기관 명단과 배분 한도 (전체 적립금 대비 %)">
        <table className="w-full max-w-2xl text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="w-12 py-2 font-medium">#</th>
              <th className="py-2 font-medium">기관명</th>
              <th className="w-40 py-2 font-medium">한도(%)</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {draft.limits.map((row, i) => (
              <tr key={i} className="border-b border-zinc-100 align-top">
                <td className="py-2 text-zinc-500">{i + 1}</td>
                <td className="py-2 pr-3">
                  <TextInput label={`${i + 1}번 기관명`} value={row.name} error={err[`limits.${i}.name`]}
                    onChange={(v) => edit((d) => ({ ...d, limits: d.limits.map((l, k) => (k === i ? { ...l, name: v } : l)) }))} />
                </td>
                <td className="py-2 pr-3">
                  <TextInput label={`${i + 1}번 한도`} value={row.limitPct} numeric suffix="%" error={err[`limits.${i}.limitPct`]}
                    onChange={(v) => edit((d) => ({ ...d, limits: d.limits.map((l, k) => (k === i ? { ...l, limitPct: v } : l)) }))} />
                </td>
                <td className="py-2">
                  <button type="button" onClick={() => removeInstitution(i)} className="rounded px-2 py-1.5 text-zinc-500 hover:bg-zinc-100">
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-4">
          <button type="button" onClick={addInstitution} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100">
            + 기관 추가
          </button>
          <SumBadge sum={limitSum} />
        </div>
        <ErrorText text={err.limits} />
      </Group>

      <Group title="순위별 배분비율 (%) — 평가 점수 순위대로">
        {draft.rankRatios.length === 0 ? (
          <p className="text-sm text-zinc-500">기관을 추가하면 순위 칸이 생깁니다.</p>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            {draft.rankRatios.map((r, i) => (
              <div key={i} className="w-28">
                <TextInput label={`${i + 1}위`} showLabel value={r} numeric suffix="%" error={err[`rankRatios.${i}`]}
                  onChange={(v) => edit((d) => ({ ...d, rankRatios: d.rankRatios.map((x, k) => (k === i ? v : x)) }))} />
              </div>
            ))}
            <div className="pt-7">
              <SumBadge sum={ratioSum} />
            </div>
          </div>
        )}
        {excludedCount > 0 && (
          <p className="text-sm text-zinc-600">
            기관이 {draft.limits.length}곳이라 평가 하위 {excludedCount}곳은 배분에서 제외됩니다. 제외 기관의 잔액은 전액 다른 기관으로 옮기며,
            배분비율은 배분 대상 {draft.rankRatios.length}곳만 입력합니다.
          </p>
        )}
        <ErrorText text={err.rankRatios} />
      </Group>

      <Group title="만기 구성 비율 (전체 적립금 기준, %)">
        <div className="flex items-start gap-3">
          <div className="w-28">
            <TextInput label="1년물" showLabel value={draft.mix1y} numeric suffix="%" error={err.mix1y} onChange={set("mix1y")} />
          </div>
          <div className="w-28">
            <TextInput label="3년물" showLabel value={draft.mix3y} numeric suffix="%" error={err.mix3y} onChange={set("mix3y")} />
          </div>
          <div className="pt-7">
            <SumBadge sum={pctSum([draft.mix1y, draft.mix3y])} />
          </div>
        </div>
        <ErrorText text={err.mix} />
        {check.amount3yNeeded && (
          <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              전체 × 3년물 비율이 {check.amount3yNeeded.exact}억으로 억 원 정수가 아닙니다. 3년물 금액을 정해 주세요.
            </p>
            <div className="mt-2 flex items-center gap-2">
              {[check.amount3yNeeded.lower, check.amount3yNeeded.upper].map((v) => (
                <button key={v} type="button" onClick={() => set("amount3y")(String(v))}
                  className={"rounded-md border px-3 py-1 " + (draft.amount3y === String(v) ? "border-amber-700 bg-amber-100" : "border-amber-300 bg-white")}>
                  {v}억
                </button>
              ))}
              <div className="w-32">
                <TextInput label="3년물 금액" value={draft.amount3y} numeric suffix="억" error={err.amount3y} onChange={set("amount3y")} />
              </div>
            </div>
          </div>
        )}
      </Group>

      <Group title="허용 오차 (억 원, ±)">
        <NumberField label="허용 오차" unit="억" value={draft.tolerance} onChange={set("tolerance")} error={err.tolerance}
          hint="자금 이동 때 기관별 목표 금액에서 벗어나도 되는 폭 (모든 기관에 같은 폭). 비우면 계산할 수 없습니다." />
      </Group>

      <p className={"text-sm " + (check.ok ? "text-emerald-700" : "text-zinc-500")}>
        {check.ok ? "✔ 기초 조건을 모두 확인했습니다. [다음 단계]로 PDF를 올려 주세요." : "빨간 칸을 모두 고쳐야 다음 단계로 갈 수 있습니다."}
      </p>

      {state.review.institutions.length > 0 && <QuickRecalc state={state} update={update} />}
    </div>
  );
}

/** 이미 기관 자료를 확인해 둔 상태에서 조건만 바꿨을 때: ②·③을 다시 거치지 않고 바로 계산한다 (작업 20). */
function QuickRecalc({ state, update }: Pick<Props, "state" | "update">) {
  const [reasons, setReasons] = useState<string[]>([]);
  const run = () => {
    const r = recalculate(state);
    if (!r.ok) {
      setReasons(r.reasons);
      return;
    }
    setReasons([]);
    update(() => r.state);
  };
  return (
    <div className="rounded-md border border-zinc-200 p-4 text-sm">
      <p className="mb-2 text-zinc-600">확인을 마친 기관 자료가 있습니다. 조건만 바꿨다면 바로 다시 계산할 수 있습니다.</p>
      <button type="button" onClick={run} className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700">
        바뀐 조건으로 바로 다시 계산
      </button>
      {reasons.map((r) => (
        <p key={r} className="mt-2 text-red-600">{r}</p>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-base font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function NumberField(props: { label: string; unit: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  return (
    <div className="flex max-w-2xl items-start gap-4">
      <span className="w-32 pt-2 text-sm">{props.label}</span>
      <div className="w-48">
        <TextInput label={props.label} value={props.value} numeric suffix={props.unit} error={props.error} onChange={props.onChange} />
      </div>
      {props.hint && <span className="pt-2 text-xs text-zinc-500">{props.hint}</span>}
    </div>
  );
}

function TextInput(props: {
  label: string;
  showLabel?: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  numeric?: boolean;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className={props.showLabel ? "text-zinc-600" : "sr-only"}>{props.label}</span>
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode={props.numeric ? "decimal" : undefined}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.error ? true : undefined}
          className={
            "w-full rounded-md border px-3 py-1.5 " +
            (props.numeric ? "text-right " : "") +
            (props.error ? "border-red-500 bg-red-50" : "border-zinc-300")
          }
        />
        {props.suffix && <span className="text-zinc-500">{props.suffix}</span>}
      </span>
      <ErrorText text={props.error} />
    </label>
  );
}

function ErrorText({ text }: { text?: string }) {
  return text ? <span className="text-xs text-red-600">{text}</span> : null;
}

function SumBadge({ sum }: { sum: number | null }) {
  if (sum === null) return <span className="text-sm text-zinc-400">합계 —</span>;
  const ok = sum === 100;
  return <span className={"text-sm font-medium " + (ok ? "text-emerald-700" : "text-red-600")}>합계 {sum}% {ok ? "✔" : "✖"}</span>;
}
