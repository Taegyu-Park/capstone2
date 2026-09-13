"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDataStore } from "@/store/dataStore";
import { ColumnCard } from "./ColumnCard";

const QUALITY_FLAG_LABELS: Record<string, string> = {
  duplicate_rows: "중복 행",
  constant_column: "상수 컬럼",
  high_missing: "높은 결측률",
  possible_pii: "개인정보 의심",
  mixed_type: "혼합 타입",
  imbalanced: "심한 불균형",
};

export function ProfileReport() {
  const profile = useDataStore((s) => s.profile);
  const table = useDataStore((s) => s.table);
  const includeSampleRows = useDataStore((s) => s.includeSampleRows);
  const setIncludeSampleRows = useDataStore((s) => s.setIncludeSampleRows);

  if (!profile || !table) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{profile.fileName}</span>
            <Badge variant="secondary">{profile.rowCount.toLocaleString()}행</Badge>
            <Badge variant="secondary">{profile.columnCount}열</Badge>
            <Badge variant="outline">인코딩: {table.encoding}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {table.truncated && (
            <Alert>
              <AlertTitle>일부 행만 사용됨</AlertTitle>
              <AlertDescription>
                원본 {table.originalRowCount.toLocaleString()}행 중 앞부분 {profile.rowCount.toLocaleString()}행만
                분석에 사용합니다.
              </AlertDescription>
            </Alert>
          )}

          {profile.qualityFlags.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">품질 경고</span>
              <ul className="flex flex-col gap-1.5">
                {profile.qualityFlags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {QUALITY_FLAG_LABELS[flag.type] ?? flag.type}
                    </Badge>
                    <span>
                      {flag.column && <span className="font-mono">{flag.column}</span>} {flag.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">샘플 행</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="sample-toggle" className="text-sm text-muted-foreground">
              LLM에 샘플 행 전송
            </Label>
            <Switch
              id="sample-toggle"
              checked={includeSampleRows}
              onCheckedChange={setIncludeSampleRows}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!includeSampleRows ? (
            <p className="text-sm text-muted-foreground">
              샘플 행을 전송하지 않도록 설정했습니다. 통계 요약만 LLM에 전달됩니다.
            </p>
          ) : profile.sampleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">표시할 샘플 행이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {profile.columns.map((c) => (
                      <TableHead key={c.name} className="font-mono text-xs">
                        {c.name}
                        {c.piiMasked && <span className="ml-1 text-destructive">*</span>}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.sampleRows.map((row, i) => (
                    <TableRow key={i}>
                      {profile.columns.map((c) => (
                        <TableCell key={c.name} className="text-xs">
                          {row[c.name]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-xs text-muted-foreground">
                * 표시된 컬럼은 개인정보로 추정되어 값이 마스킹되었습니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {profile.correlations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">주요 상관관계</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {profile.correlations.slice(0, 8).map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-mono">{c.a}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="font-mono">{c.b}</span>
                  <Badge variant={Math.abs(c.pearson) > 0.5 ? "default" : "secondary"}>
                    r = {c.pearson.toFixed(2)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div>
        <h2 className="mb-3 text-lg font-semibold">컬럼 상세 ({profile.columns.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {profile.columns.map((col) => (
            <ColumnCard key={col.name} column={col} />
          ))}
        </div>
      </div>
    </div>
  );
}
