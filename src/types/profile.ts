/**
 * DataProfile — CSV 원본 대신 LLM에 전달하는 요약 표현.
 * 브라우저에서 계산되며, 원본 행 데이터는 sampleRows(마스킹 적용, 최대 5행)만 포함한다.
 * 설계 근거: PLAN.md §2, §9.2
 */

export type ColumnType =
  | "numeric"
  | "categorical"
  | "datetime"
  | "boolean"
  | "text"
  | "id";

export interface NumericSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  std: number;
  skew: number;
  outlierCount: number;
  /** 등간격 히스토그램 도수 (기본 10 bin) */
  histogram: number[];
}

export interface CategoricalSummary {
  cardinality: number;
  /** 빈도 상위 값, 최대 10개 */
  topValues: Array<{ value: string; count: number }>;
}

export interface DatetimeSummary {
  min: string;
  max: string;
  granularity: "hour" | "day" | "week" | "month" | "year";
  /** 예상 간격 대비 비어 있는 구간 수 */
  gaps: number;
}

export interface TextSummary {
  avgLength: number;
  /** 마스킹 적용된 샘플 문자열, 최대 3개 */
  samples: string[];
}

export interface ColumnProfile {
  name: string;
  inferredType: ColumnType;
  /** 사용자가 프로파일 화면에서 타입을 교정했는지 */
  userOverridden?: boolean;
  missingCount: number;
  missingRate: number;
  uniqueCount: number;
  numeric?: NumericSummary;
  categorical?: CategoricalSummary;
  datetime?: DatetimeSummary;
  text?: TextSummary;
  /** PII로 자동 감지되어 샘플 값이 마스킹된 컬럼인지 (PLAN.md §9.2) */
  piiMasked?: boolean;
}

export interface ColumnCorrelation {
  a: string;
  b: string;
  pearson: number;
  spearman: number;
}

export type QualityFlagType =
  | "duplicate_rows"
  | "constant_column"
  | "high_missing"
  | "possible_pii"
  | "mixed_type"
  | "imbalanced";

export interface QualityFlag {
  type: QualityFlagType;
  column?: string;
  detail: string;
}

export interface DataProfile {
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  /** |r| 상위 쌍만 포함 (기본 상위 15쌍) */
  correlations: ColumnCorrelation[];
  /** 마스킹 적용된 샘플 행. 사용자가 전역 토글로 끌 수 있음 */
  sampleRows: Record<string, string>[];
  sampleRowsIncluded: boolean;
  qualityFlags: QualityFlag[];
}
