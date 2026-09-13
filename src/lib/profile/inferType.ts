/**
 * 컬럼 타입 추론. 휴리스틱이므로 완벽하지 않다 — 프로파일 화면에서 사용자가 교정할 수 있게
 * ColumnProfile.userOverridden 경로를 열어둔다 (PLAN.md §8 리스크: "타입 추론 오류").
 */
import type { ColumnType } from "@/types/profile";
import { isMissing, parseBooleanLoose, parseDateLoose, parseNumberLoose } from "./parsers";

const ID_NAME_RE = /(^|_)(id|no|번호|코드|code)($|_)/i;

export interface TypeInferenceInput {
  columnName: string;
  values: string[]; // 결측 제외한 원본 값 (문자열)
  rowCount: number;
}

export interface TypeInferenceResult {
  type: ColumnType;
  /** 최종 타입 판정의 근거 비율 (해당 타입으로 파싱/분류된 값의 비율) — 설명용 */
  confidence: number;
  /**
   * "형식이 섞여 있다"를 판단하기 위한 신호. 최종 타입이 numeric/datetime으로 확정되면 0
   * (이미 90% 이상 일치해 섞임이 아니므로). categorical/text로 폴백했는데 숫자나 날짜로도
   * 상당수 해석 가능했다면(예: 40~90%) 그 비율을 담는다 — 순수 범주형의 confidence 프록시와는
   * 별개 지표라서, quality.ts는 이 필드만 mixed_type 판정에 써야 한다.
   */
  mixedTypeSignal: number;
}

const CONFIDENCE_THRESHOLD = 0.9;

export function inferColumnType({ columnName, values, rowCount }: TypeInferenceInput): TypeInferenceResult {
  const nonMissing = values.filter((v) => !isMissing(v));
  if (nonMissing.length === 0) {
    return { type: "text", confidence: 0, mixedTypeSignal: 0 };
  }

  const uniqueValues = new Set(nonMissing);
  const uniqueRate = uniqueValues.size / nonMissing.length;

  // 1) 불리언 — 값 종류가 2개 이하이고 전부 불리언 토큰으로 해석되는 경우
  if (uniqueValues.size <= 2) {
    const boolHits = nonMissing.filter((v) => parseBooleanLoose(v) !== null).length;
    if (boolHits / nonMissing.length >= CONFIDENCE_THRESHOLD) {
      return { type: "boolean", confidence: boolHits / nonMissing.length, mixedTypeSignal: 0 };
    }
  }

  // 항상 계산해 두고, 최종 분기가 numeric/datetime이 아니어도 mixed_type 판정에 재사용한다.
  const numericHits = nonMissing.filter((v) => parseNumberLoose(v) !== null).length;
  const numericRate = numericHits / nonMissing.length;
  const dateHits = nonMissing.filter((v) => parseDateLoose(v) !== null).length;
  const dateRate = dateHits / nonMissing.length;
  const partialFormatSignal = Math.max(
    numericRate < CONFIDENCE_THRESHOLD ? numericRate : 0,
    dateRate < CONFIDENCE_THRESHOLD ? dateRate : 0,
  );

  // 2) 숫자 — 대다수가 숫자로 파싱되는 경우. 단, ID 이름 패턴 + 거의 유일값이면 id로 우선 분류.
  if (numericRate >= CONFIDENCE_THRESHOLD) {
    const looksLikeId =
      ID_NAME_RE.test(columnName) && uniqueRate >= 0.95 && rowCount > 1;
    if (looksLikeId) {
      return { type: "id", confidence: uniqueRate, mixedTypeSignal: 0 };
    }
    return { type: "numeric", confidence: numericRate, mixedTypeSignal: 0 };
  }

  // 3) 날짜 — 대다수가 날짜 형태로 파싱되는 경우
  if (dateRate >= CONFIDENCE_THRESHOLD) {
    return { type: "datetime", confidence: dateRate, mixedTypeSignal: 0 };
  }

  // 4) 문자열 기반 ID — 이름 패턴 + 값 대부분이 유일
  if (ID_NAME_RE.test(columnName) && uniqueRate >= 0.98) {
    return { type: "id", confidence: uniqueRate, mixedTypeSignal: 0 };
  }

  // 5) 범주형 vs 자유 텍스트 — 유일값 비율과 평균 길이로 구분
  const avgLength =
    nonMissing.reduce((acc, v) => acc + v.length, 0) / nonMissing.length;
  const lowCardinality = uniqueValues.size <= 50 || uniqueRate <= 0.5;

  // 부분적으로 숫자/날짜처럼 보이는 값이 뚜렷이 섞여 있을 때만 신호를 살린다
  // (예: 0.05 같은 낮은 비율은 오탈자 한둘일 뿐 "혼합 타입"이라 보기 어렵다).
  const meaningfulMixedSignal = partialFormatSignal >= 0.3 ? partialFormatSignal : 0;

  if (lowCardinality && avgLength <= 60) {
    return { type: "categorical", confidence: 1 - uniqueRate, mixedTypeSignal: meaningfulMixedSignal };
  }

  return { type: "text", confidence: uniqueRate, mixedTypeSignal: meaningfulMixedSignal };
}
