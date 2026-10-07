/**
 * Minimal .env loader (no dependency). Values are never logged.
 * Real environment variables take precedence over .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './project';

let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function env(name: string): string | undefined {
  load();
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function requireEnv(name: string, hint: string): string {
  const v = env(name);
  if (!v) throw new Error(`${name} is not set. ${hint}\nAdd it to ${path.join(ROOT, '.env')} as ${name}=...`);
  return v;
}
