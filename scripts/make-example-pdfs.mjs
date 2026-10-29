// 예시 제안서 PDF 만들기 (examples/pdf/FORMAT.md 양식). 실행: node scripts/make-example-pdfs.mjs
// 숫자는 examples/cases.json 예시 1과 같은 가짜 자료다.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { proposalLines, scannedPdf, textPdf } from "./proposal-pdf.mjs";

const OUT = new URL("../examples/pdf/", import.meta.url);
const { cases } = JSON.parse(readFileSync(new URL("../examples/cases.json", import.meta.url), "utf8"));

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
