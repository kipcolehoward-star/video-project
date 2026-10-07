/**
 * npm run narrate -- [--project <id>] [--force]
 * Full audio pass: voiceover -> transcribe -> subtitle files -> mix.
 * Each step skips work whose inputs have not changed.
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {ROOT} from './lib/project';

const passthrough = process.argv.slice(2);
for (const step of ['voiceover', 'transcribe', 'captions', 'audio']) {
  console.log(`\n=== ${step}`);
  const args = step === 'captions' ? passthrough.filter((a) => a !== '--force') : passthrough;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(ROOT, 'scripts', `${step}.ts`), ...args], {stdio: 'inherit', cwd: ROOT});
  if (r.status !== 0) process.exit(r.status ?? 1);
}
