// Design Ref: §2.1 [데이터 저장 / 불러오기] — 작업 데이터를 엑셀로 저장하고 그대로 되살리는지
// Plan SC: 작업 19

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/excel/work/route";
import { buildConditionsTemplate } from "@/lib/excel/conditionsTemplate";
import { buildWorkBackup, parseWorkBackup, type WorkBackup } from "@/lib/excel/workBackup";
import { emptyInstitution, recognized } from "@/lib/review/review";

const toAB = (u8: Uint8Array) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

function sample(): WorkBackup {
  const inst = emptyInstitution("A은행");
  inst.score = recognized("score", 95, true);
  inst.existing = recognized("eok", 300);
  return {
    conditions: {
      existingTotal: "300",
      newDeposit: "0",
      limits: [{ name: "A은행", limitPct: "100" }],
      rankRatios: ["100"],
      mix1y: "90",
      mix3y: "10",
      amount3y: "",
      tolerance: "0",
    },
    review: { files: [{ name: "A은행.pdf", method: "text" }], institutions: [inst] },
  };
}

describe("작업 데이터 저장 파일", () => {
  it("저장한 내용이 불러올 때 그대로 돌아온다 (불확실 표시·확인 여부 포함)", async () => {
    const backup = sample();
    const parsed = await parseWorkBackup(toAB(await buildWorkBackup(backup)));
    expect(parsed).toEqual({ ok: true, backup });
  });

  it("사람이 볼 수 있는 시트가 있다", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(toAB(await buildWorkBackup(sample())));
    expect(wb.worksheets.filter((w) => w.state === "visible").map((w) => w.name)).toEqual(["안내", "기초조건(보기용)", "기관자료(보기용)"]);
  });

  it("기관이 많아 글자가 길어도 나눠 담아 되살린다", async () => {
    const backup = sample();
    backup.review.institutions = Array.from({ length: 40 }, (_, i) => emptyInstitution(`기관${i}`));
    const parsed = await parseWorkBackup(toAB(await buildWorkBackup(backup)));
    expect(parsed.ok && parsed.backup.review.institutions).toHaveLength(40);
  });

  it("툴의 저장 파일이 아니면 거부한다 (기초 조건 양식도 거부)", async () => {
    const parsed = await parseWorkBackup(toAB(await buildConditionsTemplate()));
    expect(parsed).toEqual({ ok: false, message: "툴에서 [데이터 저장]으로 만든 파일이 아닙니다." });
  });
});

describe("데이터 저장·불러오기 요청 (Route Handler)", () => {
  it("저장 요청 → 엑셀, 그 엑셀로 불러오기 요청 → 같은 작업 데이터", async () => {
    const backup = sample();
    const saved = await POST(
      new Request("http://localhost/api/excel/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) }),
    );
    expect(saved.status).toBe(200);
    const form = new FormData();
    form.append("file", new File([await saved.arrayBuffer()], "저장.xlsx"));
    const loaded = await POST(new Request("http://localhost/api/excel/work", { method: "POST", body: form }));
    expect(await loaded.json()).toEqual({ ok: true, backup });
  });

  it("형식이 틀린 저장 요청은 거부한다", async () => {
    const res = await POST(
      new Request("http://localhost/api/excel/work", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
    );
    expect(res.status).toBe(400);
  });
});
