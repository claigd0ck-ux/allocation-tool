// 정답 계산 스크립트 (툴의 계산 코드와 별도로, 모든 경우를 따져서 정답을 구한다)
// 실행: node examples/oracle.mjs
// 단위: 금액은 억 원(정수), 금리·수수료율은 0.001% 단위 정수로 바꿔 오차 없이 계산한다.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 테스트에서 불러다 쓸 수 있도록 solve 등을 내보낸다 (파일 맨 아래 export 참고).
const { cases } = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));

const milli = (pct) => Math.round(pct * 1000);

// 수수료(억 원 × 0.001%) — whole: 해당 구간 수수료율을 전체 금액에, progressive: 구간별로 나눠 적용
function feeUnits(amount, tiers, method) {
  if (amount === 0) return 0;
  const ts = [...tiers].sort((a, b) => a.from - b.from);
  if (method === "whole") {
    let rate = ts[0].fee;
    for (const t of ts) if (amount >= t.from) rate = t.fee;
    return amount * milli(rate);
  }
  let total = 0;
  for (let i = 0; i < ts.length; i++) {
    const lo = ts[i].from;
    const hi = i + 1 < ts.length ? ts[i + 1].from : Infinity;
    if (amount > lo) total += (Math.min(amount, hi) - lo) * milli(ts[i].fee);
  }
  return total;
}

// 0.001% 단위 수익률 (넷째 자리에서 반올림한 셋째 자리)
const yieldMilli = (netUnits, amount) => Math.floor((2 * netUnits + amount) / (2 * amount));
const pct = (m) => (m / 1000).toFixed(3) + "%";

