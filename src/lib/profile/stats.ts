/**
 * 타입별 요약 통계 계산. DataProfile.columns[].numeric/categorical/datetime/text 를 채운다.
 */
import type {
  CategoricalSummary,
  DatetimeSummary,
  NumericSummary,
  TextSummary,
} from "@/types/profile";
import { mean, parseDateLoose, quantile, skewness, stddev } from "./parsers";

const HISTOGRAM_BINS = 10;

export function computeNumericSummary(values: number[]): NumericSummary {
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const q1 = quantile(sorted, 0.25);
  const median = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const avg = mean(values);
  const sd = stddev(values, avg);
  const skew = skewness(values, avg, sd);

  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const outlierCount = values.filter((v) => v < lowerFence || v > upperFence).length;

  const histogram = new Array(HISTOGRAM_BINS).fill(0);
  const range = max - min;
  if (range > 0) {
    for (const v of values) {
      let bin = Math.floor(((v - min) / range) * HISTOGRAM_BINS);
      if (bin >= HISTOGRAM_BINS) bin = HISTOGRAM_BINS - 1;
      if (bin < 0) bin = 0;
      histogram[bin] += 1;
    }
  } else {
    histogram[0] = values.length;
  }

  return { min, q1, median, q3, max, mean: avg, std: sd, skew, outlierCount, histogram };
}

export function computeCategoricalSummary(values: string[]): CategoricalSummary {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const topValues = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));

  return { cardinality: counts.size, topValues };
}

type Granularity = DatetimeSummary["granularity"];

function inferGranularity(sortedDates: Date[]): Granularity {
  if (sortedDates.length < 2) return "day";
  const deltasMs: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const d = sortedDates[i].getTime() - sortedDates[i - 1].getTime();
    if (d > 0) deltasMs.push(d);
  }
  if (deltasMs.length === 0) return "day";
  deltasMs.sort((a, b) => a - b);
  const medianDeltaMs = deltasMs[Math.floor(deltasMs.length / 2)];

  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  if (medianDeltaMs < DAY) return "hour";
  if (medianDeltaMs < WEEK) return "day";
  if (medianDeltaMs < MONTH) return "week";
  if (medianDeltaMs < YEAR) return "month";
  return "year";
}

export function computeDatetimeSummary(rawValues: string[]): DatetimeSummary {
  const dates = rawValues
    .map((v) => parseDateLoose(v))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  const min = dates[0] ?? new Date(0);
  const max = dates[dates.length - 1] ?? new Date(0);
  const granularity = inferGranularity(dates);

  const stepMs = { hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000 }[
    granularity
  ];
  let gaps = 0;
  for (let i = 1; i < dates.length; i++) {
    const delta = dates[i].getTime() - dates[i - 1].getTime();
    if (delta > stepMs * 1.5) gaps += 1;
  }

  return {
    min: min.toISOString(),
    max: max.toISOString(),
    granularity,
    gaps,
  };
}

export function computeTextSummary(values: string[]): TextSummary {
  const avgLength = values.reduce((acc, v) => acc + v.length, 0) / (values.length || 1);
  const distinctSamples = [...new Set(values)].slice(0, 3);
  return { avgLength, samples: distinctSamples };
}
