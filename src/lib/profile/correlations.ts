/**
 * 수치형 컬럼 쌍에 대한 Pearson / Spearman 상관계수 계산.
 * 대용량 데이터에서 O(k^2 * n) 비용을 감당하려고 호출자가 행을 샘플링해 넘기는 것을 전제로 한다
 * (buildProfile.ts 참고 — PLAN.md §8 "대용량 CSV 브라우저 메모리" 대응과 같은 맥락).
 */
import type { ColumnCorrelation } from "@/types/profile";

export interface NumericColumnValues {
  name: string;
  /** 행 인덱스에 정렬된 값. 결측/비수치는 null. */
  values: (number | null)[];
}

const MIN_PAIRS_FOR_CORRELATION = 3;
const TOP_N = 15;

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return 0;
  return num / denom;
}

/** 동순위는 평균 순위를 부여한다 */
function toRanks(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(0);

  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-indexed
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearman(xs: number[], ys: number[]): number {
  return pearson(toRanks(xs), toRanks(ys));
}

export function computeCorrelations(columns: NumericColumnValues[]): ColumnCorrelation[] {
  const results: ColumnCorrelation[] = [];

  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) {
      const colA = columns[i];
      const colB = columns[j];
      const xs: number[] = [];
      const ys: number[] = [];

      const len = Math.min(colA.values.length, colB.values.length);
      for (let r = 0; r < len; r++) {
        const a = colA.values[r];
        const b = colB.values[r];
        if (a !== null && b !== null) {
          xs.push(a);
          ys.push(b);
        }
      }

      if (xs.length < MIN_PAIRS_FOR_CORRELATION) continue;

      results.push({
        a: colA.name,
        b: colB.name,
        pearson: pearson(xs, ys),
        spearman: spearman(xs, ys),
      });
    }
  }

  return results
    .sort((p, q) => Math.max(Math.abs(q.pearson), Math.abs(q.spearman)) - Math.max(Math.abs(p.pearson), Math.abs(p.spearman)))
    .slice(0, TOP_N);
}
