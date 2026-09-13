# Data Analysis Copilot — 설계 계획

CSV 데이터 + 자연어 맥락 → **의미 있는 분석 방법 추천 + 차트 초안**을 생성하는 웹앱.

---

## 1. 핵심 설계 원칙 (이 3개가 앱의 정체성)

### 원칙 1 — 원본 데이터는 LLM에 보내지 않는다
브라우저에서 CSV를 파싱하고 **"데이터 프로파일"(스키마 + 통계 요약 + 소량 샘플)만** 서버/LLM으로 전송한다.

- 10만 행 CSV를 그대로 보내면 수백만 토큰 → 비용·지연·컨텍스트 한계 모두 파탄
- 프로파일은 컬럼 30개 기준 3~8KB (토큰 1~3K) → 대화 몇십 턴도 저렴
- 원본이 서버를 떠나지 않으므로 프라이버시 측면에서도 유리

### 원칙 2 — LLM은 차트를 "그리지" 않고 "스펙"을 생성한다
LLM은 숫자를 만들지 않는다. `transform`(집계 파이프라인) + `chart`(Vega-Lite encoding) **스펙 JSON**만 내고,
실제 집계·렌더는 앱이 전체 데이터로 수행한다.

- 수치 할루시네이션 원천 차단
- 스펙이 곧 데이터이므로 사용자가 수정 가능 / 재현 가능 / 코드로 내보내기 가능

### 원칙 3 — LLM 출력은 반드시 검증 후 사용한다
Structured Outputs(Zod 스키마) + 런타임 검증(참조 컬럼이 실제 존재하는가, 타입이 맞는가) →
실패 시 에러를 피드백해 **1회 자가 수정(self-repair) 재시도**.

---

## 2. 데이터 프로파일 스펙 (LLM 입력)

```ts
type DataProfile = {
  rowCount: number
  columnCount: number
  columns: Array<{
    name: string
    inferredType: 'numeric' | 'categorical' | 'datetime' | 'boolean' | 'text' | 'id'
    missingCount: number; missingRate: number; uniqueCount: number
    numeric?:  { min, q1, median, q3, max, mean, std, skew, outlierCount, histogram: number[] }
    categorical?: { cardinality: number; topValues: Array<{ value: string; count: number }> } // 최대 10
    datetime?: { min, max, granularity: 'hour'|'day'|'week'|'month'|'year'; gaps: number }
    text?: { avgLength: number; samples: string[] }
  }>
  correlations: Array<{ a: string; b: string; pearson: number; spearman: number }>  // |r| 상위 N쌍
  sampleRows: Record<string, string>[]   // 5행, PII 마스킹 옵션
  qualityFlags: Array<{ type: 'duplicate_rows'|'constant_column'|'high_missing'|'possible_pii'|'mixed_type'|'imbalanced', column?: string, detail: string }>
}
```

## 3. LLM 출력 스펙 (분석 추천)

```ts
type AnalysisPlan = {
  dataUnderstanding: string          // "이 데이터는 ~로 보입니다" — 사용자 확인용
  clarifyingQuestions: string[]      // 맥락이 부족하면 되묻기
  recommendations: Array<{
    id: string
    title: string
    question: string                 // 이 분석이 답하는 질문
    rationale: string                // 왜 이 맥락에서 의미 있는가
    method: {
      name: string                   // 예: "그룹 간 평균 비교 (Welch t-test)"
      family: 'descriptive'|'comparison'|'relationship'|'trend'|'distribution'|'composition'|'segmentation'|'anomaly'
      steps: string[]
    }
    requiredColumns: string[]
    transform: {                     // 앱이 결정적으로 실행 (Arquero)
      filters?: Array<{ column: string; op: string; value: unknown }>
      derive?: Array<{ name: string; expr: string }>
      groupBy?: string[]
      aggregate?: Array<{ column: string; fn: 'sum'|'mean'|'median'|'count'|'min'|'max'|'std'; as: string }>
      sort?: { by: string; order: 'asc'|'desc' }
      limit?: number
    }
    chart: {                         // Vega-Lite 부분 스펙 (data는 앱이 주입)
      mark: 'bar'|'line'|'point'|'area'|'boxplot'|'rect'|'arc'
      encoding: Record<string, { field: string; type: 'quantitative'|'nominal'|'ordinal'|'temporal'; aggregate?: string }>
      title: string
    }
    caveats: string[]                // 표본 크기, 인과 추론 불가, 결측 처리 등
    priority: 1|2|3|4|5
    nextSteps: string[]
  }>
}
```

