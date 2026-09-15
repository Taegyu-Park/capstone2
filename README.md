# 데일리 뉴스 다이제스트

매일 아침 7시(KST), 전날 국내외 주요 뉴스의 **헤드라인과 1~2문장 요약**을 분야별로 모아 GitHub Pages에 자동 발행합니다.

### 🔗 [taegyu-park.github.io/capstone2](https://taegyu-park.github.io/capstone2/)

- **분야**: IT·과학·AI / 경제·금융 / 정치·사회 / 세계·국제 / 사설·칼럼
- **분량**: 분야당 최대 10건 (하루 50건 안팎)
- **아카이브**: 날짜별 페이지를 계속 보관합니다

사설·칼럼은 사실 보도가 아니라 특정 입장을 주장하는 글이라 다른 분야와 다르게 다룹니다.
요약은 "무엇이 있었다"가 아니라 "누가 무엇을 주장했다"를 담고, 필자가 있으면 카드에 함께 표시합니다.

## 동작 방식

```
① fetch.mjs      RSS 35개 수집 → 전날(KST) 필터 → 중복 제거 → 분야별 10건 선별
② summarize.mjs  Claude로 한국어 요약 생성 (실패 시 RSS 원문으로 폴백)
③ render.mjs     data/ 전체를 읽어 site/ 정적 사이트를 통째로 재생성
④ Actions        data/ 커밋 후 GitHub Pages 배포
```

`data/YYYY-MM-DD.json`이 **진실의 원천**입니다. Pages 배포는 항상 사이트 전체를 교체하므로,
렌더 단계가 매번 `data/` 전부를 다시 읽어야 아카이브가 보존됩니다.
덕분에 디자인을 바꾸면 과거 페이지도 함께 갱신되고, 몇 번을 다시 실행해도 결과가 같습니다.

## 로컬 실행

```bash
npm install
npm run build                      # 전날치 생성
node scripts/build.mjs --date=2026-09-13   # 특정 날짜 다시 생성
npm run check-feeds                # 피드 상태 점검
npm run deploy                     # GitHub Pages 즉시 재배포 (deploy_only)
```

생성된 사이트는 `site/`에 있습니다. `npx serve site` 등으로 열어보면 됩니다.

개별 단계도 따로 실행할 수 있습니다.

```bash
npm run fetch      # 수집만
npm run summarize  # 요약만 (data/에 해당 날짜 파일이 있어야 합니다)
npm run render     # 렌더만
```

## 인증

요약 단계는 Claude Code CLI를 헤드리스로 호출합니다. 인증은 두 가지 중 하나입니다.

- **로컬**: `claude` 로그인 상태를 그대로 사용합니다. 별도 설정이 없습니다.
- **GitHub Actions**: `CLAUDE_CODE_OAUTH_TOKEN` 시크릿을 읽습니다.

토큰은 `claude setup-token`으로 발급하며 **유효기간이 1년**입니다.
Pro·Max·Team·Enterprise 구독에서 발급할 수 있고, 사용량은 API 요금이 아니라
발급한 사람의 구독 할당량에서 차감됩니다.

```bash
claude setup-token                          # 출력된 토큰 복사
gh secret set CLAUDE_CODE_OAUTH_TOKEN       # 붙여넣기
```

토큰이 만료되면 매일 아침 워크플로가 인증 오류로 실패합니다. GitHub이 실패 알림을 보내니
그때 위 두 명령을 다시 실행하면 됩니다.

## 설정

`config/digest.json` 한 곳에서 관리합니다.

| 키 | 설명 |
|---|---|
| `categories` | 분야 목록과 화면에 표시할 이름 |
| `categories[].opinion` | `true`면 사설·칼럼 취급: 요약 프롬프트가 논조 중심으로 바뀌고, `exclude.bracketTags`(`[사설]` 등) 검사를 건너뜁니다 |
| `categories[].summaryMaxChars` | 그 분야만 쓸 요약 길이 상한(생략 시 `summarize.maxChars`) |
| `feeds` | RSS 목록. `category`로 분야가 고정 결정됩니다 |
| `limits.perCategory` | 분야당 최대 기사 수 |
| `limits.titleSimilarityThreshold` | 제목 유사도 중복 판정 기준 (0~1) |
| `exclude` | 부고·인사 등 공지성 기사 제외 규칙 |
| `summarize.model` | 요약 모델. 품질이 아쉬우면 `claude-sonnet-5`로 올리세요 |

### 사설·칼럼(opinion) 카테고리를 다른 분야에도 적용하려면

`categories`에 `"opinion": true`만 추가하면 됩니다. 그러면 그 카테고리는:
- `[사설]`, `[칼럼]`, `[기고]` 같은 대괄호 태그가 있어도 걸러지지 않고
- 요약이 "~라고 주장했다" 식으로 논조를 살려 쓰이며
- RSS의 `dc:creator`(필자)가 있으면 카드에 표시됩니다

### 피드 추가·교체

`feeds`에 항목을 넣고 `npm run check-feeds`로 확인합니다. 피드를 채택하기 전에 볼 것:

- **`전체` 건수** — 너무 적으면 라운드로빈에서 거의 뽑히지 않습니다
- **`요약40자+`** — 이 값이 낮으면 요약 품질이 나빠집니다. RSS `description`이
  비어 있거나 썸네일 HTML만 들어 있는 피드가 실제로 있습니다
- **`최신`** — 전날 날짜가 찍혀야 합니다. 날짜 필드가 아예 없는 피드는 쓸 수 없습니다

## 알려진 한계

- **수집 기준은 "RSS에 그날 올라온 기사"입니다.** 늦게 색인되는 기사는 빠집니다.
- **매체가 다른 같은 사건은 중복 제거되지 않습니다.** 제목 유사도로 판정하므로
  같은 매체의 `속보 → 종합` 재발행은 잡아내지만, 서로 다른 매체가 전혀 다른 문장으로
  쓴 같은 사건은 두 건으로 남습니다.
- **분야는 피드 단위로 고정됩니다.** 종합 성격의 피드에서 다른 분야 기사가 섞여 올 수 있습니다.
- **요약은 RSS `description`만 보고 만듭니다.** 본문은 크롤링하지 않습니다(저작권·robots).
  원문 설명이 부실한 매체는 요약도 얕아집니다.
- **발행 시각은 7시 정각이 아닙니다.** GitHub cron은 혼잡 시 5~15분 지연됩니다.
- **사설·칼럼은 매체별 발행량 편차가 큽니다.** 경향신문은 하루 10건 이상이지만 Guardian Opinion·
  Washington Post는 하루 3~5건 수준이라, 분야당 9건이 채워지지 않는 날도 있습니다.
