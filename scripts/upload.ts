/**
 * npm run upload -- --login
 *   Sign in to YouTube once (browser) and show which channel the login belongs to.
 * npm run upload -- --project <id> [--dry-run] [--again]
 *   Upload the project's final MP4 with projects/<id>/youtube.json (title, description, tags, categoryId, privacy,
 *   madeForKids, publishAt?, thumbnail?), the credits file appended to the description and the SRT captions.
 *   Writes output/<id>-youtube.json and refuses a second upload unless --again.
 * npm run upload -- --file <mp4> --title "<title>" [--privacy private]
 *   A bare upload (tests), no captions or credits.
 *
 * Only run after the user has approved this specific video for upload. See lib/youtube.ts for auth and limits.
 */
import fs from 'node:fs';
import path from 'node:path';
import {loadProject, parseArgs, pickProject, rel} from './lib/project';
import {accessToken, myChannel, setThumbnail, uploadCaptions, uploadVideo, videoStatus, type VideoMeta} from './lib/youtube';

const args = parseArgs();

async function main() {
  if (args.bool('login')) {
    const token = await accessToken(true);
    const ch = await myChannel(token);
    console.log(ch ? `Signed in to channel "${ch.snippet.title}" (${ch.snippet.customUrl ?? ch.id}).` : 'Signed in, but this account has no YouTube channel.');
    return;
  }

  let file: string;
  let meta: VideoMeta;
  let captions: string | null = null;
  let thumbnail: string | null = null;
  let record: string | null = null;
  if (args.str('file')) {
    file = path.resolve(args.str('file')!);
    meta = {title: args.str('title') ?? path.basename(file), description: 'Upload test from the video pipeline.', tags: ['test'], categoryId: '27', privacy: (args.str('privacy') as VideoMeta['privacy']) ?? 'private', madeForKids: false};
  } else {
    const p = loadProject(pickProject(args.str('project')));
    const out = path.join(p.dir, 'output');
    const cfgFile = path.join(p.dir, 'youtube.json');
    if (!fs.existsSync(cfgFile)) throw new Error(`${rel(cfgFile)} is missing (title, description, tags, categoryId, privacy, madeForKids).`);
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) as Partial<VideoMeta> & {thumbnail?: string};
    const finals = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.mp4') && f.startsWith(`${p.id}_`)) : [];
    if (finals.length !== 1) throw new Error(`Expected one final MP4 in ${rel(out)}, found ${finals.length}: ${finals.join(', ') || 'none'}`);
    file = path.join(out, finals[0]);
    record = path.join(out, `${p.id}-youtube.json`);
    if (fs.existsSync(record) && !args.bool('again')) throw new Error(`Already uploaded (${rel(record)}). Use --again to upload another copy.`);
    // The credits file (npm run credits) goes under the description; its first line is a heading for humans.
    const creditsFile = path.join(out, `${p.id}-credits.txt`);
    const credits = fs.existsSync(creditsFile) ? fs.readFileSync(creditsFile, 'utf8').split('\n').slice(1).join('\n').trim() : '';
    meta = {
      title: cfg.title ?? p.config.title,
      description: [cfg.description ?? '', credits ? `Credits\n${credits}` : ''].filter(Boolean).join('\n\n'),
      tags: cfg.tags ?? [],
      categoryId: cfg.categoryId ?? '27',
      privacy: cfg.privacy ?? 'private',
      madeForKids: cfg.madeForKids ?? false,
      publishAt: cfg.publishAt,
    };
    const srt = path.join(out, `${p.id}.srt`);
    captions = fs.existsSync(srt) ? srt : null;
    thumbnail = cfg.thumbnail ? path.join(p.dir, cfg.thumbnail) : null;
    if (thumbnail && !fs.existsSync(thumbnail)) throw new Error(`Thumbnail ${rel(thumbnail)} not found.`);
  }

  // YouTube's own limits, checked before anything is sent.
  const problems: string[] = [];
  if (!meta.title || meta.title.length > 100) problems.push(`title must be 1–100 characters (got ${meta.title.length})`);
  if (/[<>]/.test(meta.title + meta.description)) problems.push('title and description may not contain < or >');
  if (Buffer.byteLength(meta.description) > 5000) problems.push(`description is ${Buffer.byteLength(meta.description)} bytes (limit 5000)`);
  if (meta.tags.join(',').length > 500) problems.push('tags add up to more than 500 characters');
  if (thumbnail && fs.statSync(thumbnail).size > 2 * 1024 * 1024) problems.push('thumbnail is over 2 MB');
  if (problems.length) throw new Error(`Not uploading:\n  ${problems.join('\n  ')}`);

  console.log(`File:     ${rel(file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
  console.log(`Title:    ${meta.title}`);
  console.log(`Privacy:  ${meta.privacy}${meta.publishAt ? `, publishes ${meta.publishAt}` : ''}; made for kids: ${meta.madeForKids}`);
  console.log(`Tags:     ${meta.tags.join(', ') || '(none)'}; category ${meta.categoryId}`);
  console.log(`Captions: ${captions ? rel(captions) : 'none'}; thumbnail: ${thumbnail ? rel(thumbnail) : 'none'}`);
  console.log(`Description:\n${meta.description.replace(/^/gm, '  ')}\n`);
  if (args.bool('dry-run')) return console.log('Dry run: nothing uploaded.');

  const token = await accessToken();
  const ch = await myChannel(token);
  console.log(`Uploading to "${ch?.snippet.title ?? 'unknown channel'}"…`);
  const id = await uploadVideo(token, file, meta);
  console.log(`Uploaded: https://youtu.be/${id}`);
  if (captions) {
    await uploadCaptions(token, id, captions);
    console.log('Captions added.');
  }
  if (thumbnail) {
    try {
      await setThumbnail(token, id, thumbnail);
      console.log('Thumbnail set.');
    } catch (e) {
      console.log(`Thumbnail not set (custom thumbnails need a phone-verified channel): ${(e as Error).message}`);
    }
  }
  const status = await videoStatus(token, id);
  console.log(`Status: ${JSON.stringify(status)}`);
  if (meta.privacy !== 'private' && status?.privacyStatus === 'private') console.log('YouTube kept it private: the API project has not passed the YouTube API audit yet, and such a lock cannot be lifted for this video. Upload it in YouTube Studio instead.');
  if (record) fs.writeFileSync(record, JSON.stringify({videoId: id, url: `https://youtu.be/${id}`, uploaded: new Date().toISOString(), channel: ch?.snippet.title, file: rel(file), status}, null, 2) + '\n');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(`error: ${(e as Error).message}`);
    process.exit(1);
  },
);
