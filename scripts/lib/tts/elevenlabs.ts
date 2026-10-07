/**
 * ElevenLabs TTS (paid service, approved by the user 2026-10-06).
 * Uses /with-timestamps so every character comes back with its start/end
 * time — captions are timed from the voice engine itself.
 *
 * Licence: free plan = non-commercial + "elevenlabs.io" credit in the title;
 * paid plans include commercial rights. See CLAUDE.md.
 */
import type {RecognizedWord} from '../../../src/captions/words';
import {requireEnv} from '../env';

const API = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsOptions {
  voiceId: string;
  modelId: string;
  voiceSettings?: {stability?: number; similarity_boost?: number; style?: number; use_speaker_boost?: boolean; speed?: number};
  /** Neighbouring narration, for natural prosody across separately generated clips. */
  previousText?: string;
  nextText?: string;
  seed?: number;
}

const key = () => requireEnv('ELEVENLABS_API_KEY', 'Needed for audio.provider = "elevenlabs" (https://elevenlabs.io → Profile → API keys).');

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {...init, headers: {'xi-api-key': key(), 'Content-Type': 'application/json', ...(init.headers ?? {})}});
  if (!res.ok) {
    // Error bodies never contain the key. Surface ElevenLabs' own explanation.
    const body = await res.text();
    let detail = body.slice(0, 300);
    try {
      const j = JSON.parse(body) as {detail?: {code?: string; message?: string} | string};
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail?.message) detail = `${j.detail.code ?? ''}: ${j.detail.message}`;
    } catch {
      /* not JSON */
    }
    throw new Error(`ElevenLabs HTTP ${res.status} (${init.method ?? 'GET'} ${path.split('?')[0]}): ${detail}`);
  }
  return res;
}

export interface Synthesis {
  mp3: Buffer;
  /** Words with times (s), built from the character alignment. */
  words: RecognizedWord[];
  characters: number;
}

export async function synthesize(text: string, o: ElevenLabsOptions): Promise<Synthesis> {
  const body: Record<string, unknown> = {text, model_id: o.modelId};
  if (o.voiceSettings) body.voice_settings = o.voiceSettings;
  if (o.previousText) body.previous_text = o.previousText;
  if (o.nextText) body.next_text = o.nextText;
  if (o.seed !== undefined) body.seed = o.seed;
  const res = await call(`/text-to-speech/${encodeURIComponent(o.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: {characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[]};
  };
  const a = data.alignment;
  const words: RecognizedWord[] = [];
  if (a) {
    let cur: RecognizedWord | null = null;
    a.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) {
        cur = null;
        return;
      }
      if (!cur) {
        cur = {word: '', start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i]};
        words.push(cur);
      }
      cur.word += ch;
      cur.end = a.character_end_times_seconds[i];
    });
  }
  return {mp3: Buffer.from(data.audio_base64, 'base64'), words, characters: text.length};
}

export async function listVoices(): Promise<{voice_id: string; name: string; category?: string; labels?: Record<string, string>}[]> {
  const res = await call('/voices');
  const data = (await res.json()) as {voices: {voice_id: string; name: string; category?: string; labels?: Record<string, string>}[]};
  return data.voices;
}

export interface Subscription {
  tier: string;
  character_count: number;
  character_limit: number;
  next_character_count_reset_unix?: number;
}

/** Quota info, or null when the (restricted) key lacks the user_read permission. */
export async function subscription(): Promise<Subscription | null> {
  try {
    const res = await call('/user/subscription');
    return (await res.json()) as Subscription;
  } catch (e) {
    if (/missing_permissions|user_read/.test((e as Error).message)) return null;
    throw e;
  }
}

/** Details of one voice (needs voices_read), or null if not permitted. */
export async function getVoice(voiceId: string): Promise<{voice_id: string; name: string; category?: string; labels?: Record<string, string>} | null> {
  try {
    const res = await call(`/voices/${encodeURIComponent(voiceId)}`);
    return (await res.json()) as {voice_id: string; name: string; category?: string; labels?: Record<string, string>};
  } catch (e) {
    if (/missing_permissions|voices_read/.test((e as Error).message)) return null;
    throw e;
  }
}