## 4. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 15 (App Router) + TypeScript | Vercel 1급 지원 |
| UI | Tailwind CSS + shadcn/ui | 빠른 구축, 일관된 디자인 |
| CSV 파싱 | PapaParse (Web Worker) | 스트리밍 파싱, 대용량 대응 |
| 인코딩 감지 | TextDecoder 다중 시도 + 휴리스틱 | **한글 CSV는 EUC-KR/CP949가 흔함** |
| 데이터 조작 | Arquero | 브라우저용 dplyr류 API, 경량 |
| 차트 | Vega-Lite + react-vega | LLM이 선언적 스펙을 생성할 수 있는 유일한 실용 선택 |
| LLM | `@anthropic-ai/sdk`, `claude-opus-5` | Structured Outputs + adaptive thinking |
| 검증 | Zod (+ `zodOutputFormat`) | 스키마 정의와 LLM 출력 검증을 하나로 |
| 상태 | Zustand | 파싱된 테이블은 메모리에만 보관 |
| 배포 | Vercel (Node runtime, 스트리밍) | |

## 5. API 라우트

| 라우트 | 입력 | 출력 |
|---|---|---|
| `POST /api/chat` | 프로파일 + 대화 히스토리 | 텍스트 스트림 (맥락 파악 대화) |
| `POST /api/recommend` | 프로파일 + 확정된 맥락 | `AnalysisPlan` JSON (structured output) |
| `POST /api/refine` | 추천 1개 + 사용자 피드백 | 수정된 추천 1개 |
| `POST /api/export-code` | 추천 1개 | pandas / R 코드 문자열 |

**프롬프트 캐싱**: `system`(고정 프롬프트) + 데이터 프로파일에 `cache_control: {type:'ephemeral'}` →
대화 턴마다 프로파일을 재전송해도 비용이 붙지 않음. 볼륨 큰 쪽을 앞에, 변하는 사용자 발화를 뒤에 배치.

**모델 설정**: `model: 'claude-opus-5'`, `thinking: {type:'adaptive'}`, 스트리밍 응답
(Vercel 함수 타임아웃 회피 목적으로도 스트리밍 필수).

## 6. 화면 흐름

1. **업로드** — 드래그앤드롭 + 샘플 데이터셋 3종 제공
2. **프로파일 리포트** — 컬럼별 타입/분포/결측, 품질 경고, **타입 수정 UI**(추론 오류 교정)
3. **맥락 대화** — LLM이 먼저 "이 데이터는 ~로 보입니다. 무엇을 알고 싶으신가요?" → 사용자 답변 → 필요시 되묻기
4. **추천 카드 그리드** — 카드 = 제목 + 답하는 질문 + 미니 차트 + 우선순위
5. **카드 상세** — 큰 차트 + 방법 설명 + 주의점 + "왜 이 차트인가" + 대화로 수정
6. **내보내기(로컬 저장)** — 차트 PNG/SVG, 단독 실행 HTML 리포트, pandas/R 코드 (전부 브라우저에서 파일 다운로드, 서버 저장 없음)

## 7. 마일스톤

| | 내용 | 비고 |
|---|---|---|
| **M0** | Next.js 스캐폴드, Vercel 배포 파이프라인, 환경변수 | |
| **M1** | 업로드 → 인코딩 감지 → 파싱 → 프로파일링 → 리포트 UI | **LLM 없이 완결.** 앱 품질의 80%가 여기서 결정됨 |
| **M2** | `/api/chat` 스트리밍 대화, 프로파일을 컨텍스트로 주입 | |
| **M3** | `/api/recommend` structured output + Zod 검증 + self-repair, 추천 카드 UI | |
| **M4** | transform 실행기(Arquero) + Vega-Lite 렌더링, 카드 상세 | |
| **M5** | 카드별 리파인 대화, **로컬 내보내기**(PNG/SVG/단독 HTML 리포트/코드) | 전부 클라이언트 사이드 다운로드 |
| **M6** | 에러·로딩·빈 상태, 샘플 데이터셋, 반응형, 배포 마감 | |

## 8. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| LLM이 존재하지 않는 컬럼 참조 | Zod 스키마 + 컬럼 존재 검증 → 에러 피드백 후 1회 재시도 **(필수 구현)** |
| 한글 CSV 인코딩 깨짐 (EUC-KR/CP949) | UTF-8 디코드 실패 시 CP949 폴백, 사용자 수동 선택 제공 |
| 타입 추론 오류 (숫자형 ID, `"1,234"`, 다양한 날짜 포맷) | 휴리스틱 + 프로파일 화면에서 사용자가 타입 교정 |
| 대용량 CSV 브라우저 메모리 | 초기 20만 행 상한 + 초과 시 샘플링 경고. v2에서 DuckDB-WASM |
| API 키 노출 | 서버 라우트에서만 호출. 클라이언트 번들에 절대 미포함 |
| Vercel 함수 타임아웃 (Hobby 10s) | 전 구간 스트리밍. 무거운 추천 생성은 단계 분할 |
| LLM 비용 폭주 | 프로파일만 전송 + 프롬프트 캐싱 + 세션당 rate limit |

