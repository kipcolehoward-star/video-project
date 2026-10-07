/**
 * npm run setup:tools
 * Downloads whisper.cpp, Piper, voices and the Whisper model into tools/.
 * Idempotent: existing files are skipped. No system-wide changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {capture} from './lib/exec';
import {DOWNLOADS, TOOLS_DIR} from './lib/tools';

for (const d of DOWNLOADS) {
  const dest = path.join(TOOLS_DIR, d.dest);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`  skip  ${d.id}`);
  } else {
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    process.stdout.write(`  get   ${d.id} … `);
    const r = capture('curl', ['-sSLf', '-o', `${dest}.part`, d.url]);
    if (r.code !== 0) {
      console.log('FAILED');
      console.error(r.stderr);
      process.exit(1);
    }
    fs.renameSync(`${dest}.part`, dest);
    console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
  }
  if (d.extractTo) {
    const target = path.join(TOOLS_DIR, d.extractTo);
    const marker = path.join(TOOLS_DIR, 'downloads', `${path.basename(d.dest)}.extracted`);
    if (fs.existsSync(marker)) continue;
    fs.mkdirSync(target, {recursive: true});
    // Windows 10+ ships bsdtar (extracts zips). Call it by full path: Git Bash's
    // GNU tar may shadow it on PATH and misreads "C:" as a remote host.
    const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    const r = capture(tar, ['-xf', dest, '-C', target]);
    if (r.code !== 0) {
      console.error(`extract failed for ${d.dest}: ${r.stderr}`);
      process.exit(1);
    }
    fs.writeFileSync(marker, new Date().toISOString());
    console.log(`  unzip ${d.dest} -> tools/${d.extractTo}`);
  }
}
console.log('\nDone. Verify with: npm run tools:check');
