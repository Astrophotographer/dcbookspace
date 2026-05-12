/**
 * Excel/Numbers 표 복사·붙여넣기를 파싱하기 위한 가벼운 CSV 파서.
 *
 * 지원:
 * - 콤마 또는 탭 구분 (헤더 줄에서 자동 감지)
 * - 빈 줄·"#" 으로 시작하는 주석 줄 무시 (예시 가이드 안에 #섹션 헤더 사용 가능)
 * - 큰따옴표로 감싼 셀 ("a,b" → a,b / "그가 ""안녕"" 했다" → 그가 "안녕" 했다)
 * - 셀 양끝 공백 trim
 */

export type BulkRowError = { row: number; message: string };

export type ParsedCsv = {
  headers: string[];
  // 0-based 행 번호 (헤더 다음 첫 데이터 줄 = 0). UI 에는 +2 해서 표시 (헤더가 1줄)
  rows: { row: number; cells: string[] }[];
  // 원본 줄 번호 (1-based, 주석·빈 줄 포함) — 에러 메시지 친화용
  sourceLine: number[];
};

/**
 * CSV/TSV 텍스트를 헤더 + 데이터 행으로 분리.
 * 헤더가 비어있으면 throw — 호출 측에서 try/catch 권장.
 */
export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  let headerLineIdx = -1;
  let delimiter: "," | "\t" = ",";

  // 첫 번째 의미 있는 줄을 헤더로 채택
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith("#")) continue;
    headerLineIdx = i;
    // 탭이 더 많으면 TSV 로 간주 (Excel 복사 기본 동작)
    const tabs = (lines[i].match(/\t/g) ?? []).length;
    const commas = (lines[i].match(/,/g) ?? []).length;
    delimiter = tabs > commas ? "\t" : ",";
    break;
  }

  if (headerLineIdx === -1) {
    throw new Error("CSV 내용이 비어있습니다.");
  }

  const headers = parseLine(lines[headerLineIdx], delimiter).map((s) =>
    s.trim(),
  );
  if (headers.length === 0 || headers.every((h) => !h)) {
    throw new Error("첫 줄(헤더)이 비어있습니다.");
  }

  const rows: { row: number; cells: string[] }[] = [];
  const sourceLine: number[] = [];
  let dataIdx = 0;
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;
    const cells = parseLine(raw, delimiter).map((s) => s.trim());
    rows.push({ row: dataIdx, cells });
    sourceLine.push(i + 1); // 1-based
    dataIdx++;
  }

  return { headers, rows, sourceLine };
}

/** 한 줄을 셀 배열로. 큰따옴표 escape 지원. */
function parseLine(line: string, delimiter: "," | "\t"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === delimiter) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * 헤더 이름으로 셀 값 접근하기 위한 헬퍼.
 * 동의어 (e.g. "휴대폰" / "전화번호") 지원.
 */
export function makeRowAccessor(headers: string[]) {
  const idx = new Map<string, number>();
  headers.forEach((h, i) => idx.set(h, i));
  return (cells: string[], ...keys: string[]): string => {
    for (const k of keys) {
      const i = idx.get(k);
      if (i !== undefined) return cells[i] ?? "";
    }
    return "";
  };
}

/** 필수 헤더 누락 검사. 동의어 그룹 안에서 하나라도 있으면 OK. */
export function checkRequiredHeaders(
  headers: string[],
  required: { keys: string[]; label: string }[],
): string | null {
  const present = new Set(headers);
  const missing: string[] = [];
  for (const r of required) {
    if (!r.keys.some((k) => present.has(k))) {
      missing.push(r.label);
    }
  }
  if (missing.length === 0) return null;
  return `필수 컬럼이 누락되었습니다: ${missing.join(", ")}`;
}
