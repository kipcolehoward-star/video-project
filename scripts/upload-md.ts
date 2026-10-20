/**
 * npm run upload:md -- [--project <id>]
 * Writes output/<id>-upload.md: everything for a YouTube upload in one place (title, 4 tags, category, made for kids,
 * description with the sources and all credits, and the files to attach: final MP4, SRT, VTT). Built from
 * projects/<id>/youtube.json and output/<id>-credits.txt (npm run credits), the same data `npm run upload` sends.
 * User rule (2026-10-20): every finished Short gets this file plus its SRT and VTT.
 */
import fs from 'node:fs';
import path from 'node:path';
import {loadProject, parseArgs, pickProject, rel} from './lib/project';

const CATEGORIES: Record<string, string> = {'1': 'Film & Animation', '19': 'Travel & Events', '22': 'People & Blogs', '24': 'Entertainment', '25': 'News & Politics', '27': 'Education', '28': 'Science & Technology'};

const p = loadProject(pickProject(parseArgs().str('project')));
const out = path.join(p.dir, 'output');
const cfgFile = path.join(p.dir, 'youtube.json');
if (!fs.existsSync(cfgFile)) throw new Error(`${rel(cfgFile)} is missing (title, description, tags, categoryId, privacy, madeForKids).`);
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) as {title: string; description: string; tags: string[]; categoryId?: string; madeForKids?: boolean};
const creditsFile = path.join(out, `${p.id}-credits.txt`);
if (!fs.existsSync(creditsFile)) throw new Error(`${rel(creditsFile)} is missing — run npm run credits -- --project ${p.id}`);
const credits = fs.readFileSync(creditsFile, 'utf8').split('\n').slice(1).join('\n').trim();
const description = `${cfg.description.trim()}\n\nCredits\n${credits}`;

const problems: string[] = [];
if (!cfg.title || cfg.title.length > 100) problems.push(`title must be 1–100 characters (got ${cfg.title?.length ?? 0})`);
if (cfg.tags?.length !== 4) problems.push(`give exactly 4 tags (got ${cfg.tags?.length ?? 0})`);
if (/[<>]/.test(cfg.title + description)) problems.push('title and description may not contain < or >');
if (Buffer.byteLength(description) > 5000) problems.push(`description is ${Buffer.byteLength(description)} bytes (YouTube's limit is 5000)`);
const finals = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.mp4') && f.startsWith(`${p.id}_`)) : [];
if (finals.length !== 1) problems.push(`expected one final MP4 in ${rel(out)}, found ${finals.length}`);
const srt = path.join(out, `${p.id}.srt`);
const vtt = path.join(out, `${p.id}.vtt`);
for (const f of [srt, vtt]) if (!fs.existsSync(f)) problems.push(`${rel(f)} is missing — run npm run captions -- --project ${p.id}`);
if (problems.length) throw new Error(`Cannot write the upload sheet:\n  ${problems.join('\n  ')}`);

const md = `# Upload: ${cfg.title}

## Files
- Video: \`${rel(path.join(out, finals[0]))}\`
- Subtitles (English): \`${rel(srt)}\` (YouTube) and \`${rel(vtt)}\` (web players)

## Title
\`\`\`
${cfg.title}
\`\`\`

## Tags
\`\`\`
${cfg.tags.join(', ')}
\`\`\`

## Settings
- Category: ${CATEGORIES[cfg.categoryId ?? '27'] ?? cfg.categoryId}
- Made for kids: ${cfg.madeForKids ? 'Yes' : 'No'}

## Description
\`\`\`
${description}
\`\`\`
`;
const target = path.join(out, `${p.id}-upload.md`);
fs.writeFileSync(target, md);
console.log(`wrote ${rel(target)} (description ${Buffer.byteLength(description)} bytes)`);
process.exit(0);
