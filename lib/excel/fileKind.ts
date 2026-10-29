// Design Ref: §5 — 올린 파일을 읽지 못할 때 이유를 알려준다 (파일 앞부분의 형식 표시로 구분)
// Plan SC: 작업 12·19 보완

/** .xlsx는 ZIP 형식(PK…)이다. 암호·보안(DRM)이 걸린 엑셀과 예전 .xls는 OLE 형식(D0 CF 11 E0)이다. */
export function excelReadProblem(data: ArrayBuffer | Uint8Array): string {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
    return "암호가 걸렸거나 회사 보안(DRM)이 적용된 엑셀, 또는 예전 .xls 형식이라 읽을 수 없습니다. 암호·보안을 해제하거나 Excel에서 [다른 이름으로 저장 → Excel 통합 문서(*.xlsx)]로 저장한 뒤 올려 주세요.";
  }
  if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) {
    return "엑셀(.xlsx) 파일이 손상되었거나 읽을 수 없는 내용이 있습니다. 툴에서 양식을 다시 내려받아 채워 주세요.";
  }
  return "엑셀(.xlsx) 파일이 아닙니다. 이름만 .xlsx로 바꾼 파일(CSV 등)은 읽을 수 없습니다. Excel에서 [Excel 통합 문서(*.xlsx)]로 저장해 주세요.";
}
