"use client";

// Design Ref: §2.2 ③ 인식 결과 확인·수정 — 칸 직접 수정, 노란 칸 확인, 범위 오류 빨간색, 기관 짝 맞추기, 모두 확인 전 [계산 실행] 잠금
// Plan SC: 작업 15

import { useState } from "react";
import { calculatePlan } from "@/lib/calc";
import type { FeeMethod, Field } from "@/lib/domain/types";
import type { ReviewInstitution, ReviewProduct, ReviewState } from "@/lib/domain/review";
import { checkReview, confirmField, displayName, editField, emptyInstitution, emptyTier, suggestMatch, type FieldKind } from "@/lib/review/review";
import type { WorkState } from "@/lib/storage/workState";
import { checkConditions } from "@/lib/validate/conditions";

interface Props {
  state: WorkState;
  update: (fn: (s: WorkState) => WorkState) => void;
}

export default function Step3Review({ state, update }: Props) {
  const [calcErrors, setCalcErrors] = useState<string[]>([]);
  const conditionsCheck = checkConditions(state.conditions);
  const conditions = conditionsCheck.ok ? conditionsCheck.conditions : null;
  const conditionNames = conditions?.limits.map((l) => l.name) ?? state.conditions.limits.map((l) => l.name.trim()).filter(Boolean);
  const review = state.review;
  const check = checkReview(review, conditions);

  // 인식 결과를 고치면 예전 계산 결과는 맞지 않으므로 지운다
  const editReview = (fn: (r: ReviewState) => ReviewState) => {
    setCalcErrors([]);
    update((s) => ({ ...s, review: fn(s.review), result: null, summary: null }));
  };
  const editInst = (id: string, fn: (i: ReviewInstitution) => ReviewInstitution) =>
    editReview((r) => ({ ...r, institutions: r.institutions.map((i) => (i.id === id ? fn(i) : i)) }));

  const addMissingFromConditions = () =>
    editReview((r) => {
      const present = new Set(r.institutions.map((i) => i.matchedName));
      return { ...r, institutions: [...r.institutions, ...conditionNames.filter((n) => !present.has(n)).map((n) => emptyInstitution(n))] };
    });

  const runCalculation = () => {
    if (!check.institutions || !conditions) return;
    const result = calculatePlan(check.institutions, conditions);
    if (!result.ok) {
      setCalcErrors(result.errors.map((e) => e.message));
      return;
    }
    update((s) => ({ ...s, result, summary: null, step: 4 }));
  };

  const total = check.uncertain + check.missing + check.errors;

  return (
    <div className="flex flex-col gap-6">
      <div className={"rounded-md px-4 py-3 text-sm " + (check.institutions ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900")}>
        {check.institutions ? (
          "✔ 모든 항목을 확인했습니다. [계산 실행]을 눌러 주세요."
        ) : (
          <>
            ⚠ 확인할 항목 {check.uncertain}개 · 누락 {check.missing}개 · 오류 {check.errors}개 · 기관 짝 맞추기 {check.unmatched.length}건 미완료
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={addMissingFromConditions} disabled={conditionNames.length === 0}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50">
          + 명단의 기관 직접 입력
        </button>
        <span className="self-center text-xs text-zinc-500">PDF가 없거나 인식이 실패한 기관은 직접 입력할 수 있습니다.</span>
      </div>

      {review.institutions.map((inst) => (
        <InstitutionCard key={inst.id} inst={inst} conditionNames={conditionNames} editInst={editInst}
          onRemove={() => editReview((r) => ({ ...r, institutions: r.institutions.filter((i) => i.id !== inst.id) }))} />
      ))}

      {(check.onlyInConditions.length > 0 || check.duplicated.length > 0 || check.problems.length > 0) && (
        <div className="rounded-md border border-zinc-200 p-4 text-sm">
          {check.onlyInConditions.length > 0 && <p>① 명단에만 있는 기관: {check.onlyInConditions.join(", ")}</p>}
          {check.duplicated.length > 0 && <p className="text-red-600">같은 명단 이름에 두 기관 이상이 연결됨: {check.duplicated.join(", ")}</p>}
          {check.problems.map((p) => (
            <p key={p} className="text-red-600">{p}</p>
          ))}
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        <button type="button" onClick={runCalculation} disabled={!check.institutions}
          className="rounded-md bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
          {check.institutions ? "계산 실행" : `🔒 계산 실행 (확인할 항목 ${total + check.unmatched.length + check.onlyInConditions.length}개)`}
        </button>
        {calcErrors.map((e) => (
          <p key={e} className="text-sm text-red-600">{e}</p>
        ))}
      </div>
    </div>
  );
}

function InstitutionCard(props: {
  inst: ReviewInstitution;
  conditionNames: string[];
  editInst: (id: string, fn: (i: ReviewInstitution) => ReviewInstitution) => void;
  onRemove: () => void;
}) {
  const { inst, conditionNames, editInst } = props;
  const name = displayName(inst);
  const suggestion = inst.matchedName ? null : suggestMatch(inst.name.value ?? "", conditionNames);
  const set = <K extends "name" | "score" | "existing">(key: K, kind: FieldKind) => (text: string) =>
    editInst(inst.id, (i) => ({ ...i, [key]: editField(kind, text) as Field<never> }));
  const confirm = <K extends "name" | "score" | "existing" | "feeMethod">(key: K) => () =>
    editInst(inst.id, (i) => ({ ...i, [key]: confirmField(i[key] as Field<unknown>) }));
  const editProduct = (index: number, fn: (p: ReviewProduct) => ReviewProduct) =>
    editInst(inst.id, (i) => ({ ...i, products: i.products.map((p, k) => (k === index ? fn(p) : p)) }));

  return (
    <section className="rounded-lg border border-zinc-200 p-4" aria-label={`${name} 자료`}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{inst.sourceFile}</span>
          <label className="flex items-center gap-2">
            <span>명단의 기관과 연결</span>
            <select
              value={inst.matchedName ?? ""}
              onChange={(e) => editInst(inst.id, (i) => ({ ...i, matchedName: e.target.value || null }))}
              className={"rounded-md border px-2 py-1 " + (inst.matchedName ? "border-zinc-300" : "border-amber-400 bg-amber-50")}
            >
              <option value="">— 선택 —</option>
              {conditionNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          {suggestion && (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
              &ldquo;{inst.name.value}&rdquo; ↔ &ldquo;{suggestion}&rdquo; 같은 기관인가요?{" "}
              <button type="button" className="ml-1 underline" onClick={() => editInst(inst.id, (i) => ({ ...i, matchedName: suggestion }))}>같아요</button>
            </span>
          )}
        </div>
        <button type="button" onClick={props.onRemove} className="text-sm text-zinc-500 hover:text-zinc-900">이 기관 삭제</button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Cell label="기관명 (PDF 표기)" field={inst.name} kind="text" onEdit={set("name", "text")} onConfirm={confirm("name")} />
        <Cell label="평가 점수" field={inst.score} kind="score" onEdit={set("score", "score")} onConfirm={confirm("score")} />
        <Cell label="현재 잔액 (억 원)" field={inst.existing} kind="eok" onEdit={set("existing", "eok")} onConfirm={confirm("existing")} />
        <FeeMethodCell field={inst.feeMethod} onConfirm={confirm("feeMethod")}
          onChange={(v) => editInst(inst.id, (i) => ({ ...i, feeMethod: v ? { value: v, status: "ok", confirmed: true } : { value: null, status: "missing", confirmed: false } }))} />
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="w-16 py-2 font-medium">만기</th>
            <th className="py-2 font-medium">상품명</th>
            <th className="w-36 py-2 font-medium">금리 (%)</th>
            <th className="py-2 font-medium">수수료 구간 (금액 이상 → 수수료율 %)</th>
          </tr>
        </thead>
        <tbody>
          {inst.products.map((p, pi) => (
            <tr key={pi} className="border-b border-zinc-100 align-top">
              <td className="py-2">{p.maturity.value === "3y" ? "3년물" : "1년물"}</td>
              <td className="py-2 pr-3">
                <Cell label={`${p.maturity.value} 상품명`} hideLabel field={p.name} kind="text"
                  onEdit={(t) => editProduct(pi, (x) => ({ ...x, name: editField("text", t) as Field<string> }))}
                  onConfirm={() => editProduct(pi, (x) => ({ ...x, name: confirmField(x.name) }))} />
              </td>
              <td className="py-2 pr-3">
                <Cell label={`${p.maturity.value} 금리`} hideLabel field={p.rate} kind="rate"
                  onEdit={(t) => editProduct(pi, (x) => ({ ...x, rate: editField("rate", t) as Field<number> }))}
                  onConfirm={() => editProduct(pi, (x) => ({ ...x, rate: confirmField(x.rate) }))} />
              </td>
              <td className="py-2">
                <div className="flex flex-col gap-2">
                  {p.tiers.map((t, ti) => (
                    <div key={ti} className="flex items-start gap-2">
                      <div className="w-28">
                        <Cell label={`구간 ${ti + 1} 시작 금액`} hideLabel field={t.from} kind="eok" suffix="억~"
                          onEdit={(v) => editProduct(pi, (x) => ({ ...x, tiers: x.tiers.map((y, k) => (k === ti ? { ...y, from: editField("eok", v) as Field<number> } : y)) }))}
                          onConfirm={() => editProduct(pi, (x) => ({ ...x, tiers: x.tiers.map((y, k) => (k === ti ? { ...y, from: confirmField(y.from) } : y)) }))} />
                      </div>
                      <div className="w-28">
                        <Cell label={`구간 ${ti + 1} 수수료율`} hideLabel field={t.fee} kind="rate" suffix="%"
                          onEdit={(v) => editProduct(pi, (x) => ({ ...x, tiers: x.tiers.map((y, k) => (k === ti ? { ...y, fee: editField("rate", v) as Field<number> } : y)) }))}
                          onConfirm={() => editProduct(pi, (x) => ({ ...x, tiers: x.tiers.map((y, k) => (k === ti ? { ...y, fee: confirmField(y.fee) } : y)) }))} />
                      </div>
                      {p.tiers.length > 1 && (
                        <button type="button" className="pt-1.5 text-zinc-500 hover:text-zinc-900"
                          onClick={() => editProduct(pi, (x) => ({ ...x, tiers: x.tiers.filter((_, k) => k !== ti) }))}>삭제</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="self-start text-xs text-zinc-600 underline"
                    onClick={() => editProduct(pi, (x) => ({ ...x, tiers: [...x.tiers, emptyTier()] }))}>+ 구간 추가</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const STATUS_STYLE: Record<string, string> = {
  ok: "border-zinc-300",
  uncertain: "border-amber-400 bg-amber-100",
  missing: "border-zinc-300 bg-zinc-100",
  error: "border-red-500 bg-red-50",
};

function Cell(props: {
  label: string;
  hideLabel?: boolean;
  field: Field<string | number>;
  kind: FieldKind;
  suffix?: string;
  onEdit: (text: string) => void;
  onConfirm: () => void;
}) {
  const { field } = props;
  const shown = field.raw ?? (field.value === null ? "" : String(field.value));
  const needsConfirm = field.status === "uncertain" && !field.confirmed;
  // 입력 중에는 글자를 그대로 두고, 칸을 벗어날 때 검사한다
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className={props.hideLabel ? "sr-only" : "text-zinc-600"}>{props.label}</span>
      <span className="flex items-center gap-1">
        <input
          type="text"
          value={editing ? text : shown}
          placeholder={field.status === "missing" ? "누락" : undefined}
          onFocus={() => {
            setText(shown);
            setEditing(true);
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (text !== shown) props.onEdit(text);
          }}
          aria-invalid={field.status === "error" ? true : undefined}
          className={"w-full rounded-md border px-2 py-1.5 " + (props.kind === "text" ? "" : "text-right ") + STATUS_STYLE[needsConfirm ? "uncertain" : field.status === "uncertain" ? "ok" : field.status]}
        />
        {props.suffix && <span className="whitespace-nowrap text-zinc-500">{props.suffix}</span>}
        {needsConfirm && (
          <button type="button" onClick={props.onConfirm} className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white">확인</button>
        )}
      </span>
      {field.note && field.status !== "ok" && <span className="text-xs text-red-600">{field.note}</span>}
    </label>
  );
}

function FeeMethodCell(props: { field: Field<FeeMethod>; onChange: (v: FeeMethod | null) => void; onConfirm: () => void }) {
  const { field } = props;
  const needsConfirm = field.status === "uncertain" && !field.confirmed;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-zinc-600">수수료 적용 방식</span>
      <span className="flex items-center gap-1">
        <select
          value={field.value ?? ""}
          onChange={(e) => props.onChange((e.target.value || null) as FeeMethod | null)}
          className={"w-full rounded-md border px-2 py-1.5 " + STATUS_STYLE[needsConfirm ? "uncertain" : field.value ? "ok" : "missing"]}
        >
          <option value="">누락 — 선택</option>
          <option value="whole">구간 전체</option>
          <option value="progressive">누진</option>
        </select>
        {needsConfirm && (
          <button type="button" onClick={props.onConfirm} className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white">확인</button>
        )}
      </span>
    </label>
  );
}