function solve(c) {
  const insts = c.institutions;
  const existingSum = insts.reduce((s, i) => s + i.existing, 0);
  const T = existingSum + c.newDeposit;

  // 1) 순위 (점수 내림차순, 동점은 같은 순위)
  const sorted = [...insts].sort((a, b) => b.score - a.score);
  const groups = [];
  for (const inst of sorted) {
    const g = groups.at(-1);
    if (g && g.score === inst.score) g.members.push(inst);
    else groups.push({ score: inst.score, members: [inst] });
  }

  // 기관이 9곳 이상이면 평가 하위 2곳은 제외 (목표 0억, 이동 때 허용 오차 없이 0억). 경계에 동점이 걸치면 정할 수 없다.
  const kept = insts.length >= 9 ? insts.length - 2 : insts.length;
  {
    let pos = 0;
    for (const g of groups) {
      if (pos < kept && pos + g.members.length > kept) throw new Error(`${c.id}: 제외 경계에 동점`);
      pos += g.members.length;
    }
  }

  // 2) 기관별 목표 금액 (정확값은 분수 num/den 억 원)
  let rankPos = 0;
  const alloc = [];
  for (const g of groups) {
    const k = g.members.length;
    if (rankPos >= kept) {
      for (const inst of g.members) alloc.push({ inst, rank: rankPos + 1, ratio: 0, num: 0, den: 1, floor: 0, remNum: 0, excluded: true });
      rankPos += k;
      continue;
    }
    const ratioSum = c.rankRatios.slice(rankPos, rankPos + k).reduce((s, r) => s + r, 0);
    for (const inst of g.members) {
      const num = T * ratioSum;
      const den = 100 * k;
      alloc.push({
        inst, rank: rankPos + 1, ratio: ratioSum / k, num, den,
        floor: Math.floor(num / den), remNum: num % den,
      });
    }
    rankPos += k;
  }
  // 억 원 미만 버림 → 남은 금액은 소수점이 큰 기관부터 1억씩 (소수점이 같으면 순위가 높은 기관 먼저)
  let remainder = T - alloc.reduce((s, a) => s + a.floor, 0);
  const byFraction = [...alloc].sort((a, b) => b.remNum * a.den - a.remNum * b.den || a.rank - b.rank);
  for (const a of alloc) a.target = a.floor;
  const fractionTies = [];
  for (let i = 0; i < remainder; i++) {
    byFraction[i].target += 1;
    const next = byFraction[remainder];
    if (i === remainder - 1 && next && next.remNum * byFraction[i].den === byFraction[i].remNum * next.den && next.remNum > 0)
      fractionTies.push([byFraction[i].inst.name, next.inst.name]);
  }

  // 3) 한도 확인 (한도 = 전체 적립금 × 한도%, 억 원 미만 처리 전·후 모두 확인)
  for (const a of alloc) {
    const limitNum = T * a.inst.limitPct; // /100
    a.limitExact = limitNum / 100;
    a.overLimitBeforeRounding = a.num * 100 > limitNum * a.den;
    a.overLimitAfterRounding = a.target * 100 > limitNum;
  }

  // 4) 상품별 배분 — 3년물 합계 = 전체 × 3년물 비율, 전체 순수익(금리 − 수수료) 최대
  const T3num = T * c.maturityMix["3y"];
  if (T3num % 100 !== 0) throw new Error(`${c.id}: 3년물 금액이 억 원 정수가 아님`);
  const T3 = T3num / 100;

  // 기관마다: 3년물 금액 s → (최대 순수익, 그 값을 내는 방법 수, 상품별 금액)
  function instOptions(a) {
    const prods = a.inst.products;
    const best = new Map();
    const amounts = new Array(prods.length).fill(0);
    (function rec(i, left) {
      if (i === prods.length - 1) {
        amounts[i] = left;
        let net = 0, s3 = 0;
        prods.forEach((p, j) => {
          net += amounts[j] * milli(p.rate) - feeUnits(amounts[j], p.tiers, a.inst.feeMethod);
          if (p.maturity === "3y") s3 += amounts[j];
        });
        const cur = best.get(s3);
        if (!cur || net > cur.net) best.set(s3, { net, ways: 1, amounts: [...amounts] });
        else if (net === cur.net) cur.ways += 1;
        return;
      }
      for (let x = 0; x <= left; x++) { amounts[i] = x; rec(i + 1, left - x); }
    })(0, a.target);
    return best;
  }

  let dp = new Map([[0, { net: 0, ways: 1, picks: [] }]]);
  for (const a of alloc) {
    const opts = instOptions(a);
    const next = new Map();
    for (const [s, st] of dp) {
      for (const [s3, o] of opts) {
        const ns = s + s3;
        if (ns > T3) continue;
        const net = st.net + o.net;
        const ways = st.ways * o.ways;
        const cur = next.get(ns);
        if (!cur || net > cur.net) next.set(ns, { net, ways, picks: [...st.picks, o.amounts] });
        else if (net === cur.net) cur.ways += ways;
      }
    }
    dp = next;
  }
  const opt = dp.get(T3);
  alloc.forEach((a, i) => {
    a.products = a.inst.products.map((p, j) => {
      const amt = opt.picks[i][j];
      const net = amt * milli(p.rate) - feeUnits(amt, p.tiers, a.inst.feeMethod);
      return { name: p.name, maturity: p.maturity, amount: amt, feeUnits: feeUnits(amt, p.tiers, a.inst.feeMethod), net, yield: amt ? yieldMilli(net, amt) : null };
    });
    a.net = a.products.reduce((s, p) => s + p.net, 0);
  });

  // 5) 자금 이동 — 기관별 최종 금액 F는 목표 ± 허용 오차, 합계 = 전체 적립금
  // 허용 오차는 toleranceTargets의 기관에만 (없으면 모든 기관 — 예시 자료). 제외 기관은 0억 고정.
  const tolOf = (a) => (a.excluded ? 0 : !c.toleranceTargets || c.toleranceTargets.includes(a.inst.name) ? c.tolerance : 0);
  const nodes = alloc.map((a) => ({ name: a.inst.name, existing: a.inst.existing, target: a.target, tol: tolOf(a) }));
  const plans = [];
  const F = new Array(nodes.length);
  // 순위 순서 규칙: 평가가 더 낮은(순위가 더 뒤인) 기관이 더 높은 기관보다 많이 받으면 안 된다. 같은 순위끼리는 비교하지 않는다.
  const respectsRankOrder = (Fv) =>
    alloc.every((a, i) => alloc.every((b, j) => !(a.rank < b.rank) || Fv[i] >= Fv[j]));
  (function rec(i, left) {
    if (i === nodes.length - 1) {
      const t = nodes[i].target;
      if (left < Math.max(0, t - nodes[i].tol) || left > t + nodes[i].tol) return;
      F[i] = left;
      if (!respectsRankOrder(F)) return;
      plans.push(evaluate([...F]));
      return;
    }
    const t = nodes[i].target;
    for (let f = Math.max(0, t - nodes[i].tol); f <= t + nodes[i].tol; f++) { F[i] = f; rec(i + 1, left - f); }
  })(0, T);

  function evaluate(Fv) {
    // out > 0: 보내는 쪽, out < 0: 받는 쪽. "신규"는 신규 예치금 전액을 보내는 쪽.
    const parts = [{ name: "신규", out: c.newDeposit }, ...nodes.map((n, i) => ({ name: n.name, out: n.existing - Fv[i] }))]
      .filter((p) => p.out !== 0);
    const amount = parts.filter((p) => p.out < 0).reduce((s, p) => s - p.out, 0);
    const n = parts.length;
    const sum = new Array(1 << n).fill(0);
    const f = new Array(1 << n).fill(0);
    for (let m = 1; m < 1 << n; m++) {
      const low = 31 - Math.clz32(m & -m);
      sum[m] = sum[m & (m - 1)] + parts[low].out;
      let b = 0;
      for (let i = 0; i < n; i++) if (m & (1 << i)) b = Math.max(b, f[m ^ (1 << i)]);
      f[m] = b + (sum[m] === 0 ? 1 : 0);
    }
    const full = (1 << n) - 1;
    const count = n - f[full];
    // 송금 내역 복원: 합이 0인 묶음끼리 나눠 안에서 주고받기
    const order = [];
    let m = full;
    while (m) {
      for (let i = 0; i < n; i++) {
        if (!(m & (1 << i))) continue;
        if (f[m] === f[m ^ (1 << i)] + (sum[m] === 0 ? 1 : 0)) { order.unshift(i); m ^= 1 << i; break; }
      }
    }
    const transfers = [];
    let grp = [], acc = 0;
    for (const i of order) {
      grp.push({ ...parts[i] });
      acc += parts[i].out;
      if (acc === 0) {
        const give = grp.filter((p) => p.out > 0), take = grp.filter((p) => p.out < 0);
        let gi = 0, ti = 0;
        while (gi < give.length && ti < take.length) {
          const x = Math.min(give[gi].out, -take[ti].out);
          transfers.push({ from: give[gi].name, to: take[ti].name, amount: x });
          give[gi].out -= x; take[ti].out += x;
          if (give[gi].out === 0) gi++;
          if (take[ti].out === 0) ti++;
        }
        grp = [];
      }
    }
    if (transfers.length !== count) throw new Error("송금 내역 복원 오류");
    const deviation = Fv.reduce((s, v, i) => s + Math.abs(v - nodes[i].target), 0);
    return { F: Fv, count, amount, deviation, transfers };
  }

  const lex = (a, b) => { for (let i = 0; i < a.F.length; i++) if (a.F[i] !== b.F[i]) return a.F[i] - b.F[i]; return 0; };
  const byCount = [...plans].sort((a, b) => a.count - b.count || a.amount - b.amount || a.deviation - b.deviation || lex(a, b));
  const byAmount = [...plans].sort((a, b) => a.amount - b.amount || a.count - b.count || a.deviation - b.deviation || lex(a, b));
  const tiesOf = (arr, keys) => arr.filter((p) => keys.every((k) => p[k] === arr[0][k])).length;

  return {
    id: c.id, title: c.title, T, T3, T1: T - T3,
    alloc, fractionTies, totalNet: opt.net, totalYield: yieldMilli(opt.net, T), productOptimumWays: opt.ways,
    minCount: { ...byCount[0], ties: tiesOf(byCount, ["count", "amount"]) },
    minAmount: { ...byAmount[0], ties: tiesOf(byAmount, ["amount", "count"]) },
    nodes,
  };
}

