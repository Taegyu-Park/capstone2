/**
 * 세션 메모리 상태. 서버 저장은 하지 않는다 (PLAN.md §9.1) — 새로고침하면 사라진다는 점을
 * UI에서 반드시 사용자에게 알려야 한다.
 */
import { create } from "zustand";
import type { ParsedTable, CsvParseWarning } from "@/lib/csv/parseCsv";
import { buildDataProfile } from "@/lib/profile/buildProfile";
import type { ColumnType, DataProfile } from "@/types/profile";
import { AnalysisContext, EMPTY_CONTEXT } from "@/types/context";

export type UploadStage = "idle" | "parsing" | "profiling" | "ready" | "error";

interface DataStoreState {
  stage: UploadStage;
  table: ParsedTable | null;
  profile: DataProfile | null;
  parseWarnings: CsvParseWarning[];
  errorMessage: string | null;
  typeOverrides: Record<string, ColumnType>;
  includeSampleRows: boolean;
  analysisContext: AnalysisContext;

  setStage: (stage: UploadStage) => void;
  setTable: (table: ParsedTable, warnings: CsvParseWarning[]) => void;
  setProfile: (profile: DataProfile) => void;
  setError: (message: string) => void;
  setTypeOverride: (column: string, type: ColumnType) => void;
  setIncludeSampleRows: (include: boolean) => void;
  setAnalysisContext: (ctx: AnalysisContext) => void;
  reset: () => void;
}

export const useDataStore = create<DataStoreState>((set, get) => ({
  stage: "idle",
  table: null,
  profile: null,
  parseWarnings: [],
  errorMessage: null,
  typeOverrides: {},
  includeSampleRows: true,
  analysisContext: EMPTY_CONTEXT,

  setStage: (stage) => set({ stage }),
  setTable: (table, warnings) => set({ table, parseWarnings: warnings, stage: "profiling" }),
  setProfile: (profile) => set({ profile, stage: "ready" }),
  setError: (message) => set({ errorMessage: message, stage: "error" }),
  setTypeOverride: (column, type) => {
    const { table, typeOverrides, includeSampleRows } = get();
    const nextOverrides = { ...typeOverrides, [column]: type };
    set({ typeOverrides: nextOverrides });
    if (table) {
      set({ profile: buildDataProfile(table, { typeOverrides: nextOverrides, includeSampleRows }) });
    }
  },
  setIncludeSampleRows: (include) => {
    const { table, typeOverrides } = get();
    set({ includeSampleRows: include });
    if (table) {
      set({ profile: buildDataProfile(table, { typeOverrides, includeSampleRows: include }) });
    }
  },
  setAnalysisContext: (ctx) => set({ analysisContext: ctx }),
  reset: () =>
    set({
      stage: "idle",
      table: null,
      profile: null,
      parseWarnings: [],
      errorMessage: null,
      typeOverrides: {},
      analysisContext: EMPTY_CONTEXT,
    }),
}));
