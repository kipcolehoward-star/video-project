/**
 * Caption data: script parsing, script↔whisper alignment, paging, SRT/VTT.
 * Pure functions — shared by the Remotion overlay and the Node exporters so
 * burned-in captions and uploaded subtitle files always match.
 */
import type {Storyboard, TimedWord, Transcript} from '../config/project';
import {narrationStarts} from '../config/project';

// ---------------------------------------------------------------------------
// Script text
// ---------------------------------------------------------------------------

export interface ScriptToken {
  /** What captions show. */
  text: string;
  emphasis: boolean;
  /** What the voice says, when it differs: `{999|nine-nine-nine}`. */
  spoken?: string;
}

const OVERRIDE = /^(.*)\{([^|{}]+)\|([^{}]+)\}(.*)$/;

/**
 * Narration markup:
 *   *word*             emphasis (educational captions)
 *   {shown|spoken}     pronunciation override — captions show "shown", the
 *                      voice reads "spoken" (use hyphens, no spaces), e.g.
 *                      {999|nine-nine-nine} so TTS doesn't say "nine hundred…".
 */
export function parseNarration(narration: string): ScriptToken[] {
  const tokens: ScriptToken[] = [];
  let inEmphasis = false;
  for (const raw of narration.split(/\s+/).filter(Boolean)) {
    const opens = raw.startsWith('*');
    const closes = raw.replace(/[.,!?;:"')\]]+$/, '').endsWith('*');
    if (opens) inEmphasis = true;
    const clean = raw.replace(/\*/g, '');
    const m = clean.match(OVERRIDE);
    tokens.push(
      m ? {text: `${m[1]}${m[2]}${m[4]}`, spoken: `${m[1]}${m[3]}${m[4]}`, emphasis: inEmphasis} : {text: clean, emphasis: inEmphasis},
    );
    if (closes) inEmphasis = false;
  }
  return tokens.filter((t) => t.text.length > 0);
}

/** What the TTS engine should read: markup removed, overrides applied. */
export const spokenText = (narration: string) =>
  parseNarration(narration)
    .map((t) => t.spoken ?? t.text)
    .join(' ');

export const normWord = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '');
const norm = normWord;

/**
 * Finds a cue word in a list of words. "second" = first occurrence,
 * "second#2" = second occurrence. Returns the index or -1.
 */
export function findCue(words: {text: string}[], cue: string): number {
  const [raw, nth] = cue.split('#');
  const target = normWord(raw);
  let seen = 0;
  for (let i = 0; i < words.length; i++) {
    if (normWord(words[i].text) === target && ++seen === (Number(nth) || 1)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Alignment: script words get whisper's timing; whisper's text is discarded.
// ---------------------------------------------------------------------------

export interface RecognizedWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Levenshtein alignment over normalised words. Matches and substitutions
 * take the recognised word's timing (whisper often mis-hears a word but
 * still times it correctly). Script words whisper skipped are interpolated
 * between their neighbours; extra recognised words are dropped.
 */
export function alignScript(script: ScriptToken[], rec: RecognizedWord[], audioDuration: number): TimedWord[] {
  if (!script.some((t) => t.spoken)) return alignTokens(script, rec, audioDuration);
  // Expand overrides into the words actually spoken, align those, then give each
  // display token the span of its spoken words.
  const expanded: ScriptToken[] = [];
  const owner: number[] = [];
  script.forEach((t, i) => {
    const parts = t.spoken ? t.spoken.split(/[\s-]+/).filter(Boolean) : [t.text];
    for (const part of parts) {
      expanded.push({text: part, emphasis: t.emphasis});
      owner.push(i);
    }
  });
  const timed = alignTokens(expanded, rec, audioDuration);
  return script.map((t, i) => {
    const mine = timed.filter((_, k) => owner[k] === i);
    return {text: t.text, emphasis: t.emphasis || undefined, start: mine[0].start, end: mine[mine.length - 1].end, matched: mine.every((w) => w.matched)};
  });
}

function alignTokens(script: ScriptToken[], rec: RecognizedWord[], audioDuration: number): TimedWord[] {
  const a = script.map((t) => norm(t.text));
  const b = rec.map((r) => norm(r.word));
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({length: n + 1}, (_, i) => Array.from({length: m + 1}, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  // Backtrace: script index -> recognised index (or -1).
  const map = new Array<number>(n).fill(-1);
  const exact = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    if (dp[i][j] === dp[i - 1][j - 1] + cost) {
      map[i - 1] = j - 1;
      exact[i - 1] = cost === 0;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + 1) i--;
    else j--;
  }

  const out: TimedWord[] = script.map((t, k) => {
    const r = map[k] >= 0 ? rec[map[k]] : null;
    return {text: t.text, emphasis: t.emphasis || undefined, start: r?.start ?? NaN, end: r?.end ?? NaN, matched: r ? exact[k] : false};
  });

  // Re-time runs of inexact words together. Whisper often merges or splits
  // words ("nineteen twenty" -> "1920"), so the run shares the span its
  // recognised counterparts cover, split by word length. Words whisper
  // skipped entirely extend to the neighbouring exact words.
  for (let k = 0; k < out.length; k++) {
    if (out[k].matched) continue;
    let e = k;
    while (e < out.length && !out[e].matched) e++;
    const left = k > 0 ? out[k - 1].end : 0;
    const right = e < out.length ? out[e].start : audioDuration;
    const start = Number.isNaN(out[k].start) ? left : out[k].start;
    const end = Number.isNaN(out[e - 1].end) ? right : out[e - 1].end;
    const weights = out.slice(k, e).map((w) => Math.max(2, norm(w.text).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = start;
    for (let q = k; q < e; q++) {
      const d = (Math.max(0, end - start) * weights[q - k]) / total;
      out[q].start = t;
      out[q].end = t + d;
      t += d;
    }
    k = e - 1;
  }
  // Monotonic, non-overlapping, and no zero-length words (borrow from the following gap).
  for (let k = 0; k < out.length; k++) {
    if (k > 0 && out[k].start < out[k - 1].end) out[k].start = out[k - 1].end;
    const next = k + 1 < out.length ? out[k + 1].start : audioDuration;
    if (out[k].end - out[k].start < 0.08) out[k].end = Math.max(out[k].start, Math.min(out[k].start + 0.12, next));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Global timeline
// ---------------------------------------------------------------------------

export interface GlobalWord extends TimedWord {
  sceneId: string;
}

/** All caption words with absolute times (seconds) on the final timeline. */
export function globalWords(storyboard: Storyboard, transcript: Transcript | null, fps: number): GlobalWord[] {
  if (!transcript) return [];
  const starts = narrationStarts(storyboard, fps);
  return storyboard.scenes.flatMap((s) => {
    const t = transcript.scenes[s.id];
    if (!t) return [];
    const base = starts[s.id];
    return t.words.map((w) => ({...w, sceneId: s.id, start: base + w.start, end: base + w.end}));
  });
}

// ---------------------------------------------------------------------------
// Pages: what is on screen at once
// ---------------------------------------------------------------------------

export interface CaptionPage {
  start: number;
  end: number;
  lines: GlobalWord[][];
}

export interface PagingOptions {
  maxCharsPerLine: number;
  maxLines: number;
  /** Hard cap on words per page (kinetic styles use 1–3). */
  maxWords?: number;
  /** Break the page at a pause longer than this (s). */
  pauseBreak: number;
  /** Keep a page up at least this long, if the next one allows (s). */
  minDuration: number;
  /** Hold the last page this long after its final word (s). */
  hold: number;
}

const len = (ws: GlobalWord[]) => ws.reduce((n, w) => n + w.text.length, 0) + Math.max(0, ws.length - 1);

/**
 * Splits words into readable pages. Lines are filled greedily (never over
 * maxCharsPerLine), then two-line pages are rebalanced. Pages break at scene
 * changes, pauses, sentence ends and size limits.
 */
export function buildPages(words: GlobalWord[], o: PagingOptions): CaptionPage[] {
  const pages: GlobalWord[][][] = [];
  let lines: GlobalWord[][] = [];
  const count = () => lines.reduce((n, l) => n + l.length, 0);
  const flush = () => {
    if (lines.length) pages.push(lines);
    lines = [];
  };

  for (const w of words) {
    const lastLine = lines[lines.length - 1];
    const prev = lastLine?.[lastLine.length - 1];
    if (prev) {
      const pageLen = lines.reduce((n, l) => n + len(l), 0);
      const brk =
        w.sceneId !== prev.sceneId ||
        w.start - prev.end > o.pauseBreak ||
        (o.maxWords !== undefined && count() >= o.maxWords) ||
        (/[.!?]["')\]]?$/.test(prev.text) && pageLen >= Math.min(20, o.maxCharsPerLine * 0.5));
      if (brk) flush();
    }
    const line = lines[lines.length - 1];
    if (line && len([...line, w]) <= o.maxCharsPerLine) line.push(w);
    else if (lines.length < o.maxLines) lines.push([w]);
    else {
      // Page is full. Prefer breaking at the last clause boundary; failing
      // that, never split a number phrase ("about three hundred | metres").
      // The unfinished part is carried to the next page with this word.
      const flat = lines.flat();
      const fits = (k: number) => rewrap([...flat.slice(k), w], o.maxCharsPerLine).length <= o.maxLines;
      let cut = -1;
      for (let k = flat.length - 1; k >= 2; k--) {
        if (/[,.;:!?]["')\]]?$/.test(flat[k - 1].text) && fits(k)) {
          cut = k;
          break;
        }
      }
      if (cut < 0 && (isNumberWord(w) || isNumberWord(flat[flat.length - 1]))) {
        let k = flat.length;
        while (k > 1 && isNumberWord(flat[k - 1])) k--;
        if (k > 1 && QUALIFIERS.has(normWord(flat[k - 1].text))) k--;
        if (k < flat.length && k >= 2 && fits(k)) cut = k;
      }
      const carry = cut > 0 ? flat.slice(cut) : [];
      if (carry.length) lines = rewrap(flat.slice(0, cut), o.maxCharsPerLine);
      flush();
      lines = rewrap([...carry, w], o.maxCharsPerLine);
    }
  }
  flush();

  return pages.map((ls, i) => {
    const ws = ls.flat();
    const next = pages[i + 1]?.[0][0];
    const start = ws[0].start;
    const natural = ws[ws.length - 1].end;
    const limit = next ? next.start : natural + o.hold;
    const end = Math.min(limit, Math.max(natural + (next ? 0.15 : o.hold), start + o.minDuration));
    return {start, end, lines: ls.length === 2 ? rebalance(ls, o.maxCharsPerLine) : ls};
  });
}

/** Greedy line fill. */
function rewrap(ws: GlobalWord[], maxChars: number): GlobalWord[][] {
  const out: GlobalWord[][] = [];
  for (const w of ws) {
    const l = out[out.length - 1];
    if (l && len([...l, w]) <= maxChars) l.push(w);
    else out.push([w]);
  }
  return out;
}

const NUMBER_WORDS = new Set(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion hundredths thousandths'.split(' '),
);
const QUALIFIERS = new Set('about roughly around nearly almost just over under some'.split(' '));
const isNumberWord = (w: GlobalWord) => NUMBER_WORDS.has(normWord(w.text)) || /^[\d.,]+$/.test(w.text);

/** Balances two lines (greedy fill leaves a long first line); prefers breaks after punctuation, never inside a number. */
function rebalance(ls: GlobalWord[][], maxChars: number): GlobalWord[][] {
  const ws = ls.flat();
  let best = ls[0].length;
  let bestScore = Math.abs(len(ls[0]) - len(ls[1]));
  for (let k = 1; k < ws.length; k++) {
    const l1 = len(ws.slice(0, k));
    const l2 = len(ws.slice(k));
    if (l1 > maxChars || l2 > maxChars) continue;
    const splitsNumber = isNumberWord(ws[k - 1]) && isNumberWord(ws[k]);
    const score = Math.abs(l1 - l2) - (/[,;:]$/.test(ws[k - 1].text) ? 6 : 0) + (splitsNumber ? 100 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return [ws.slice(0, best), ws.slice(best)];
}

// ---------------------------------------------------------------------------
// Subtitle files
// ---------------------------------------------------------------------------

const ts = (s: number, sep: ',' | '.') => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}${sep}${pad(ms % 1000, 3)}`;
};

const lineText = (l: GlobalWord[]) => l.map((w) => w.text).join(' ');

export function toSrt(pages: CaptionPage[]): string {
  return pages.map((p, i) => `${i + 1}\n${ts(p.start, ',')} --> ${ts(p.end, ',')}\n${p.lines.map(lineText).join('\n')}\n`).join('\n');
}

export function toVtt(pages: CaptionPage[]): string {
  return `WEBVTT\n\n${pages.map((p) => `${ts(p.start, '.')} --> ${ts(p.end, '.')}\n${p.lines.map(lineText).join('\n')}\n`).join('\n')}`;
}

/** Paging used for uploaded subtitle files (platform players render them). */
export const SUBTITLE_FILE_PAGING: PagingOptions = {maxCharsPerLine: 42, maxLines: 2, pauseBreak: 0.6, minDuration: 1.0, hold: 0.8};
