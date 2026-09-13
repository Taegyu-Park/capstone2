/**
 * AnalysisContext — 자연어 대화에서 추출되는 구조화된 맥락.
 * 대화 원문 대신 이 객체(+ DataProfile)만 /api/recommend 로 전달된다.
 * 설계 근거: PLAN.md §10
 */

export type DesiredOutcomeMode =
  | "explore"
  | "answer"
  | "validate"
  | "report"
  | "diagnose"
  | "prep_modeling";

export interface DesiredOutcome {
  mode: DesiredOutcomeMode | null;
  deliverable: string | null;
  breadth: "wide" | "focused" | null;
  rigor: "descriptive" | "inferential" | null;
  desiredCount: number | null;
}

export const DEFAULT_DESIRED_OUTCOME: DesiredOutcome = {
  mode: null,
  deliverable: null,
  breadth: null,
  rigor: null,
  desiredCount: null,
};

/** mode별 breadth/rigor 기본값 — PLAN.md §10.8 표 */
export const MODE_DEFAULTS: Record<
  DesiredOutcomeMode,
  { breadth: "wide" | "focused"; rigor: "descriptive" | "inferential" }
> = {
  explore: { breadth: "wide", rigor: "descriptive" },
  diagnose: { breadth: "wide", rigor: "descriptive" },
  answer: { breadth: "focused", rigor: "descriptive" },
  report: { breadth: "focused", rigor: "descriptive" },
  validate: { breadth: "focused", rigor: "inferential" },
  prep_modeling: { breadth: "wide", rigor: "descriptive" },
};

export interface AnalysisContext {
  domain: string;
  unitOfObservation: string;
  goal: string;
  desiredOutcome: DesiredOutcome;
  audience: string | null;
  decisions: string[];
  hypotheses: string[];
  keyMetrics: string[];
  segments: string[];
  timeframe: string | null;
  constraints: string[];
  columnSemantics: Record<string, string>;
  excludedColumns: string[];
  confidence: "low" | "medium" | "high";
  missingInfo: string[];
}

export const EMPTY_CONTEXT: AnalysisContext = {
  domain: "",
  unitOfObservation: "",
  goal: "",
  desiredOutcome: DEFAULT_DESIRED_OUTCOME,
  audience: null,
  decisions: [],
  hypotheses: [],
  keyMetrics: [],
  segments: [],
  timeframe: null,
  constraints: [],
  columnSemantics: {},
  excludedColumns: [],
  confidence: "low",
  missingInfo: [],
};

/**
 * confidence 최소 요건: goal + desiredOutcome.mode 둘만 있으면 추천 가능 (PLAN.md §10.8 끝부분).
 * UI에서 "추천 생성" 버튼 활성화 여부를 이 함수로 판단한다.
 */
export function canGenerateRecommendations(ctx: AnalysisContext): boolean {
  return ctx.goal.trim().length > 0 && ctx.desiredOutcome.mode !== null;
}
