"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { ProfileReport } from "@/components/profile/ProfileReport";
import { useDataStore } from "@/store/dataStore";

export default function Home() {
  const stage = useDataStore((s) => s.stage);
  const errorMessage = useDataStore((s) => s.errorMessage);
  const reset = useDataStore((s) => s.reset);

  // 서버에 아무것도 저장하지 않으므로(PLAN.md §9.1), 탭을 닫거나 새로고침하면
  // 지금까지의 작업이 사라진다는 점을 명시적으로 경고한다.
  useEffect(() => {
    if (stage === "idle") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [stage]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Analysis Copilot</h1>
          <p className="text-sm text-muted-foreground">
            CSV와 맥락을 주면 의미 있는 분석 방법과 차트를 추천합니다.
          </p>
        </div>
        {stage !== "idle" && (
          <Button variant="outline" onClick={reset}>
            새 파일로 시작
          </Button>
        )}
      </header>

      {stage === "idle" && <FileDropzone />}

      {(stage === "parsing" || stage === "profiling") && (
        <p className="text-sm text-muted-foreground">
          {stage === "parsing" ? "CSV를 파싱하는 중..." : "데이터를 프로파일링하는 중..."}
        </p>
      )}

      {stage === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <Button variant="outline" onClick={reset}>
            다시 시도
          </Button>
        </div>
      )}

      {stage === "ready" && <ProfileReport />}
    </div>
  );
}
