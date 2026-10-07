/**
 * npm run create -- "My Video Topic" [--format 16:9|9:16|1:1|...] [--theme documentary]
 * Scaffolds projects/<slug>/ from templates/project.
 */
import fs from 'node:fs';
import path from 'node:path';
import {resolveFormat} from '../src/config/formats';
import {parseArgs, projectDir, rel, ROOT} from './lib/project';

const args = parseArgs();
const title = args.positional.join(' ').trim();
if (!title) {
  console.error('Usage: npm run create -- "My Video Topic" [--format 16:9] [--theme documentary]');
  process.exit(2);
}
const format = args.str('format') ?? '16:9';
resolveFormat(format); // fail fast on an invalid format
const theme = args.str('theme') ?? 'documentary';

const slug = title
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/[\s_]+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 60);
const dir = projectDir(slug);
if (fs.existsSync(dir)) {
  console.error(`Project already exists: ${rel(dir)}`);
  process.exit(1);
}

const template = path.join(ROOT, 'templates', 'project');
const vars: Record<string, string> = {
  '{{ID}}': slug,
  '{{TITLE}}': title,
  '{{FORMAT}}': format,
  '{{THEME}}': theme,
  '{{DATE}}': new Date().toISOString().slice(0, 10),
};

function copy(src: string, dst: string) {
  fs.mkdirSync(dst, {recursive: true});
  for (const e of fs.readdirSync(src, {withFileTypes: true})) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copy(s, d);
    else {
      let text = fs.readFileSync(s, 'utf8');
      for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
      fs.writeFileSync(d, text);
    }
  }
}
copy(template, dir);
for (const sub of ['assets', 'audio', 'broll', 'graphics', 'previews', 'output']) {
  fs.mkdirSync(path.join(dir, sub), {recursive: true});
}

console.log(`Created ${rel(dir)}  (${format}, ${theme})`);
console.log(`Next: edit brief.md, then  npm run dev -- --project ${slug}`);