// 직접 실행(node examples/oracle.mjs)했을 때만 결과를 출력한다. 테스트에서 불러올 때는 출력하지 않는다.
const runAsScript = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

for (const r of runAsScript ? cases.map(solve) : []) {
  console.log(`\n===== ${r.id} ${r.title} =====`);
  console.log(`전체 적립금 ${r.T}억 (1년물 ${r.T1}억 / 3년물 ${r.T3}억)`);
  for (const a of r.alloc) {
    const exact = (a.num / a.den).toFixed(4);
    console.log(`${a.rank}위 ${a.inst.name} 점수${a.inst.score} 비율${a.ratio}% 정확값 ${exact}억 → 목표 ${a.target}억 | 한도 ${a.limitExact}억${a.overLimitAfterRounding && !a.overLimitBeforeRounding ? " (억 원 미만 처리로 1억 미만 초과, 허용)" : ""}${a.overLimitBeforeRounding ? " ⚠️한도 초과" : ""}`);
    for (const p of a.products) console.log(`    ${p.name}: ${p.amount}억, 수수료 ${(p.feeUnits / 100000).toFixed(5)}억, 순수익률 ${p.yield === null ? "-" : pct(p.yield)}`);
    console.log(`    기관 순수익률 ${pct(yieldMilli(a.net, a.target))}`);
  }
  if (r.fractionTies.length) console.log("⚠️ 소수점 동률:", r.fractionTies);
  console.log(`전체 수수료 차감 수익률 ${pct(r.totalYield)} (순수익 ${(r.totalNet / 100000).toFixed(5)}억), 상품 배분 최적해 개수 ${r.productOptimumWays}`);
  for (const [label, p] of [["최소 이동 횟수", r.minCount], ["최소 이동 금액", r.minAmount]]) {
    console.log(`[${label}] ${p.count}회 ${p.amount}억 | 최종 ${r.nodes.map((n, i) => `${n.name} ${p.F[i]}`).join(", ")} | 같은 (횟수,금액) 최적안 ${p.ties}개`);
    for (const t of p.transfers) console.log(`    ${t.from} → ${t.to} ${t.amount}억`);
  }
}

export { solve, yieldMilli, milli, feeUnits };
