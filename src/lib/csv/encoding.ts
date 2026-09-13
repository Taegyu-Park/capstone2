/**
 * CSV 인코딩 감지 + 디코딩.
 * 한글 CSV는 UTF-8뿐 아니라 EUC-KR/CP949(엑셀 기본 내보내기), UTF-16(엑셀 "유니코드 텍스트")도 흔하다.
 * 설계 근거: PLAN.md §8 리스크 표 "한글 CSV 인코딩 깨짐".
 *
 * 전략:
 * 1) BOM이 있으면 그걸 신뢰한다 (UTF-8 BOM / UTF-16LE / UTF-16BE).
 * 2) BOM이 없으면 엄격 모드(fatal:true)로 UTF-8 디코딩을 시도한다 — 성공하면 UTF-8.
 * 3) 실패하면 EUC-KR로 엄격 디코딩을 시도한다.
 *    (브라우저 TextDecoder의 'euc-kr' 라벨은 WHATWG 스펙상 windows-949로 매핑되어
 *     CP949 한글 바이트를 사실상 그대로 해석한다.)
 * 4) 그마저 실패하면 UTF-8을 비엄격 모드로 디코딩하고 "unknown"으로 표시해
 *    호출자가 사용자에게 수동 인코딩 선택을 안내할 수 있게 한다.
 */

export type DetectedEncoding = "utf-8" | "utf-16le" | "utf-16be" | "euc-kr" | "unknown";

export interface DecodeResult {
  text: string;
  encoding: DetectedEncoding;
  /** true면 자동 감지가 실패해 손실 있는 디코딩(대체 문자 포함 가능)으로 폴백했음 */
  degraded: boolean;
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
}

function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
}

function tryDecode(bytes: Uint8Array, label: string): string | null {
  try {
    const decoder = new TextDecoder(label, { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

export function detectAndDecode(buffer: ArrayBuffer): DecodeResult {
  const bytes = new Uint8Array(buffer);

  if (hasUtf8Bom(bytes)) {
    const text = new TextDecoder("utf-8").decode(bytes.slice(3));
    return { text, encoding: "utf-8", degraded: false };
  }
  if (hasUtf16LeBom(bytes)) {
    const text = new TextDecoder("utf-16le").decode(bytes.slice(2));
    return { text, encoding: "utf-16le", degraded: false };
  }
  if (hasUtf16BeBom(bytes)) {
    const text = new TextDecoder("utf-16be").decode(bytes.slice(2));
    return { text, encoding: "utf-16be", degraded: false };
  }

  const asUtf8 = tryDecode(bytes, "utf-8");
  if (asUtf8 !== null) {
    return { text: asUtf8, encoding: "utf-8", degraded: false };
  }

  const asEucKr = tryDecode(bytes, "euc-kr");
  if (asEucKr !== null) {
    return { text: asEucKr, encoding: "euc-kr", degraded: false };
  }

  // 마지막 폴백: 손실을 감수하고 UTF-8로 디코딩 (대체 문자 U+FFFD가 섞일 수 있음)
  const fallback = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return { text: fallback, encoding: "unknown", degraded: true };
}

/** 사용자가 자동 감지 결과를 신뢰하지 못할 때 수동으로 선택할 수 있는 인코딩 목록 */
export const MANUAL_ENCODING_OPTIONS: Array<{ label: string; value: DetectedEncoding }> = [
  { label: "UTF-8", value: "utf-8" },
  { label: "EUC-KR / CP949", value: "euc-kr" },
  { label: "UTF-16LE", value: "utf-16le" },
  { label: "UTF-16BE", value: "utf-16be" },
];

export function decodeWithEncoding(buffer: ArrayBuffer, encoding: DetectedEncoding): string {
  const bytes = new Uint8Array(buffer);
  if (encoding === "unknown") {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  return new TextDecoder(encoding, { fatal: false }).decode(bytes);
}
