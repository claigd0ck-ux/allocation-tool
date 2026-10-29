// Design Ref: §2.1 상단 [데이터 저장 / 불러오기] — 확인 완료 데이터를 엑셀로 내려받고 다시 올린다
// Plan SC: 작업 19 (작업 데이터 보존). 사람이 보는 시트 + 원래 값을 그대로 되살리는 숨김 시트.

import ExcelJS from "exceljs";
import type { ReviewState } from "@/lib/domain/review";
import { emptyWorkState, type ConditionsDraft } from "@/lib/storage/workState";
import { excelReadProblem } from "./fileKind";
import { workBackupSchema } from "@/lib/validate/requestSchemas";
import { loadXlsx, UnsafeWorkbookError } from "./load";

export const BACKUP_MARK = "allocation-tool-work";
export const BACKUP_VERSION = 1;
const DATA_SHEET = "_저장데이터";
/** 엑셀 칸 하나에 넣을 수 있는 글자 수(32,767)보다 작게 나눠 담는다 */
const CHUNK = 30_000;

export interface WorkBackup {
  conditions: ConditionsDraft;
  review: ReviewState;
}

export type BackupParse = { ok: true; backup: WorkBackup } | { ok: false; message: string };

const FEE_METHOD_LABEL = { whole: "구간 전체", progressive: "누진" } as const;

/** 작업 데이터를 엑셀로 만든다. 다시 올리면 숨김 시트의 값으로 그대로 되살린다. */
export async function buildWorkBackup(backup: WorkBackup, createdAt = new Date()): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "적립금 배분 툴";
  wb.created = createdAt;

  const guide = wb.addWorksheet("안내");
  guide.getColumn(1).width = 100;
  guide.getCell("A1").value = "적립금 배분 툴 — 작업 데이터 저장 파일";
  guide.getCell("A1").font = { bold: true, size: 14 };
  guide.getCell("A2").value = `저장 시각: ${createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
  guide.getCell("A3").value = "툴 상단의 [불러오기]로 이 파일을 올리면 저장할 때의 기초 조건과 확인·수정한 기관 자료가 그대로 돌아옵니다.";
  guide.getCell("A4").value = "※ 보기용 시트의 값을 고쳐도 불러올 때는 반영되지 않습니다. 고칠 값은 툴 화면에서 고쳐 주세요.";
  guide.getCell("A5").value = "※ 대외비 자료입니다. 공용 PC에 남기지 마세요.";

  const c = backup.conditions;
  const s1 = wb.addWorksheet("기초조건(보기용)");
  s1.columns = [{ width: 26 }, { width: 16 }];
  [
    ["기존 예치금액(억)", c.existingTotal],
    ["신규 예치금액(억)", c.newDeposit],
    ["만기 비율 1년물(%)", c.mix1y],
    ["만기 비율 3년물(%)", c.mix3y],
    ["3년물 금액(억)", c.amount3y],
    ["허용 오차(억)", c.tolerance],
  ].forEach((r) => s1.addRow(r));
  s1.addRow([]);
  s1.addRow(["기관명", "한도(%)", "순위", "배분비율(%)"]).font = { bold: true };
  const n = Math.max(c.limits.length, c.rankRatios.length);
  for (let i = 0; i < n; i++) s1.addRow([c.limits[i]?.name ?? "", c.limits[i]?.limitPct ?? "", `${i + 1}위`, c.rankRatios[i] ?? ""]);

  const s2 = wb.addWorksheet("기관자료(보기용)");
  s2.columns = [
    { header: "PDF 파일", width: 22 },
    { header: "기관명", width: 16 },
    { header: "명단 연결", width: 14 },
    { header: "평가 점수", width: 10 },
    { header: "현재 잔액(억)", width: 12 },
    { header: "수수료 방식", width: 12 },
    { header: "상품명", width: 18 },
    { header: "만기", width: 8 },
    { header: "금리(%)", width: 10 },
    { header: "구간 시작(억)", width: 12 },
    { header: "수수료율(%)", width: 12 },
  ];
  s2.getRow(1).font = { bold: true };
  const v = (f: { value: unknown }) => (f.value === null ? "누락" : (f.value as string | number));
  for (const inst of backup.review.institutions) {
    for (const p of inst.products) {
      for (const t of p.tiers) {
        s2.addRow([
          inst.sourceFile,
          v(inst.name),
          inst.matchedName ?? "",
          v(inst.score),
          v(inst.existing),
          inst.feeMethod.value ? FEE_METHOD_LABEL[inst.feeMethod.value] : "누락",
          v(p.name),
          p.maturity.value === "3y" ? "3년물" : "1년물",
          v(p.rate),
          v(t.from),
          v(t.fee),
        ]);
      }
    }
  }

  const data = wb.addWorksheet(DATA_SHEET, { state: "veryHidden" });
  data.getCell("A1").value = BACKUP_MARK;
  data.getCell("B1").value = BACKUP_VERSION;
  const json = JSON.stringify(backup);
  for (let i = 0; i * CHUNK < json.length; i++) data.getCell(`A${i + 2}`).value = json.slice(i * CHUNK, (i + 1) * CHUNK);

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 저장 파일을 읽어 작업 데이터를 되살린다. 툴의 저장 파일이 아니면 거부한다. */
export async function parseWorkBackup(data: ArrayBuffer): Promise<BackupParse> {
  let wb: ExcelJS.Workbook;
  try {
    wb = await loadXlsx(data);
  } catch (e) {
    return { ok: false, message: e instanceof UnsafeWorkbookError ? e.message : excelReadProblem(data) };
  }
  const sheet = wb.getWorksheet(DATA_SHEET);
  if (!sheet || sheet.getCell("A1").value !== BACKUP_MARK) {
    return { ok: false, message: "툴에서 [데이터 저장]으로 만든 파일이 아닙니다." };
  }
  if (Number(sheet.getCell("B1").value) !== BACKUP_VERSION) return { ok: false, message: "저장 파일의 버전이 다릅니다." };

  let json = "";
  for (let r = 2; ; r++) {
    const v = sheet.getCell(`A${r}`).value;
    if (typeof v !== "string") break;
    json += v;
  }
  try {
    const raw = JSON.parse(json) as Partial<WorkBackup>;
    const base = emptyWorkState();
    // 값 자리에 객체(엑셀 수식·링크 등)가 들어오지 못하게 형식을 끝까지 검사한다
    const checked = workBackupSchema.safeParse({
      conditions: { ...base.conditions, ...raw.conditions },
      review: { files: raw.review?.files ?? [], institutions: raw.review?.institutions },
    });
    if (!checked.success) throw new Error("형식");
    return { ok: true, backup: checked.data };
  } catch {
    return { ok: false, message: "저장 파일의 내용이 손상되었습니다." };
  }
}
