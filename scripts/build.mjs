// fetch → summarize → render를 순서대로 실행합니다.
// 요약 단계가 통째로 실패해도 렌더는 진행합니다. 그날의 발행을 거르지 않기 위해서입니다.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDateStr, yesterdayKst } from './lib/kst.mjs';

const dateArg = process.argv.slice(2).find((a) => a.startsWith('--date='))?.slice(7);
const date = assertDateStr(dateArg || yesterdayKst());

function run(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), `--date=${date}`], {
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

console.log(`[build] 대상일 ${date}(KST)`);

const fetchCode = await run('fetch.mjs');
if (fetchCode !== 0) {
  console.error('[build] 수집 단계 실패. 요약할 기사가 없으므로 중단합니다.');
  process.exit(fetchCode);
}

const summarizeCode = await run('summarize.mjs');
if (summarizeCode !== 0) {
  console.warn('[build] 요약 단계 실패. RSS 원문으로 발행을 계속합니다.');
}

const renderCode = await run('render.mjs');
if (renderCode !== 0) {
  console.error('[build] 렌더 단계 실패.');
  process.exit(renderCode);
}

console.log(`[build] 완료 · ${date}`);
