"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnProfile, ColumnType } from "@/types/profile";
import { useDataStore } from "@/store/dataStore";

const TYPE_LABELS: Record<ColumnType, string> = {
  numeric: "수치형",
  categorical: "범주형",
  datetime: "날짜/시간",
  boolean: "불리언",
  text: "텍스트",
  id: "식별자(ID)",
};

const TYPE_BADGE_VARIANT: Record<ColumnType, "default" | "secondary" | "outline"> = {
  numeric: "default",
  categorical: "secondary",
  datetime: "secondary",
  boolean: "outline",
  text: "outline",
  id: "outline",
};

function MiniHistogram({ histogram }: { histogram: number[] }) {
  const max = Math.max(...histogram, 1);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {histogram.map((count, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/60"
          style={{ height: `${Math.max((count / max) * 100, count > 0 ? 8 : 2)}%` }}
          title={`${count.toLocaleString()}건`}
        />
      ))}
    </div>
  );
}

export function ColumnCard({ column }: { column: ColumnProfile }) {
  const setTypeOverride = useDataStore((s) => s.setTypeOverride);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm font-medium">{column.name}</span>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={TYPE_BADGE_VARIANT[column.inferredType]}>
              {TYPE_LABELS[column.inferredType]}
            </Badge>
            {column.piiMasked && (
              <Badge variant="destructive" className="text-xs">
                PII 마스킹됨
              </Badge>
            )}
            {column.userOverridden && (
              <Badge variant="outline" className="text-xs">
                수정됨
              </Badge>
            )}
          </div>
        </div>
        <Select
          value={column.inferredType}
          onValueChange={(v) => setTypeOverride(column.name, v as ColumnType)}
        >
          <SelectTrigger size="sm" className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>결측 {(column.missingRate * 100).toFixed(1)}%</span>
          <span>고유값 {column.uniqueCount.toLocaleString()}개</span>
        </div>

        {column.numeric && (
          <div className="flex flex-col gap-1">
            <MiniHistogram histogram={column.numeric.histogram} />
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>min {column.numeric.min.toFixed(2)}</span>
              <span>중앙값 {column.numeric.median.toFixed(2)}</span>
              <span>max {column.numeric.max.toFixed(2)}</span>
              <span>표준편차 {column.numeric.std.toFixed(2)}</span>
              {column.numeric.outlierCount > 0 && (
                <span className="text-amber-600">이상치 {column.numeric.outlierCount}개</span>
              )}
            </div>
          </div>
        )}

        {column.categorical && (
          <div className="flex flex-wrap gap-1">
            {column.categorical.topValues.slice(0, 6).map((tv) => (
              <Badge key={tv.value} variant="outline" className="text-xs font-normal">
                {tv.value} ({tv.count})
              </Badge>
            ))}
            {column.categorical.cardinality > 6 && (
              <span className="text-xs text-muted-foreground">
                외 {column.categorical.cardinality - 6}개
              </span>
            )}
          </div>
        )}

        {column.datetime && (
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{new Date(column.datetime.min).toLocaleDateString()}</span>
            <span>~</span>
            <span>{new Date(column.datetime.max).toLocaleDateString()}</span>
            <span>단위: {column.datetime.granularity}</span>
            {column.datetime.gaps > 0 && <span className="text-amber-600">공백 구간 {column.datetime.gaps}건</span>}
          </div>
        )}

        {column.text && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>평균 길이 {column.text.avgLength.toFixed(0)}자</span>
            {column.text.samples.map((s, i) => (
              <span key={i} className="truncate italic">
                &ldquo;{s}&rdquo;
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
