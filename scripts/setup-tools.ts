/**
 * npm run setup:tools
 * Downloads whisper.cpp, Piper, voices and the Whisper model into tools/.
 * Idempotent: existing files are skipped. No system-wide changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {capture} from './lib/exec';
import {DOWNLOADS, TOOLS_DIR} from './lib/tools';

// The upstream Piper voice corpus was regenerated on 2026-11-09 with
// multi-codepoint IPA entries. The pinned 2023 Piper CLI cannot parse those.
// If a previous run downloaded an incompatible current config, remove both
// voice/model pairs so this run fetches the pinned compatible versions.
const joeConfig = path.join(TOOLS_DIR, 'piper', 'voices', 'en_US-joe-medium.onnx.json');
if (fs.existsSync(joeConfig)) {
  try {
    const config = JSON.parse(fs.readFileSync(joeConfig, 'utf8'));
    const hasMultiCodepointPhoneme = Object.keys(config.phoneme_id_map ?? {})
      .some((phoneme) => Array.from(phoneme).length !== 1);
    if (hasMultiCodepointPhoneme) {
      console.log('  refresh Piper voices: current upstream phoneme map is incompatible with Piper 2023');
      for (const voice of ['en_US-joe-medium', 'en_US-libritts_r-medium']) {
        for (const suffix of ['.onnx', '.onnx.json', '.MODEL_CARD.md']) {
          fs.rmSync(path.join(TOOLS_DIR, 'piper', 'voices', voice + suffix), {force: true});
        }
      }
    }
  } catch (error) {
    throw new Error(`Could not validate existing Piper voice config: ${(error as Error).message}`);
  }
}

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

if (process.platform !== 'win32') {
  const source = path.join(TOOLS_DIR, 'whisper-src');
  const binary = path.join(TOOLS_DIR, 'whisper', 'Release', 'whisper-cli');
  if (fs.existsSync(binary)) {
    console.log('  skip  whisper.cpp Linux binary');
  } else {
    if (!fs.existsSync(path.join(source, '.git'))) {
      fs.mkdirSync(TOOLS_DIR, {recursive: true});
      console.log('  get   whisper.cpp source (pinned b5454)');
      const clone = capture('git', ['clone', '--depth', '1', '--branch', 'b5454', 'https://github.com/ggml-org/whisper.cpp.git', source]);
      if (clone.code !== 0) {
        console.error(clone.stderr);
        process.exit(1);
      }
    }
    const build = path.join(source, 'build');
    console.log('  build whisper.cpp (CPU, release)');
    const configure = capture('cmake', ['-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release']);
    if (configure.code !== 0) {
      console.error(configure.stderr);
      process.exit(1);
    }
    const compile = capture('cmake', ['--build', build, '--config', 'Release', '-j', '3']);
    if (compile.code !== 0) {
      console.error(compile.stderr);
      process.exit(1);
    }
    const built = path.join(build, 'bin', 'whisper-cli');
    if (!fs.existsSync(built)) {
      console.error(`whisper.cpp build completed without expected binary: ${built}`);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(binary), {recursive: true});
    fs.copyFileSync(built, binary);
    fs.chmodSync(binary, 0o755);
    console.log(`  built ${binary}`);
  }
}
console.log('\nDone. Verify with: npm run tools:check');