## 9. 확정 사항

### 9.1 저장 — 서버 저장 없음, 로컬 파일 내보내기만
인증·DB·오브젝트 스토리지를 **전혀 두지 않는다.** 앱은 프론트엔드 + LLM 프록시 API 라우트로만 구성한다.
분석 결과는 브라우저에서 파일로 만들어 사용자 컴퓨터에 다운로드한다.

| 형식 | 내용 | 구현 |
|---|---|---|
| **PNG / SVG** | 차트 이미지 1장 | `vega-embed` 의 `view.toImageURL('png'\|'svg')` → `<a download>` |
| **단독 HTML 리포트** | 선택한 추천 전체 — 제목·질문·근거·방법·주의점 + **인터랙티브 차트** | 하나의 HTML 문자열로 조립(Vega-Lite 스펙 + 집계된 데이터를 인라인 임베드) → `Blob` 다운로드. 인터넷 없이 더블클릭으로 열림 |
| **분석 코드** | pandas / R 스크립트 | `transform` 스펙 → 코드 변환 후 `.py` / `.R` 다운로드 |
| **프로파일 JSON** | 데이터 프로파일 원본 | 디버깅·재현용 |

설계상 파생되는 것들:
- 서버에 아무것도 남지 않으므로 **새로고침하면 작업이 사라진다** → 상단에 상시 "내보내기" 버튼, 탭 이탈 시 `beforeunload` 경고
- HTML 리포트에 임베드하는 데이터는 **집계 결과만**(원본 전체 아님) → 파일 크기 관리. 집계 행이 5,000행을 넘으면 정적 SVG로 폴백
- 리포트는 라이트/다크 양쪽에서 읽히도록 CSS 변수로 팔레트 정의

### 9.2 샘플 행 — 기본 전송 ON + PII 자동 마스킹
프로파일에 샘플 5행을 포함해 LLM이 컬럼의 실제 의미를 파악하게 한다. 단:

1. **PII 의심 컬럼 자동 감지** — 컬럼명 패턴(`이름/name/email/전화/휴대폰/주민/카드/주소/id`) + 값 패턴(이메일 정규식, `010-xxxx-xxxx`, 주민번호 형태, 카드번호 형태)
2. 감지된 컬럼의 샘플 값은 **마스킹 후 전송** (`hong***@***.com`, `010-****-1234`). 통계 요약(고유값 수, 결측률)은 그대로 유지 — 분석 설계에 필요한 건 그쪽이다
3. 프로파일 화면에 **"이 컬럼들을 마스킹했습니다"** 를 명시하고, 사용자가 컬럼별로 마스킹 해제/추가 가능
4. 전역 토글 **"샘플 행 전송 안 함"** 제공 (완전 차단)

---

## 10. 맥락 수집 레이어 (자연어 → 구조화된 맥락)

### 10.1 왜 대화 히스토리를 그대로 쓰지 않는가
`/api/recommend`에 대화 원문을 통째로 넘기는 방법도 있지만 쓰지 않는다.

- 턴이 쌓일수록 맥락이 잡담에 묻힌다 ("아 잠깐만요", "다시 할게요" 같은 것까지 다 들어감)
- 사용자가 **LLM이 내 말을 뭘로 이해했는지 볼 수 없다** → 원칙 3(검증)의 정신에 어긋남
- 추천을 재생성할 때마다 전체 대화를 재전송 → 캐시 무효화
- 내보내기 리포트에 "분석 배경"으로 넣을 깔끔한 덩어리가 없음

대신 대화에서 **`AnalysisContext` 객체를 계속 갱신**하고, 그걸 화면에 보여주며, 추천 엔진에는 그것만 넘긴다.

### 10.2 AnalysisContext 스키마

