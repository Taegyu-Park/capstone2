import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';

/**
 * PATH에서 claude 실행 파일을 찾습니다.
 * Windows에서는 spawn이 PATHEXT를 붙여주지 않으므로 확장자까지 직접 해석해야 하고,
 * 그래야 shell:true 없이 실행할 수 있습니다(셸 주입 표면 제거).
 */
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, 'claude' + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error('claude 실행 파일을 PATH에서 찾지 못했습니다. CLAUDE_BIN 환경변수로 경로를 지정하세요.');
}

let cachedBin = null;

/**
 * Claude Code CLI를 헤드리스로 호출해 응답 텍스트를 돌려줍니다.
 * 인증은 CLAUDE_CODE_OAUTH_TOKEN 환경변수(로컬에서는 기존 로그인)를 그대로 씁니다.
 * --bare 모드는 OAuth 토큰을 읽지 않으므로 절대 쓰지 않습니다.
 */
export function runClaude(prompt, { model, systemPrompt, timeoutMs = 180000 } = {}) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--max-turns', '1',
    '--allowed-tools', '',
    '--no-session-persistence',
  ];
  if (model) args.push('--model', model);
  if (systemPrompt) args.push('--system-prompt', systemPrompt);

  return new Promise((resolve, reject) => {
    cachedBin ??= resolveClaudeBin();
    const child = spawn(cachedBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude 호출 타임아웃(${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`claude 실행 실패: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`claude 종료 코드 ${code}: ${stderr.slice(0, 300)}`));
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return reject(new Error(`claude 출력을 JSON으로 읽지 못했습니다: ${stdout.slice(0, 200)}`));
      }
      if (parsed.is_error) {
        return reject(new Error(`claude 오류(${parsed.subtype}): ${String(parsed.result).slice(0, 200)}`));
      }
      resolve({ text: String(parsed.result ?? ''), usage: parsed.usage });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * 모델 응답에서 JSON 배열을 추출합니다.
 * 코드펜스나 앞뒤 설명이 붙어도 첫 '['부터 마지막 ']'까지를 잘라 파싱합니다.
 */
export function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('응답에서 JSON 배열을 찾지 못했습니다');
  }
  const parsed = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('JSON 배열이 아닙니다');
  return parsed;
}
