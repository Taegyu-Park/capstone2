# 데일리 뉴스 다이제스트

매일 아침 전날 뉴스를 분야별로 모아 GitHub Pages에 발행하는 정적 사이트 생성기입니다.
프로젝트 개요와 운영 방법은 README.md에 있습니다. 여기에는 코드를 고칠 때 필요한 것만 적습니다.

## 구조

- `config/digest.json` — 유일한 설정 파일. 분야·피드·제외규칙·요약설정이 모두 여기 있습니다.
- `scripts/fetch.mjs` → `summarize.mjs` → `render.mjs`, `build.mjs`가 셋을 순서대로 실행합니다.
- `scripts/lib/` — `kst`(날짜), `rss`(수집·정규화), `select`(중복제거·선별), `exclude`(공지성 기사),
  `claude`(CLI 호출), `html`(템플릿).
- `data/YYYY-MM-DD.json` — 커밋되는 산출물이자 진실의 원천. `site/`는 gitignore됩니다.

## 지켜야 할 것

- **날짜 경계는 전부 KST입니다.** 직접 `new Date()` 산술을 쓰지 말고 `lib/kst.mjs`를 쓰세요.
  KST 자정을 UTC로 변환하면 전날이 되므로 요일 계산에서 실제로 한 번 틀렸습니다.
- **`render.mjs`는 `data/` 전체를 매번 다시 읽어 `site/`를 통째로 생성합니다.**
  Pages 배포가 사이트 전체를 교체하기 때문입니다. 증분 생성으로 바꾸면 아카이브가 사라집니다.
- **요약 실패는 발행을 막지 않습니다.** `summarize.mjs`는 분야별로 재시도하고 끝내 실패하면
  RSS 원문으로 폴백합니다. `build.mjs`도 요약 단계 실패를 치명적으로 취급하지 않습니다.
  이 폴백 경로를 없애지 마세요.
- **피드 하나가 죽어도 전체가 죽지 않습니다.** `fetchFeed`는 예외를 던지지 않고 결과에 담습니다.
  전체 피드가 실패할 때만 중단합니다.
- **제목과 요약은 전부 외부 입력입니다.** 템플릿에서 `esc()`를 거치지 않고 쓰지 마세요.
- **`--bare` 모드는 `CLAUDE_CODE_OAUTH_TOKEN`을 읽지 않습니다.** CLI 호출에 붙이면 CI에서 인증이 깨집니다.
- **`categories[].opinion: true`는 두 곳에 동시에 영향을 줍니다.** `fetch.mjs`가 그 카테고리 기사에는
  `exclude.bracketTags` 검사를 건너뛰고(`[사설]`이 콘텐츠 자체이므로), `summarize.mjs`가 사실 요약
  대신 논조를 살린 프롬프트를 씁니다. 둘 중 하나만 고치면 다른 쪽과 어긋납니다.

## 설정을 고칠 때

제외 규칙은 정규식이 아니라 구조화된 목록(`bracketTags`/`titleContains`/`titleStartsWith`)입니다.
JSON에 정규식을 넣으면 이스케이프 때문에 조용히 깨지므로 이 형태를 유지하세요.

## 확인 방법

```bash
npm run check-feeds                        # 피드 28개 상태 (실패 시 exit 1)
node scripts/build.mjs --date=YYYY-MM-DD   # 특정 날짜로 전체 파이프라인
```

`check-feeds`는 `전체`/`요약40자+`/`최신` 세 숫자를 봅니다. 피드를 추가할 때 판단 기준은 README에 있습니다.
