// Design Ref: §2.2 ⑤ 내려받기 — 결과 엑셀: 시트1 목표 배분안 · 시트2 이동 내역 · 시트3 근거 요약
// Plan SC: 작업 18 (결과 엑셀 다운로드)

import ExcelJS from "exceljs";
import { allocationRows, MOVE_LABEL, type CalcSuccess } from "@/lib/calc/view";
import type { MoveChoice } from "@/lib/storage/workState";
import { buildSummary } from "@/lib/summary/buildSummary";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
const PCT_FORMAT = "0.000%";
const EOK_FORMAT = '#,##0"억"';

/** 확정한 배분 결과·선택한 이동 방법·근거 요약을 엑셀 파일로 만든다. */
export async function buildResultWorkbook(r: CalcSuccess, choice: MoveChoice, createdAt = new Date()): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "적립금 배분 툴";
  wb.created = createdAt;
  const stamp = createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  // 시트1: 목표 배분안
  const s1 = wb.addWorksheet("목표 배분안");
  s1.columns = [
    { header: "순위", key: "rank", width: 8 },
    { header: "기관", key: "name", width: 16 },
    { header: "평가 점수", key: "score", width: 10 },
    { header: "배분비율", key: "ratio", width: 10 },
    { header: "목표 금액", key: "target", width: 12 },
    { header: "1년물", key: "y1", width: 12 },
    { header: "3년물", key: "y3", width: 12 },
    { header: "수수료 차감 수익률", key: "yield", width: 18 },
    { header: "한도(억)", key: "limit", width: 12 },
    { header: "비고", key: "note", width: 40 },
  ];
  styleHeader(s1);
  for (const x of allocationRows(r)) {
    const notes = [
      x.roundedUp ? `억 원 미만 처리로 1억 보정 (정확한 값 ${x.exact}억)` : "",
      x.overLimitByRounding ? "억 원 미만 처리로 한도 1억 미만 초과(허용)" : "",
    ].filter(Boolean);
    s1.addRow({
      rank: x.rank,
      name: x.name,
      score: x.score,
      ratio: x.ratioPct / 100,
      target: x.target,
      y1: x.amount1y,
      y3: x.amount3y,
      yield: x.yieldMilli / 100_000,
      limit: x.limitExact,
      note: notes.join(" / "),
    });
  }
  const totalRow = s1.addRow({ name: "합계", target: r.total, y1: r.amount1y, y3: r.amount3y, yield: r.plan.totalYieldMilli / 100_000 });
  totalRow.font = { bold: true };
  s1.getColumn("ratio").numFmt = "0.###%";
  s1.getColumn("yield").numFmt = PCT_FORMAT;
  for (const key of ["target", "y1", "y3"]) s1.getColumn(key).numFmt = EOK_FORMAT;
  s1.addRow([]);
  s1.addRow([`작성: ${stamp} · 적립금 배분 툴`]);

  // 시트2: 이동 내역 (선택한 방법 + 비교용 다른 방법)
  const s2 = wb.addWorksheet("이동 내역");
  s2.columns = [{ width: 20 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }];
  const other: MoveChoice = choice === "minCount" ? "minAmount" : "minCount";
  let row = 1;
  for (const m of [choice, other]) {
    const plan = r.plan.moves[m];
    const title = s2.getCell(`A${row}`);
    title.value = `${MOVE_LABEL[m]} 기준${m === choice ? " (선택)" : " (비교)"} — 송금 ${plan.count}회, 이동 금액 ${plan.amount}억`;
    title.font = { bold: true, size: 12 };
    row += 1;
    setRow(s2, row++, ["보내는 곳", "받는 곳", "금액(억)"], true);
    for (const t of plan.transfers) setRow(s2, row++, [t.from, t.to, t.amount]);
    row += 1;
    setRow(s2, row++, ["기관", "현재(억)", "목표(억)", "이동 후(억)", "목표 대비"], true);
    for (const t of r.targets) {
      const final = plan.finalAmounts[t.institution.name];
      setRow(s2, row++, [t.institution.name, t.institution.existing, t.target, final, final - t.target]);
    }
    row += 2;
  }
  if (r.notice) s2.getCell(`A${row}`).value = r.notice;

  // 시트3: 근거 요약
  const s3 = wb.addWorksheet("근거 요약");
  s3.getColumn(1).width = 110;
  let line = 1;
  for (const section of buildSummary(r, choice)) {
    const head = s3.getCell(`A${line++}`);
    head.value = section.title;
    head.font = { bold: true };
    for (const l of section.lines.filter(Boolean)) s3.getCell(`A${line++}`).value = `- ${l}`;
    line += 1;
  }
  s3.getCell(`A${line}`).value = "이 요약은 계산 결과로 툴이 직접 작성했습니다 (AI로 보내지 않음).";

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).eachCell((c) => (c.fill = HEADER_FILL));
}

function setRow(ws: ExcelJS.Worksheet, row: number, values: (string | number)[], header = false) {
  values.forEach((v, i) => {
    const cell = ws.getRow(row).getCell(i + 1);
    cell.value = v;
    if (header) {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
    }
  });
}
