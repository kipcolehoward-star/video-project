/**
 * Thin wrapper over Remotion's Node API. A project is bundled once; every
 * format / still is then rendered from that bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition, type CancelSignal, type ChromiumOptions} from '@remotion/renderer';
import type {MainProps} from '../../src/config/project';
import {ROOT} from './project';
import {ensureGeoData} from './geodata';
import type {LoadedProject} from './project';

/** Defaults sized for a 2-core / 4 GB machine. */
export const RENDER_DEFAULTS = {
  /** Page setup / per-frame timeout. Remotion's 30 s default is too tight on this 4 GB machine. */
  timeoutMs: 120_000,
  /** Parallel browser tabs. RENDER_CONCURRENCY overrides it (the render server sets 3). */
  concurrency: Number(process.env.RENDER_CONCURRENCY) || 2,
  crf: 18,
  previewCrf: 28,
  previewScale: 0.5,
  jpegQuality: 90,
  previewJpegQuality: 70,
};

type Browser = Awaited<ReturnType<typeof openBrowser>>;
let browser: Browser | null = null;

type Gl = NonNullable<ChromiumOptions['gl']>;
/**
 * WebGL backend for headless Chrome, or null for Chrome's default. Only
 * projects with a glmap scene (MapLibre) switch it on, so every other render
 * runs exactly as before. Windows uses the GPU (angle); Linux defaults to
 * software rendering (swangle) because the render server has no GPU.
 * RENDER_GL overrides the choice.
 */
let gl: Gl | null = null;
function setWebGl(on: boolean) {
  const next = on ? ((process.env.RENDER_GL as Gl | undefined) ?? (process.platform === 'win32' ? 'angle' : 'swangle')) : null;
  if (next !== gl && browser) void closeBrowser();
  gl = next;
}

/**
 * One shared headless Chrome for the whole run. Launching a fresh browser per
 * still/render fails intermittently on a 4 GB machine.
 */
async function getBrowser(): Promise<Browser> {
  // Chrome can take >25 s to start when the machine is busy (e.g. antivirus
  // scanning new media), which Remotion treats as fatal. Retry before giving up.
  for (let attempt = 1; !browser; attempt++) {
    try {
      browser = await openBrowser('chrome', gl ? {chromiumOptions: {gl}} : undefined);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`\n  browser start failed (attempt ${attempt}/3): ${(e as Error).message.split('\n')[0]} — retrying`);
    }
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) await browser.close({silent: true});
  browser = null;
}

/** Root.tsx imports Studio default props at bundle time; make sure the file exists. */
function ensureStudioProps(props: MainProps) {
  const file = path.join(ROOT, 'src', 'generated', 'studio-props.json');
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(props, null, 2));
}

