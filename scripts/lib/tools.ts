/**
 * Local speech toolchain. Everything lives in tools/ (gitignored) and is
 * reproducible with `npm run setup:tools`. This file is the single record of
 * versions, URLs and licences.
 */
import path from 'node:path';
import {ROOT} from './project';

export const TOOLS_DIR = path.join(ROOT, 'tools');

export interface Download {
  id: string;
  url: string;
  /** Destination relative to tools/. Zips are extracted into `extractTo`. */
  dest: string;
  extractTo?: string;
  license: string;
}

const PIPER_VOICES = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US';

export const DOWNLOADS: Download[] = [
  {
    id: 'whisper.cpp b5454 (CPU x64)',
    url: 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',
    dest: 'downloads/whisper-bin-x64.zip',
    extractTo: 'whisper',
    license: 'MIT',
  },
  {
    id: 'whisper model base.en',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    dest: 'models/ggml-base.en.bin',
    license: 'MIT (OpenAI Whisper weights)',
  },
  {
    id: 'piper 2023.11.14-2 (Windows x64)',
    url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    dest: 'downloads/piper_windows_amd64.zip',
    extractTo: '.',
    license: 'MIT',
  },
  ...['joe', 'libritts_r'].flatMap((v) => {
    const name = `en_US-${v}-medium`;
    const license = v === 'joe' ? 'CC0 (dataset)' : 'CC BY 4.0 (LibriTTS-R) — credit required';
    return [
      {id: `voice ${name}`, url: `${PIPER_VOICES}/${v}/medium/${name}.onnx`, dest: `piper/voices/${name}.onnx`, license},
      {id: `voice ${name} config`, url: `${PIPER_VOICES}/${v}/medium/${name}.onnx.json`, dest: `piper/voices/${name}.onnx.json`, license},
      {id: `voice ${name} card`, url: `${PIPER_VOICES}/${v}/medium/MODEL_CARD`, dest: `piper/voices/${name}.MODEL_CARD.md`, license},
    ];
  }),
];

const exe = process.platform === 'win32' ? '.exe' : '';

export const TOOL_PATHS = {
  whisperCli: path.join(TOOLS_DIR, 'whisper', 'Release', `whisper-cli${exe}`),
  whisperModel: (name = 'base.en') => path.join(TOOLS_DIR, 'models', `ggml-${name}.bin`),
  piper: path.join(TOOLS_DIR, 'piper', `piper${exe}`),
  piperVoice: (name = 'en_US-joe-medium') => path.join(TOOLS_DIR, 'piper', 'voices', `${name}.onnx`),
};

/** Voices cleared for commercial use, with the attribution each requires. */
export const VOICES: Record<string, {license: string; attribution: string | null; note?: string}> = {
  'en_US-joe-medium': {license: 'CC0', attribution: null},
  'en_US-libritts_r-medium': {
    license: 'CC BY 4.0',
    attribution: 'Voice: Piper en_US-libritts_r, trained on LibriTTS-R (CC BY 4.0).',
    note: 'Multi-speaker (904 speakers); pick one with --speaker <id>.',
  },
};
