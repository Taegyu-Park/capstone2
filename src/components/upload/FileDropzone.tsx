"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { parseCsvFile, type CsvParseWarning } from "@/lib/csv/parseCsv";
import { MANUAL_ENCODING_OPTIONS, type DetectedEncoding } from "@/lib/csv/encoding";
import { buildDataProfile } from "@/lib/profile/buildProfile";
import { useDataStore } from "@/store/dataStore";

/** 드래그앤드롭 + 파일 선택으로 CSV를 업로드하고, 파싱 → 프로파일링까지 트리거한다. */
export function FileDropzone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [warnings, setWarnings] = useState<CsvParseWarning[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const setStage = useDataStore((s) => s.setStage);
  const setTable = useDataStore((s) => s.setTable);
  const setProfile = useDataStore((s) => s.setProfile);
  const setError = useDataStore((s) => s.setError);
  const includeSampleRows = useDataStore((s) => s.includeSampleRows);

  const runPipeline = useCallback(
    async (file: File, overrideEncoding?: DetectedEncoding) => {
      setStage("parsing");
      setPendingFile(file);
      try {
        const { table, warnings: parseWarnings } = await parseCsvFile(file, overrideEncoding);
        setTable(table, parseWarnings);
        setWarnings(parseWarnings);

        setStage("profiling");
        const profile = buildDataProfile(table, { includeSampleRows });
        setProfile(profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "CSV를 처리하는 중 오류가 발생했습니다.");
      }
    },
    [includeSampleRows, setStage, setTable, setProfile, setError],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError("CSV 파일만 지원합니다.");
        return;
      }
      void runPipeline(file);
    },
    [runPipeline, setError],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card
        className={`border-2 border-dashed transition-colors ${
          isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-lg font-medium">CSV 파일을 여기에 끌어다 놓으세요</p>
          <p className="text-sm text-muted-foreground">
            원본 데이터는 서버로 전송되지 않습니다 — 브라우저에서만 처리됩니다.
          </p>
          <Button onClick={() => inputRef.current?.click()}>파일 선택</Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </CardContent>
      </Card>

      {warnings.some((w) => w.type === "encoding_degraded") && pendingFile && (
        <Alert variant="destructive">
          <AlertTitle>인코딩 자동 감지 실패</AlertTitle>
          <AlertDescription>
            <p className="mb-2">일부 문자가 깨졌을 수 있습니다. 인코딩을 직접 선택해 다시 시도하세요.</p>
            <div className="flex flex-wrap gap-2">
              {MANUAL_ENCODING_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant="outline"
                  onClick={() => void runPipeline(pendingFile, opt.value)}
                >
                  {opt.label}로 다시 열기
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {warnings
        .filter((w) => w.type !== "encoding_degraded")
        .map((w, i) => (
          <Alert key={i}>
            <AlertDescription>{w.detail}</AlertDescription>
          </Alert>
        ))}
    </div>
  );
}
