// 업로드 연습용 제안서 PDF 11개 (은행1~은행11) 만들기. 실행: node scripts/make-sample-pdfs.mjs <저장할 폴더>
// 모두 가짜 숫자다. 은행1~9의 현재 잔액 합은 1,000억, 은행10·11까지 넣으면 1,150억.
// 은행10은 기관명을 "(주)은행10"으로 적어 짝 맞추기를, 은행11은 스캔본으로 만들어 AI 인식을 연습한다.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { proposalLines, scannedPdf, textPdf } from "./proposal-pdf.mjs";

const outDir = process.argv[2];
if (!outDir) {
  console.error("저장할 폴더를 적어 주세요: node scripts/make-sample-pdfs.mjs <폴더>");
  process.exit(1);
}

// [평가 점수, 현재 잔액, 수수료 방식, 1년물 금리, 1년물 수수료 구간, 3년물 금리, 3년물 수수료 구간]
const rows = [
  [96, 150, "whole", 3.42, [[0, 0.15], [100, 0.1]], 3.85, [[0, 0.2]]],
  [93, 130, "progressive", 3.48, [[0, 0.14], [80, 0.09]], 3.9, [[0, 0.24], [30, 0.16]]],
  [91, 120, "whole", 3.38, [[0, 0.08]], 3.8, [[0, 0.15]]],
  [90, 110, "progressive", 3.51, [[0, 0.18], [60, 0.11]], 3.78, [[0, 0.1]]],
  [88, 110, "whole", 3.45, [[0, 0.12], [90, 0.07]], 3.92, [[0, 0.22], [20, 0.18]]],
  [84, 100, "progressive", 3.4, [[0, 0.1]], 3.83, [[0, 0.14]]],
  [84, 100, "whole", 3.36, [[0, 0.06]], 3.75, [[0, 0.08]]],
  [80, 90, "progressive", 3.55, [[0, 0.2], [50, 0.13]], 3.81, [[0, 0.12]]],
  [78, 90, "whole", 3.47, [[0, 0.11]], 3.88, [[0, 0.19]]],
  [76, 80, "progressive", 3.5, [[0, 0.16], [40, 0.1]], 3.86, [[0, 0.17]]],
  [74, 70, "whole", 3.44, [[0, 0.09]], 3.79, [[0, 0.11]]],
];

const tiers = (list) => list.map(([from, fee]) => ({ from, fee }));
const institutions = rows.map(([score, existing, feeMethod, r1, t1, r3, t3], i) => {
  const name = `은행${i + 1}`;
  return {
    name,
    score,
    existing,
    feeMethod,
    products: [
      { name: `${name} 정기예금 1년`, maturity: "1y", rate: r1, tiers: tiers(t1) },
      { name: `${name} 정기예금 3년`, maturity: "3y", rate: r3, tiers: tiers(t3) },
    ],
  };
});

mkdirSync(outDir, { recursive: true });
for (const inst of institutions) {
  let file = `${inst.name}.pdf`;
  let bytes;
  if (inst.name === "은행10") {
    file = "은행10_이름다름.pdf";
    bytes = await textPdf(proposalLines(inst, { displayName: "(주)은행10" }));
  } else if (inst.name === "은행11") {
    file = "은행11_스캔본.pdf";
    bytes = await scannedPdf(proposalLines(inst));
  } else {
    bytes = await textPdf(proposalLines(inst));
  }
  writeFileSync(join(outDir, file), bytes);
  console.log(`만듦: ${file}`);
}
