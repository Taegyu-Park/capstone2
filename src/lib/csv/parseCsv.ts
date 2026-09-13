/**
 * CSV 파일 파싱 파이프라인: 인코딩 감지 → 디코딩 → PapaParse.
 * 브라우저에서만 실행된다 (원칙 1: 원본 데이터는 서버로 가지 않는다).
 */
import Papa from "papaparse";
import { detectAndDecode, decodeWithEncoding, type DetectedEncoding } from "./encoding";

/** 브라우저 메모리 상한. 초과분은 잘라내고 사용자에게 경고한다 (PLAN.md §8) */
export const MAX_ROWS = 200_000;

export interface ParsedTable {
  fields: string[];
  rows: Record<string, string>[];
  encoding: DetectedEncoding;
  encodingDegraded: boolean;
  /** 원본 행 수 (자르기 전) */
  originalRowCount: number;
  truncated: boolean;
  fileName: string;
}

export interface CsvParseWarning {
  type: "encoding_degraded" | "truncated" | "parse_errors";
  detail: string;
}

export interface CsvParseResult {
  table: ParsedTable;
  warnings: CsvParseWarning[];
}

function parseDelimitedText(text: string): Papa.ParseResult<Record<string, string>> {
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });
}

export async function parseCsvFile(
  file: File,
  overrideEncoding?: DetectedEncoding,
): Promise<CsvParseResult> {
  const buffer = await file.arrayBuffer();

  const decoded = overrideEncoding
    ? { text: decodeWithEncoding(buffer, overrideEncoding), encoding: overrideEncoding, degraded: false }
    : detectAndDecode(buffer);

  const parsed = parseDelimitedText(decoded.text);
  const warnings: CsvParseWarning[] = [];

  if (decoded.degraded) {
    warnings.push({
      type: "encoding_degraded",
      detail:
        "자동 인코딩 감지에 실패해 일부 문자가 깨졌을 수 있습니다. 인코딩을 수동으로 선택해 다시 불러오세요.",
    });
  }

  // fatal이 아닌 Papa 에러(빈 행, 필드 수 불일치 등)는 경고로만 노출
  const fatalErrors = parsed.errors.filter((e) => e.type !== "FieldMismatch");
  if (fatalErrors.length > 0) {
    warnings.push({
      type: "parse_errors",
      detail: `CSV 파싱 중 ${fatalErrors.length}건의 오류가 발생했습니다 (예: ${fatalErrors[0].message}).`,
    });
  }

  const fields = parsed.meta.fields ?? [];
  let rows = parsed.data.filter((r) => r && typeof r === "object");
  const originalRowCount = rows.length;
  let truncated = false;

  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS);
    truncated = true;
    warnings.push({
      type: "truncated",
      detail: `행 수(${originalRowCount.toLocaleString()})가 상한(${MAX_ROWS.toLocaleString()})을 초과해 앞부분 ${MAX_ROWS.toLocaleString()}행만 사용합니다.`,
    });
  }

  return {
    table: {
      fields,
      rows,
      encoding: decoded.encoding,
      encodingDegraded: decoded.degraded,
      originalRowCount,
      truncated,
      fileName: file.name,
    },
    warnings,
  };
}