```ts
type AnalysisContext = {
  domain: string                 // "대학 수강·성적 데이터"
  unitOfObservation: string      // "한 행 = 학생 1명의 한 과목 수강 기록"
  goal: string                   // 사용자가 알고 싶은 것 (자유 서술)
  desiredOutcome: DesiredOutcome  // 무엇을 손에 쥐고 싶은가 — §10.8
  audience: string | null        // 누구에게 보고하는가 — 차트 복잡도를 좌우
  decisions: string[]            // 이 분석으로 내릴 의사결정
  hypotheses: string[]           // 사용자가 이미 가진 가설
  keyMetrics: string[]           // 중요하게 보는 지표
  segments: string[]             // 나눠서 봐야 할 축 (학과, 학년, 지역…)
  timeframe: string | null
  constraints: string[]          // "2022년은 코로나로 이상치", "A지점은 5월 개점"
  columnSemantics: Record<string, string>  // 사용자가 알려준 컬럼별 의미
  excludedColumns: string[]      // 분석에서 뺄 컬럼
  confidence: 'low' | 'medium' | 'high'    // 추천을 내기에 맥락이 충분한가
  missingInfo: string[]          // 아직 모르는 것 → 다음 질문의 근거
}
```

`audience`와 `constraints`가 특히 값이 큰 필드다. 같은 데이터라도 "교수님 보고용"이면 단순한 막대·선 그래프,
"학회 발표용"이면 분포·신뢰구간까지 들어가야 한다. `constraints`는 LLM이 혼자서는 절대 알 수 없는 정보다.

### 10.3 입력 방식 — 두 경로 모두 지원

| 경로 | 상황 | 구현 |
|---|---|---|
| **A. 대화형** (기본) | 사용자가 뭘 물어야 할지 모름 | LLM이 프로파일을 보고 먼저 "이 데이터는 ~로 보입니다. 무엇을 알고 싶으신가요?" + 질문 2~3개 → 자연어 답변 → 필요시 되묻기 |
| **B. 한 번에 붙여넣기** | 사용자가 배경을 이미 다 알고 있음 | 업로드 화면에 자유 텍스트 영역. 문단 하나를 붙여넣으면 LLM이 한 번에 `AnalysisContext`로 파싱 |

B로 시작해 A로 보강하는 혼합도 가능하게 한다. 대화 왕복은 사용자에게 비용이므로 **강제하지 않는다.**

### 10.4 대화 → 맥락 갱신 메커니즘 (툴 사용)

`/api/chat`은 한 응답에서 두 가지를 동시에 내야 한다: 화면에 흐를 **대화 텍스트**와 갱신된 **맥락**.
`update_context` 툴을 정의해 LLM이 대화 도중 호출하게 한다.

```ts
tools: [{
  name: 'update_context',
  description: '사용자 발화에서 새로 파악한 분석 맥락을 기록한다. 변경된 필드만 포함할 것.',
  strict: true,
  input_schema: { /* AnalysisContext의 Partial, additionalProperties: false */ }
}]
```

이 방식의 이점:
- 대화 텍스트는 **스트리밍으로 즉시** 흐르고, 맥락 갱신은 실제로 새 정보가 나왔을 때만 끼어든다
- 매 턴 맥락 전체를 재생성하지 않으므로 값이 흔들리지 않는다 (사용자가 손으로 고친 값도 보존)
- 툴 호출이 없으면 = 새 맥락 없음. 명시적이라 디버깅이 쉽다

### 10.5 화면 — "파악한 맥락" 패널
대화 패널 옆에 현재 `AnalysisContext`를 카드로 상시 표시한다.

- 필드별로 **사용자가 직접 편집·삭제 가능** (LLM이 잘못 이해한 걸 대화로 교정하는 건 번거롭다)
- 갱신된 필드는 잠깐 하이라이트 → 내 말이 반영됐다는 피드백
- `confidence`와 `missingInfo`를 근거로 **"추천 생성" 버튼 활성화 상태**를 결정.
  `low`면 버튼 옆에 "맥락이 더 필요합니다: {missingInfo}" 표시하되 **막지는 않는다** (사용자가 강행할 수 있어야 함)

### 10.6 추천 엔진으로 넘어가는 것
`POST /api/recommend` 의 입력 = `DataProfile` + `AnalysisContext` **둘만**. 대화 원문은 넘기지 않는다.
→ 프롬프트가 짧고 결정적이며, 같은 맥락이면 같은 추천이 나온다. 내보내기 리포트에도 `AnalysisContext`를
"분석 배경" 섹션으로 그대로 실어 결과의 전제를 남긴다.

### 10.7 마일스톤 반영
M2를 둘로 나눈다.

| | 내용 |
|---|---|
| **M2a** | `/api/chat` 스트리밍 대화 + 프로파일 컨텍스트 주입 |
| **M2b** | `update_context` 툴, `AnalysisContext` 상태, "파악한 맥락" 편집 패널, 붙여넣기 입력(경로 B) |

### 10.8 원하는 결과(`desiredOutcome`) — 추천 전략을 가르는 축

