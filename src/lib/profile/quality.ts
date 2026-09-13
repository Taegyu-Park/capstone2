/**
 * 데이터 품질 경고 감지. LLM이 diagnose 모드(§10.8)에서 근거로 삼을 수 있도록
 * DataProfile.qualityFlags 로 노출된다.
 */
import type { ColumnProfile, QualityFlag } from "@/types/profile";

const HIGH_MISSING_THRESHOLD = 0.3;
const IMBALANCE_THRESHOLD = 0.9;
const DUPLICATE_ROW_RATIO_THRESHOLD = 0.01;

export function detectDuplicateRows(rows: Record<string, string>[]): QualityFlag | null {
  if (rows.length === 0) return null;
  const seen = new Set<string>();
  let duplicateCount = 0;

  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      duplicateCount += 1;
    } else {
      seen.add(key);
    }
  }

  if (duplicateCount / rows.length < DUPLICATE_ROW_RATIO_THRESHOLD || duplicateCount === 0) {
    return null;
  }

  return {
    type: "duplicate_rows",
    detail: `완전히 동일한 행이 ${duplicateCount.toLocaleString()}개 있습니다 (전체의 ${((duplicateCount / rows.length) * 100).toFixed(1)}%).`,
  };
}

export function detectColumnFlags(
  profile: ColumnProfile,
  mixedTypeSignal: number,
  nonMissingCount: number,
): QualityFlag[] {
  const flags: QualityFlag[] = [];

  if (profile.missingRate >= HIGH_MISSING_THRESHOLD) {
    flags.push({
      type: "high_missing",
      column: profile.name,
      detail: `결측률 ${(profile.missingRate * 100).toFixed(1)}% — 이 컬럼을 쓰는 분석은 결측 처리 방식을 명시해야 합니다.`,
    });
  }

  if (profile.uniqueCount === 1 && profile.missingRate < 1) {
    flags.push({
      type: "constant_column",
      column: profile.name,
      detail: "모든 값이 동일합니다 — 분석적으로 정보량이 없는 컬럼입니다.",
    });
  }

  if (profile.piiMasked) {
    flags.push({
      type: "possible_pii",
      column: profile.name,
      detail: "개인식별정보로 추정되어 샘플 값을 마스킹했습니다.",
    });
  }

  if (mixedTypeSignal > 0) {
    flags.push({
      type: "mixed_type",
      column: profile.name,
      detail: `값의 약 ${(mixedTypeSignal * 100).toFixed(0)}%가 숫자 또는 날짜 형식과 나머지가 섞여 있습니다. 타입을 확인해 주세요.`,
    });
  }

  if (profile.categorical && profile.categorical.topValues.length > 0 && nonMissingCount > 0) {
    const top = profile.categorical.topValues[0];
    if (top.count / nonMissingCount >= IMBALANCE_THRESHOLD) {
      flags.push({
        type: "imbalanced",
        column: profile.name,
        detail: `"${top.value}" 값이 전체의 ${((top.count / nonMissingCount) * 100).toFixed(1)}% 이상을 차지합니다 — 극단적으로 불균형합니다.`,
      });
    }
  }

  return flags;
}
