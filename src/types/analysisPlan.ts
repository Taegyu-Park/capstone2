/**
 * AnalysisPlan — /api/recommend 의 구조화 출력 스키마.
 * Zod로 정의해 zodOutputFormat()에 그대로 사용하고, LLM 응답을 런타임 검증한다.
 * 설계 근거: PLAN.md §3, §10.8. 원칙 2(LLM은 스펙만 낸다) / 원칙 3(출력은 검증한다).
 */
import { z } from "zod";

export const MethodFamilySchema = z.enum([
  "descriptive",
  "comparison",
  "relationship",
  "trend",
  "distribution",
  "composition",
  "segmentation",
  "anomaly",
]);

export const TransformFilterSchema = z.object({
  column: z.string(),
  op: z.enum(["eq", "ne", "gt", "gte", "lt", "lte", "in", "not_in", "contains"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
});

export const TransformDeriveSchema = z.object({
  name: z.string(),
  /** Arquero 표현식 문자열. 실행기가 화이트리스트 파서로 검증 후 실행한다 (PLAN.md §4) */
  expr: z.string(),
});

export const TransformAggregateSchema = z.object({
  column: z.string(),
  fn: z.enum(["sum", "mean", "median", "count", "min", "max", "std"]),
  as: z.string(),
});

export const TransformSchema = z.object({
  filters: z.array(TransformFilterSchema).nullable(),
  derive: z.array(TransformDeriveSchema).nullable(),
  groupBy: z.array(z.string()).nullable(),
  aggregate: z.array(TransformAggregateSchema).nullable(),
  sort: z.object({ by: z.string(), order: z.enum(["asc", "desc"]) }).nullable(),
  limit: z.number().int().positive().nullable(),
});

export const EncodingChannelSchema = z.object({
  field: z.string(),
  type: z.enum(["quantitative", "nominal", "ordinal", "temporal"]),
  aggregate: z.enum(["sum", "mean", "median", "count", "min", "max"]).nullable(),
});

export const ChartSpecSchema = z.object({
  mark: z.enum(["bar", "line", "point", "area", "boxplot", "rect", "arc"]),
  encoding: z.record(
    z.enum(["x", "y", "color", "size", "theta", "column", "row"]),
    EncodingChannelSchema,
  ),
  title: z.string(),
});

export const RecommendationSchema = z.object({
  id: z.string(),
  title: z.string(),
  question: z.string(),
  rationale: z.string(),
  method: z.object({
    name: z.string(),
    family: MethodFamilySchema,
    steps: z.array(z.string()),
  }),
  requiredColumns: z.array(z.string()),
  transform: TransformSchema,
  chart: ChartSpecSchema,
  caveats: z.array(z.string()),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  nextSteps: z.array(z.string()),
});

export const AnalysisPlanSchema = z.object({
  dataUnderstanding: z.string(),
  clarifyingQuestions: z.array(z.string()),
  recommendations: z.array(RecommendationSchema),
});

export type Transform = z.infer<typeof TransformSchema>;
export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;

/**
 * 스키마 검증만으로 못 잡는 것: transform/chart가 실제 존재하지 않는 컬럼을 참조하는 경우.
 * DataProfile.columns 이름 목록과 대조해 위반 컬럼을 반환한다.
 * 빈 배열이면 통과 — self-repair 재시도 여부를 이 함수 결과로 판단한다 (PLAN.md 원칙 3).
 */
export function findUnknownColumnReferences(
  plan: AnalysisPlan,
  knownColumns: string[],
): Array<{ recommendationId: string; column: string }> {
  const known = new Set(knownColumns);
  const violations: Array<{ recommendationId: string; column: string }> = [];

  for (const rec of plan.recommendations) {
    // derive가 만드는 파생 컬럼은 이 추천 안에서 이후 groupBy/aggregate/chart가
    // 참조할 수 있는 유효한 이름이므로, 검증 전에 known 집합에 추가한다.
    const knownForRec = new Set(known);
    for (const d of rec.transform.derive ?? []) knownForRec.add(d.name);
    // aggregate의 'as' 별칭도 같은 이유로 groupBy/chart가 참조할 수 있다.
    for (const a of rec.transform.aggregate ?? []) knownForRec.add(a.as);

    const referenced = new Set<string>();
    for (const c of rec.requiredColumns) referenced.add(c);
    for (const f of rec.transform.filters ?? []) referenced.add(f.column);
    for (const a of rec.transform.aggregate ?? []) referenced.add(a.column);
    for (const g of rec.transform.groupBy ?? []) referenced.add(g);
    if (rec.transform.sort) referenced.add(rec.transform.sort.by);
    for (const enc of Object.values(rec.chart.encoding)) referenced.add(enc.field);

    for (const col of referenced) {
      if (!knownForRec.has(col)) {
        violations.push({ recommendationId: rec.id, column: col });
      }
    }
  }

  return violations;
}
