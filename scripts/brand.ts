/**
 * npm run brand
 * Renders the channel logo and banner (src/compositions/Brand.tsx) into
 * channel/ as PNG + JPG, plus 98 px / 176 px avatar previews to check legibility.
 */
import fs from 'node:fs';
import path from 'node:path';
import {capture} from './lib/exec';
import {ROOT, rel} from './lib/project';
import {bundleProject, closeBrowser, renderCompositionStill} from './lib/remotion';

const out = path.join(ROOT, 'channel');
fs.mkdirSync(path.join(out, 'previews'), {recursive: true});
const serveUrl = await bundleProject(out, JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'generated', 'studio-props.json'), 'utf8')));
for (const [id, name] of [['BrandLogo', 'logo'], ['BrandBanner', 'banner']] as const) {
  const png = await renderCompositionStill({serveUrl, id, output: path.join(out, `${name}.png`)});
  capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', png, '-q:v', '2', png.replace(/\.png$/, '.jpg')]);
  console.log(`  ${name}: ${rel(png)} (${(fs.statSync(png).size / 1024).toFixed(0)} KB)`);
}
await closeBrowser();
// How the logo reads at YouTube's real sizes (circle-cropped by YouTube).
for (const s of [98, 176]) {
  capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(out, 'logo.png'), '-vf', `scale=${s}:${s}`, path.join(out, 'previews', `logo-${s}.png`)]);
}
// Banner with YouTube's safe areas drawn: TV (full), desktop (2560x423), all devices (1546x423).
capture('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(out, 'banner.png'), '-vf',
  'drawbox=x=0:y=508:w=2560:h=423:color=yellow@0.8:t=4,drawbox=x=507:y=508:w=1546:h=423:color=cyan@0.9:t=4', path.join(out, 'previews', 'banner-safe-areas.png')]);
console.log(`  previews: ${rel(path.join(out, 'previews'))}`);
process.exit(0);
