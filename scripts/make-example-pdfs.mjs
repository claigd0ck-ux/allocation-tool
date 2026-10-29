// 예시 제안서 PDF 만들기 (examples/pdf/FORMAT.md 양식). 실행: node scripts/make-example-pdfs.mjs
// 숫자는 examples/cases.json 예시 1과 같은 가짜 자료다. 한글 글꼴은 Windows의 맑은 고딕(바꾸려면 KOREAN_FONT=글꼴 경로)을 쓴다.

import fontkit from "@pdf-lib/fontkit";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, rgb } from "pdf-lib";

const FONT_PATH = process.env.KOREAN_FONT ?? "C:/Windows/Fonts/malgun.ttf";
const OUT = new URL("../examples/pdf/", import.meta.url);
const { cases } = JSON.parse(readFileSync(new URL("../examples/cases.json", import.meta.url), "utf8"));
const fontBytes = readFileSync(FONT_PATH);

const pct = (v) => `${v.toFixed(3)}%`;
const tiersText = (tiers) => tiers.map((t) => `${t.from}억 원 이상 ${pct(t.fee)}`).join(", ");

/** 표준 양식의 줄 목록 */
function proposalLines(inst, { displayName = inst.name, omitFeeMethod = false } = {}) {
  const lines = [
    "예치기관 적립금 상품 제안서",
    "",
    `기관명: ${displayName}`,
    `평가 점수: ${inst.score}`,
    `현재 예치 잔액: ${inst.existing.toLocaleString("ko-KR")}억 원`,
  ];
  if (!omitFeeMethod) lines.push(`수수료 적용 방식: ${inst.feeMethod === "whole" ? "구간 전체" : "누진"}`);
  for (const p of inst.products) {
    lines.push("", `[${p.maturity === "1y" ? "1년물" : "3년물"}]`, `상품명: ${p.name}`, `금리: ${pct(p.rate)}`, `수수료: ${tiersText(p.tiers)}`);
  }
  lines.push("", "담당자: 김담당 (02-000-0000)");
  return lines;
}

/** 글자 PDF (글자를 선택·복사할 수 있다) */
async function textPdf(lines) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const page = doc.addPage([595, 842]);
  lines.forEach((line, i) => {
    if (line) page.drawText(line, { x: 60, y: 780 - i * 24, size: i === 0 ? 16 : 12, font, color: rgb(0, 0, 0) });
  });
  return doc.save();
}

/** 스캔본 흉내: 종이를 스캔한 것처럼 글자를 그림(PNG)으로만 넣어, 글자를 추출할 수 없다 */
async function scannedPdf(lines) {
  const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
  GlobalFonts.registerFromPath(FONT_PATH, "ScanFont");
  // A4를 150dpi로 (595×842pt → 1240×1754px)
  const k = 1240 / 595;
  const canvas = createCanvas(1240, 1754);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1a1a";
  lines.forEach((line, i) => {
    if (!line) return;
    ctx.font = `${(i === 0 ? 16 : 12) * k}px ScanFont`;
    ctx.fillText(line, 60 * k, (842 - (780 - i * 24)) * k);
  });
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const png = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(png, { x: 0, y: 0, width: 595, height: 842 });
  return doc.save();
}

mkdirSync(OUT, { recursive: true });
const insts = cases[0].institutions;
const byName = Object.fromEntries(insts.map((i) => [i.name, i]));
const files = [
  ...insts.map((i) => [`${i.name}.pdf`, textPdf(proposalLines(i))]),
  ["KB-A은행_이름다름.pdf", textPdf(proposalLines(byName["A은행"], { displayName: "KB A은행" }))],
  ["C은행_누락.pdf", textPdf(proposalLines(byName["C은행"], { omitFeeMethod: true }))],
  ["D은행_스캔본.pdf", scannedPdf(proposalLines(byName["D은행"]))],
];
for (const [name, bytes] of files) {
  writeFileSync(new URL(name, OUT), await bytes);
  console.log(`만듦: examples/pdf/${name}`);
}
