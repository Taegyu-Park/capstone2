/**
 * DataProfile 생성 오케스트레이터. ParsedTable(파싱된 원본 행) → DataProfile(LLM에 보낼 요약).
 * 원칙 1(원본은 서버로 안 감)의 경계가 바로 여기다 — 이 함수의 반환값만 네트워크를 탄다.
 */
import type { ParsedTable } from "@/lib/csv/parseCsv";
import type { ColumnProfile, ColumnType, DataProfile, QualityFlag } from "@/types/profile";
import { computeCorrelations, type NumericColumnValues } from "./correlations";
import { inferColumnType } from "./inferType";
import { isMissing, parseNumberLoose } from "./parsers";
import { detectPiiColumn, maskPiiValue } from "./pii";
import { detectColumnFlags, detectDuplicateRows } from "./quality";
import { computeCategoricalSummary, computeDatetimeSummary, computeNumericSummary, computeTextSummary } from "./stats";

/** 상관계수 계산 시 성능을 위해 표본으로 제한하는 최대 행 수 */
const CORRELATION_SAMPLE_CAP = 5000;
const SAMPLE_ROW_COUNT = 5;

export interface BuildProfileOptions {
  /** 사용자가 프로파일 화면에서 교정한 타입 (컬럼명 → 타입) */
  typeOverrides?: Record<string, ColumnType>;
  /** 전역 토글: false면 sampleRows를 아예 비운다 (PLAN.md §9.2) */
  includeSampleRows: boolean;
}

function pickSampleRowIndices(rowCount: number, sampleCap: number): number[] {
  if (rowCount <= sampleCap) {
    return Array.from({ length: rowCount }, (_, i) => i);
  }
  // 균등 간격 샘플링 — 완전 무작위보다 재현 가능하고, 데이터 앞부분에 쏠리지 않는다.
  const step = rowCount / sampleCap;
  const indices: number[] = [];
  for (let i = 0; i < sampleCap; i++) {
    indices.push(Math.floor(i * step));
  }
  return indices;
}

export function buildDataProfile(table: ParsedTable, options: BuildProfileOptions): DataProfile {
  const { fields, rows } = table;
  const rowCount = rows.length;

  const columns: ColumnProfile[] = [];
  /** qualityFlags 계산에 필요하지만 ColumnProfile 자체에는 담기지 않는 부가 정보 */
  const columnMeta: Array<{ mixedTypeSignal: number; nonMissingCount: number }> = [];
  const numericColumnsForCorrelation: NumericColumnValues[] = [];
  const correlationIndices = pickSampleRowIndices(rowCount, CORRELATION_SAMPLE_CAP);

  for (const field of fields) {
    const rawValues = rows.map((r) => r[field] ?? "");
    const nonMissing = rawValues.filter((v) => !isMissing(v));
    const missingCount = rawValues.length - nonMissing.length;
    const missingRate = rowCount > 0 ? missingCount / rowCount : 0;
    const uniqueCount = new Set(nonMissing).size;

    const override = options.typeOverrides?.[field];
    const inference = inferColumnType({ columnName: field, values: nonMissing, rowCount });
    const type: ColumnType = override ?? inference.type;

    const isPii = detectPiiColumn(field, nonMissing);

    const profile: ColumnProfile = {
      name: field,
      inferredType: type,
      userOverridden: override !== undefined,
      missingCount,
      missingRate,
      uniqueCount,
      piiMasked: isPii,
    };

    if (type === "numeric") {
      const numbers = nonMissing
        .map((v) => parseNumberLoose(v))
        .filter((n): n is number => n !== null);
      if (numbers.length > 0) {
        profile.numeric = computeNumericSummary(numbers);
      }
      numericColumnsForCorrelation.push({
        name: field,
        values: correlationIndices.map((idx) => {
          const raw = rawValues[idx];
          if (isMissing(raw)) return null;
          return parseNumberLoose(raw);
        }),
      });
    } else if (type === "categorical") {
      const displayValues = isPii ? nonMissing.map(maskPiiValue) : nonMissing;
      profile.categorical = computeCategoricalSummary(displayValues);
    } else if (type === "datetime") {
      profile.datetime = computeDatetimeSummary(nonMissing);
    } else if (type === "text") {
      const displayValues = isPii ? nonMissing.map(maskPiiValue) : nonMissing;
      profile.text = computeTextSummary(displayValues);
    }
    // type === "boolean" | "id": 별도 요약 없음 — 이름/타입/결측률/유일값 수로 충분

    columns.push(profile);
    columnMeta.push({ mixedTypeSignal: inference.mixedTypeSignal, nonMissingCount: nonMissing.length });
  }

  const qualityFlags: QualityFlag[] = [];
  for (let i = 0; i < columns.length; i++) {
    qualityFlags.push(...detectColumnFlags(columns[i], columnMeta[i].mixedTypeSignal, columnMeta[i].nonMissingCount));
  }

  const duplicateFlag = detectDuplicateRows(rows);
  if (duplicateFlag) qualityFlags.unshift(duplicateFlag);

  const correlations = computeCorrelations(numericColumnsForCorrelation);

  const sampleRows: Record<string, string>[] = [];
  if (options.includeSampleRows) {
    const piiFields = new Set(columns.filter((c) => c.piiMasked).map((c) => c.name));
    const sampleIdx = pickSampleRowIndices(rowCount, SAMPLE_ROW_COUNT);
    for (const idx of sampleIdx) {
      const row = rows[idx];
      const maskedRow: Record<string, string> = {};
      for (const field of fields) {
        const value = row[field] ?? "";
        maskedRow[field] = piiFields.has(field) && value.trim() !== "" ? maskPiiValue(value) : value;
      }
      sampleRows.push(maskedRow);
    }
  }

  return {
    fileName: table.fileName,
    rowCount,
    columnCount: fields.length,
    columns,
    correlations,
    sampleRows,
    sampleRowsIncluded: options.includeSampleRows,
    qualityFlags,
  };
}