export async function bundleProject(projectDir: string, props: MainProps, project?: LoadedProject): Promise<string> {
  ensureStudioProps(props);
  if (project) ensureGeoData(project);
  setWebGl(props.storyboard.scenes.some((s) => s.type === 'glmap'));
  process.stdout.write('Bundling… ');
  const t = Date.now();
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, 'src', 'index.ts'),
    // The project folder is the public dir, so staticFile('assets/x.png') is per project.
    publicDir: projectDir,
  });
  console.log(`done in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return serveUrl;
}

const progressLine = (label: string) => {
  let last = -1;
  return (p: number) => {
    const pct = Math.floor(p * 100);
    if (pct !== last) {
      last = pct;
      process.stdout.write(`\r${label} ${String(pct).padStart(3)}%`);
    }
  };
};

export async function renderVideo(opts: {
  serveUrl: string;
  props: MainProps;
  output: string;
  preview?: boolean;
  /** Preview size as a fraction of full resolution (default 0.5). */
  scale?: number;
  concurrency?: number;
  /** Inclusive [first, last] frames, to render only part of the timeline. */
  frameRange?: [number, number];
  /** No audio track (chunks: the master mix is muxed in when they are joined). */
  muted?: boolean;
  cancelSignal?: CancelSignal;
  /** Called with 0–1 progress (in addition to the console progress line). */
  onProgress?: (progress: number) => void;
}) {
  const puppeteerInstance = await getBrowser();
  const composition = await selectComposition({serveUrl: opts.serveUrl, id: 'Main', inputProps: opts.props, puppeteerInstance, timeoutInMilliseconds: RENDER_DEFAULTS.timeoutMs});
  const onP = progressLine(`Rendering ${path.basename(opts.output)}`);
  const t = Date.now();
  await renderMedia({
    serveUrl: opts.serveUrl,
    composition,
    inputProps: opts.props,
    puppeteerInstance,
    timeoutInMilliseconds: RENDER_DEFAULTS.timeoutMs,
    codec: 'h264',
    outputLocation: opts.output,
    concurrency: opts.concurrency ?? RENDER_DEFAULTS.concurrency,
    crf: opts.preview ? RENDER_DEFAULTS.previewCrf : RENDER_DEFAULTS.crf,
    scale: opts.preview ? (opts.scale ?? RENDER_DEFAULTS.previewScale) : 1,
    pixelFormat: 'yuv420p',
    // Standard TV-range BT.709. Without it, JPEG frames produce full-range yuvj420p, which players and platforms interpret inconsistently.
    colorSpace: 'bt709',
    imageFormat: 'jpeg',
    jpegQuality: opts.preview ? RENDER_DEFAULTS.previewJpegQuality : RENDER_DEFAULTS.jpegQuality,
    // Previews trade encode efficiency for speed; finals use the default (medium) preset.
    ...(opts.preview ? {x264Preset: 'veryfast' as const} : {}),
    ...(opts.frameRange ? {frameRange: opts.frameRange} : {}),
    ...(opts.muted ? {muted: true} : {}),
    ...(opts.cancelSignal ? {cancelSignal: opts.cancelSignal} : {}),
    overwrite: true,
    onProgress: ({progress}) => {
      onP(progress);
      opts.onProgress?.(progress);
    },
  });
  const secs = (Date.now() - t) / 1000;
  const frames = opts.frameRange ? opts.frameRange[1] - opts.frameRange[0] + 1 : composition.durationInFrames;
  console.log(`\r  rendered ${frames} frames in ${secs.toFixed(1)}s (${(frames / secs).toFixed(1)} fps)`);
  return composition;
}

export async function renderStills(opts: {serveUrl: string; props: MainProps; frames: number[]; outputFor: (frame: number) => string; scale?: number}) {
  const puppeteerInstance = await getBrowser();
  const composition = await selectComposition({serveUrl: opts.serveUrl, id: 'Main', inputProps: opts.props, puppeteerInstance, timeoutInMilliseconds: RENDER_DEFAULTS.timeoutMs});
  const files: string[] = [];
  for (const frame of opts.frames) {
    const output = opts.outputFor(frame);
    await renderStill({
      serveUrl: opts.serveUrl,
      composition,
      inputProps: opts.props,
      puppeteerInstance,
      timeoutInMilliseconds: RENDER_DEFAULTS.timeoutMs,
      frame: Math.min(frame, composition.durationInFrames - 1),
      output,
      imageFormat: 'png',
      scale: opts.scale ?? 1,
      overwrite: true,
    });
    files.push(output);
  }
  return files;
}

/** Renders frame 0 of a fixed-size composition (e.g. BrandLogo) to a PNG. */
export async function renderCompositionStill(opts: {serveUrl: string; id: string; output: string}) {
  const puppeteerInstance = await getBrowser();
  const composition = await selectComposition({serveUrl: opts.serveUrl, id: opts.id, inputProps: {}, puppeteerInstance, timeoutInMilliseconds: RENDER_DEFAULTS.timeoutMs});
  await renderStill({serveUrl: opts.serveUrl, composition, inputProps: {}, puppeteerInstance, timeoutInMilliseconds: RENDER_DEFAULTS.timeoutMs, frame: 0, output: opts.output, imageFormat: 'png', overwrite: true});
  return opts.output;
}