`goal`("학기별 성적 변화를 알고 싶다")과 `desiredOutcome`("학과 회의 슬라이드에 넣을 차트 3장")은 **다른 정보**다.
전자는 *무엇을 알고 싶은가*, 후자는 *무엇을 손에 쥐고 싶은가*. 같은 `goal`이라도 후자가 다르면 추천이 완전히 달라진다.

```ts
type DesiredOutcome = {
  mode: 'explore'          // 뭐가 있는지 일단 훑고 싶다
      | 'answer'           // 정해진 질문에 답을 얻고 싶다
      | 'validate'         // 내 가설이 맞는지 확인하고 싶다
      | 'report'           // 보고서·발표에 쓸 결과물이 필요하다
      | 'diagnose'         // 이상한 것·문제를 찾고 싶다
      | 'prep_modeling'    // 예측 모델을 만들기 전 준비
  deliverable: string | null     // 자유 서술: "학과 회의용 슬라이드 3장"
  breadth: 'wide' | 'focused'    // 여러 각도를 얕게 vs 한 주제를 깊게
  rigor: 'descriptive'           // 보여주기만 하면 됨
       | 'inferential'           // 통계적 검정·신뢰구간까지 필요
  desiredCount: number | null    // 추천 개수 희망값
}
```

#### mode → 추천 전략 매핑 (`/api/recommend` 프롬프트가 분기하는 지점)

| mode | 추천 개수 | 성격 | 반드시 포함 |
|---|---|---|---|
| `explore` | 6~8개 | 서로 다른 `method.family`로 **다양하게**, 각각 얕게 | 데이터 개요, 주요 분포, 눈에 띄는 관계 |
| `answer` | 2~4개 | `goal`의 질문에 **직접** 답하는 것만. 곁가지 금지 | 답 + 그 답을 반증할 수 있는 대안 관점 1개 |
| `validate` | 3~5개 | `hypotheses` 각각에 대응. 검정 방법 명시 | 가설을 **지지하는** 근거와 **반박하는** 근거 양쪽 |
| `report` | 3~5개 | 완성도 우선. 차트 품질·레이블·해석 문장까지 | 핵심 메시지 1장 + 근거 차트, 해석 캡션 |
| `diagnose` | 4~6개 | 이상치·결측 패턴·불일치·급변 지점 | `qualityFlags`를 근거로 한 항목 최소 2개 |
| `prep_modeling` | 4~6개 | 타깃 분포, 특징-타깃 관계, 다중공선성, 누수 위험 | 데이터 누수(leakage) 의심 컬럼 경고 |

`rigor: 'inferential'`이면 모든 추천의 `caveats`에 표본 크기·가정 위반·다중비교 문제를 명시하고,
`method.steps`에 검정 절차를 넣는다. `'descriptive'`면 검정을 권하지 않는다 — 불필요한 통계 용어는 부담만 준다.

`breadth: 'focused'`면 `method.family`가 겹쳐도 되지만 **같은 주제를 여러 각도로** 파고, `'wide'`면
`family`가 서로 달라야 한다 (같은 종류 차트만 6개 나오는 걸 방지).

#### 어떻게 묻는가
**첫 턴에 `goal`과 함께 묻되, 자유 서술만 강요하지 않는다.** "어떤 결과를 원하세요?"라고만 하면
대부분 "그냥 좀 봐줘"로 끝난다. 대화 입력창 위에 **빠른 선택 칩**을 띄운다.

```
이 데이터로 무엇을 하고 싶으신가요?
[ 일단 훑어보기 ]  [ 특정 질문에 답 ]  [ 가설 확인 ]
[ 보고서용 결과물 ]  [ 문제점 찾기 ]  [ 모델링 준비 ]
        ...또는 자유롭게 적어주세요
```

칩은 `mode`만 채운다. 나머지(`deliverable`, `breadth`, `rigor`)는 대화 중 `update_context` 툴이
자연스럽게 채우거나, 비어 있으면 `mode`별 기본값을 쓴다 — **추가 질문으로 사용자를 붙잡지 않는다.**

| mode | breadth 기본 | rigor 기본 |
|---|---|---|
| `explore`, `diagnose` | `wide` | `descriptive` |
| `answer`, `report` | `focused` | `descriptive` |
| `validate` | `focused` | `inferential` |
| `prep_modeling` | `wide` | `descriptive` |

#### confidence 판정에 반영
`desiredOutcome.mode`가 비어 있으면 `confidence`는 `low`를 넘지 못한다.
`mode` 하나만 정해져도 쓸 만한 추천이 나오므로, **맥락 수집의 최소 요구치는 `goal` + `mode` 둘뿐이다.**
