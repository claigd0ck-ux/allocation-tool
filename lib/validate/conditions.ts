// Design Ref: §2.2 ① / §5 — 기초 조건 입력값 검사. 모든 문제를 한 번에 모아 칸별로 보여준다
// Plan SC: 작업 11 (기초 조건 입력 화면). 통과하면 계산용 Conditions로 바꾼다.

import { includedCount } from "@/lib/calc/exclusion";
import { MAX_TOLERANCE_TARGETS } from "@/lib/calc/toleranceAdvice";
import type { Conditions } from "@/lib/domain/types";
import type { ConditionsDraft } from "@/lib/storage/workState";
import { parseEok, parsePct, sumPct } from "./numbers";

/** 칸 이름: "newDeposit", "limits.0.name", "rankRatios.2" 처럼 칸 하나를 가리킨다. 표 전체 문제는 "limits", "rankRatios" 등. */
export type FieldKey = string;

export type ConditionsCheck =
  | { ok: true; conditions: Conditions; errors: Record<FieldKey, string>; amount3yNeeded: AmountChoice | null }
  | { ok: false; errors: Record<FieldKey, string>; amount3yNeeded: AmountChoice | null };

/** 3년물 금액을 실무자가 정해야 할 때의 안내 (예: 123.5억 → 123억 또는 124억). */
export interface AmountChoice {
  exact: number;
  lower: number;
  upper: number;
}

/**
 * 기초 조건 입력값을 검사한다.
 * - 금액(기존·신규 예치금액, 허용 오차)은 0 이상의 억 원 정수
 * - 기관 명단: 이름 필수·중복 금지, 한도(%) 합계 100%
 * - 순위별 배분비율: 기관 수만큼, 합계 100%, 순위순으로 같거나 작아짐
 * - 만기 구성 비율: 1년물 + 3년물 = 100%
 * - 전체 × 3년물 비율이 억 원 정수가 아니면 3년물 금액 필수
 * - 허용 오차를 적용할 기관은 최대 2곳
 */
export function checkConditions(draft: ConditionsDraft): ConditionsCheck {
  const errors: Record<FieldKey, string> = {};
  const num = <T>(key: FieldKey, parsed: { ok: true; value: T } | { ok: false; message: string }): T | null => {
    if (parsed.ok) return parsed.value;
    errors[key] = parsed.message;
    return null;
  };

  const existingTotal = num("existingTotal", parseEok(draft.existingTotal));
  const newDeposit = num("newDeposit", parseEok(draft.newDeposit));
  const tolerance = num("tolerance", parseEok(draft.tolerance));

  // 기관 명단·한도
  if (draft.limits.length === 0) errors.limits = "기관을 한 곳 이상 입력해 주세요.";
  const seen = new Set<string>();
  const limits = draft.limits.map((row, i) => {
    const name = row.name.trim();
    if (!name) errors[`limits.${i}.name`] = "기관 이름을 입력해 주세요.";
    else if (seen.has(name)) errors[`limits.${i}.name`] = "같은 이름의 기관이 이미 있습니다.";
    seen.add(name);
    return { name, limitPct: num(`limits.${i}.limitPct`, parsePct(row.limitPct)) };
  });
  const limitValues = limits.map((l) => l.limitPct);
  if (limits.length > 0 && limitValues.every((v) => v !== null)) {
    const sum = sumPct(limitValues as number[]);
    if (sum !== 100) errors.limits = `한도 합계가 100%가 아닙니다 (지금 ${sum}%).`;
  }

  // 허용 오차 적용 기관: 담당자가 최대 2곳 선택
  const toleranceTargets = draft.limits.filter((row) => row.tolerance && row.name.trim()).map((row) => row.name.trim());
  if (toleranceTargets.length > MAX_TOLERANCE_TARGETS) {
    errors.toleranceTargets = `허용 오차는 ${MAX_TOLERANCE_TARGETS}곳까지만 적용할 수 있습니다 (지금 ${toleranceTargets.length}곳).`;
  }

  // 순위별 배분비율
  const ratios = draft.rankRatios.map((r, i) => num(`rankRatios.${i}`, parsePct(r)));
  const kept = includedCount(draft.limits.length);
  if (draft.rankRatios.length !== kept) {
    errors.rankRatios =
      kept === draft.limits.length
        ? `순위별 배분비율은 기관 수(${kept}곳)만큼 입력해야 합니다.`
        : `기관이 ${draft.limits.length}곳이라 평가 하위 ${draft.limits.length - kept}곳은 제외되므로, 순위별 배분비율은 ${kept}개를 입력해야 합니다.`;
  } else if (ratios.length > 0 && ratios.every((v) => v !== null)) {
    const values = ratios as number[];
    const sum = sumPct(values);
    if (sum !== 100) errors.rankRatios = `배분비율 합계가 100%가 아닙니다 (지금 ${sum}%).`;
    else if (values.some((v, i) => i > 0 && v > values[i - 1])) {
      errors.rankRatios = "배분비율은 1위부터 순서대로 같거나 작아야 합니다.";
    }
  }

  // 만기 구성 비율
  const mix1y = num("mix1y", parsePct(draft.mix1y));
  const mix3y = num("mix3y", parsePct(draft.mix3y));
  if (mix1y !== null && mix3y !== null && sumPct([mix1y, mix3y]) !== 100) {
    errors.mix = `1년물과 3년물 비율의 합이 100%여야 합니다 (지금 ${sumPct([mix1y, mix3y])}%).`;
  }

  // 3년물 금액 (전체 × 3년물 비율이 정수가 아닐 때만)
  let amount3yNeeded: AmountChoice | null = null;
  let amount3y: number | undefined;
  if (existingTotal !== null && newDeposit !== null && mix3y !== null) {
    const total = existingTotal + newDeposit;
    const milli = Math.round(mix3y * 1000);
    if ((total * milli) % 100_000 !== 0) {
      const exact = (total * milli) / 100_000;
      amount3yNeeded = { exact, lower: Math.floor(exact), upper: Math.floor(exact) + 1 };
      const parsed = num("amount3y", parseEok(draft.amount3y));
      // 금액·비율이 바뀌면 예전 3년물 금액은 맞지 않으므로, 지금 비율에 가까운 두 값 중 하나만 받는다
      if (parsed !== null && parsed !== amount3yNeeded.lower && parsed !== amount3yNeeded.upper) {
        errors.amount3y = `금액이나 비율이 바뀌었습니다. 3년물 금액을 ${amount3yNeeded.lower}억 또는 ${amount3yNeeded.upper}억으로 다시 정해 주세요.`;
      } else if (parsed !== null) amount3y = parsed;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors, amount3yNeeded };
  return {
    ok: true,
    errors,
    amount3yNeeded,
    conditions: {
      existingTotal: existingTotal!,
      newDeposit: newDeposit!,
      limits: limits.map((l) => ({ name: l.name, limitPct: l.limitPct! })),
      rankRatios: ratios as number[],
      maturityMix: { "1y": mix1y!, "3y": mix3y! },
      ...(amount3y !== undefined ? { amount3y } : {}),
      tolerance: tolerance!,
      toleranceTargets,
    },
  };
}
