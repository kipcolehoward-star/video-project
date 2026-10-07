#!/usr/bin/env node
/**
 * Blocks commits that contain secrets. Runs as the git pre-commit hook
 * (installed by `npm run hooks:install`) or manually: `npm run secrets:check`.
 *
 * Checks every staged file for:
 *  - values of keys in .env and of secret-looking environment variables
 *    (e.g. EPIDEMIC_SOUND_API_KEY), and
 *  - known key formats (Epidemic, ElevenLabs, GitHub, AWS, Slack, private keys).
 * Prints file names and the kind of match only — never the secret itself.
 */
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {encoding: 'utf8'})
  .split('\0')
  .filter(Boolean);

const values = [];
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i);
    if (m && m[2].length >= 12 && !line.trim().startsWith('#')) values.push([m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]);
  }
}
for (const [k, v] of Object.entries(process.env)) {
  if (/(KEY|TOKEN|SECRET|PASSWORD)/i.test(k) && v && v.length >= 12) values.push([k, v]);
}

const patterns = [
  ['Epidemic Sound key', /epidemic_(live|test)_[A-Za-z0-9]{10,}/],
  ['ElevenLabs/Stripe-style key', /\bsk_[A-Za-z0-9]{20,}/],
  ['GitHub token', /\bgh[opsu]_[A-Za-z0-9]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abpr]-[A-Za-z0-9-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const problems = [];
for (const f of staged) {
  let text;
  try {
    text = fs.readFileSync(f, 'latin1');
  } catch {
    continue;
  }
  for (const [name, v] of values) if (text.includes(v)) problems.push(`${f}: contains the value of ${name}`);
  for (const [kind, re] of patterns) if (re.test(text)) problems.push(`${f}: looks like a ${kind}`);
}

if (problems.length) {
  console.error('\n✋ Commit blocked — possible secrets in staged files:\n  ' + problems.join('\n  '));
  console.error('\nRemove them (git restore --staged <file>) or move them to .env (gitignored).\n');
  process.exit(1);
}
console.log(`secrets check: ${staged.length} staged file(s) clean`);
