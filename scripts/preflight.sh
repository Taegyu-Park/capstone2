#!/usr/bin/env bash
# Claude CLI가 CI에서 인증·실행되는지 확인합니다. 요약 단계가 실패할 때 원인을 좁히는 용도입니다.
# 토큰 값 자체는 절대 출력하지 않습니다. 길이만 봅니다.
set -u

token_len=${#CLAUDE_CODE_OAUTH_TOKEN}
echo "버전         : $(claude --version 2>&1)"
if [ "$token_len" -eq 0 ]; then
  echo "토큰         : 없음 — CLAUDE_CODE_OAUTH_TOKEN 시크릿이 비어 있습니다."
elif [ "$token_len" -lt 40 ]; then
  echo "토큰         : 길이 ${token_len} — 너무 짧습니다. 붙여넣기가 잘렸을 가능성이 큽니다."
else
  echo "토큰         : 길이 ${token_len} (정상 범위)"
fi
echo "HOME         : ${HOME}"
echo "작업 디렉터리 : $(pwd)"
echo

echo "--- 최소 호출 ---"
set +e
printf '%s' '"확인"이라는 두 글자만 출력하세요.' \
  | claude -p --output-format json --max-turns 1 --allowed-tools "" --system-prompt "지시대로만 출력합니다." \
    >preflight.out 2>preflight.err
code=$?
set -e

echo "종료 코드: ${code}"
echo "--- stdout (앞 2000자) ---"
head -c 2000 preflight.out || true
echo
echo "--- stderr (앞 2000자) ---"
head -c 2000 preflight.err || true
echo
rm -f preflight.out preflight.err
exit 0
