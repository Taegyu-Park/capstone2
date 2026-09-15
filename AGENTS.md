# 프로젝트 작업 규칙

## 프로젝트 업데이트 시 Notion 기록

코드베이스, 설정(`config/digest.json`), 파이프라인(`scripts/`) 등의 변경이나 기능 업데이트를 진행한 경우, 완료 후 반드시 아래 노션 페이지에 업데이트 사항을 기록해야 합니다.

- **노션 페이지 URL**: https://app.notion.com/p/62_PR1-AI-agent-3d63f91806e280e88a69cfd133acda74?source=copy_link
- **Page ID**: `3d63f918-06e2-80e8-8a69-cfd133acda74`
- **도구**: `notion-personal` MCP (`API-update-page-markdown`)
- **규칙 세부 내용**: [.agents/rules/notion-update.md](file:///c:/Users/taegyu/Codes/capstone2/.agents/rules/notion-update.md) 참조 (날짜가 오래된 순 정렬, 토글 형식)

## 다이제스트 갱신 및 배포 시 품질 점검

뉴스 다이제스트를 갱신하거나 배포하기 전, 반드시 아래 항목을 점검해야 합니다.

1. **파이프라인 순서 준수**: `fetch.mjs` 실행 직후에는 `summary`가 `null`이므로, 반드시 `summarize.mjs`가 완료되어 한국어 요약이 채워진 것을 확인한 뒤 `render.mjs`를 실행해야 합니다.
2. **해외 기사 한국어 번역·요약 검증**: `region: "intl"`인 기사의 제목(`title`)과 요약(`summary`)이 영어 원문 그대로 남아있지 않고 한국어로 번역·요약되었는지 확인합니다 (`summarySource === "llm"`).
3. **링크/메타데이터 전용 노출 방지**: Hacker News처럼 본문 없이 URL, 댓글 수, 포인트("Article URL:", "Comments URL:" 등)만 있는 내용이 요약란에 그대로 노출되지 않았는지 확인합니다.

## 변경사항 적용 후 자동 커밋, 푸시 및 재배포

코드, 설정, 데이터 파일의 수정이나 갱신 작업을 완료한 뒤에는 반드시 아래 단계를 거쳐 원격 반영과 배포까지 마무리해야 합니다.

1. **Git Commit & Push**:
   - 변경 파일들을 스테이징(`git add`)하고 명확한 커밋 메시지를 작성하여 `git push`를 실행합니다.
2. **GitHub Pages 재배포 실행**:
   - `npm run deploy` (또는 `gh workflow run daily-digest.yml -f deploy_only=true`) 명령어로 배포 워크플로(`deploy_only`)를 즉시 트리거합니다.
   - `gh run list --workflow=daily-digest.yml -L 1` 등으로 워크플로가 정상 접수되었는지 확인합니다.
