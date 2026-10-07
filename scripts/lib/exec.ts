import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ROOT} from './project';

const isWin = process.platform === 'win32';

/** Runs a binary from node_modules/.bin with inherited stdio. */
export function runBin(bin: string, args: string[]): number {
  const exe = path.join(ROOT, 'node_modules', '.bin', isWin ? `${bin}.cmd` : bin);
  // .cmd shims need a shell on Windows; quote args containing spaces.
  const quoted = isWin ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
  const r = spawnSync(isWin ? `"${exe}"` : exe, quoted, {cwd: ROOT, stdio: 'inherit', shell: isWin});
  return r.status ?? 1;
}

/** Runs a system tool (ffmpeg/ffprobe) and captures output. */
export function capture(cmd: string, args: string[]): {code: number; stdout: string; stderr: string} {
  const r = spawnSync(cmd, args, {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.error) return {code: 127, stdout: '', stderr: String(r.error.message)};
  return {code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? ''};
}

export function hasTool(cmd: string): boolean {
  return capture(cmd, ['-version']).code === 0;
}
