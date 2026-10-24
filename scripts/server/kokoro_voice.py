#!/usr/bin/env python3
"""Voice-over with Kokoro-82M (Apache 2.0, open weights, runs locally on CPU).

Locked voice design (user, 2026-10-24): voice am_liam, speed 0.90, one clip per storyboard scene,
each clip's edge silence trimmed and the clips joined with a 0.18 s gap (about 0.3 s heard between
scenes, a little shorter than Kokoro's own 0.37-0.42 s pause between sentences, which is kept).
Tested on the Diomede and Everest scripts; whisper heard every word, numbers and names included.

Why per scene: one long Kokoro read starts rushing and running words together after about 8 s
(the Diomede script took 23.4 s in one read, 31.4 s per scene). Why the trim: untrimmed clips left
0.9 s gaps at every scene join. Sentence-by-sentence reads with added gaps sounded choppy (rejected).

Run on the render server with the kokoro venv (Python 3.12; see CLAUDE.md "Kokoro voice"):
  ~/.venvs/kokoro/bin/python scripts/server/kokoro_voice.py <storyboard.json> <out-dir> [--voice am_liam]
      [--speed 0.90] [--gap 0.18] [--joined name.wav]

Writes <out-dir>/<scene-id>.wav (24 kHz mono, trimmed) and, with --joined, the whole read joined with
the gap. Pronunciation overrides {shown|spoken} are voiced as the spoken part; *keyword* marks are dropped.
The first run downloads the model and voice from Hugging Face (hexgrad/Kokoro-82M, about 330 MB).
"""
import argparse
import json
import os
import re
import time

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SR = 24000


def spoken(narration: str) -> str:
    return re.sub(r"\{[^|}]*\|([^}]*)\}", r"\1", narration).replace("*", "")


def trim(a: np.ndarray) -> np.ndarray:
    # Cut Kokoro's leading/trailing silence, keeping 20 ms before the first sound and 60 ms after the last (word tails).
    loud = np.where(np.abs(a) > 0.003)[0]
    return a[max(0, loud[0] - int(0.02 * SR)): loud[-1] + int(0.06 * SR)] if len(loud) else a


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard")
    ap.add_argument("out_dir")
    ap.add_argument("--voice", default="am_liam")
    ap.add_argument("--speed", type=float, default=0.90)
    ap.add_argument("--gap", type=float, default=0.18, help="silence between scene clips in --joined (seconds)")
    ap.add_argument("--joined", help="also write the whole read as one file (name inside out-dir)")
    args = ap.parse_args()

    scenes = [s for s in json.load(open(args.storyboard, encoding="utf-8"))["scenes"] if s.get("narration")]
    os.makedirs(args.out_dir, exist_ok=True)
    # Voice names start with the language: a = American English, b = British English (Kokoro VOICES.md).
    pipe = KPipeline(lang_code=args.voice[0], repo_id="hexgrad/Kokoro-82M")
    joined = []
    for s in scenes:
        t0 = time.time()
        text = spoken(s["narration"])
        audio = trim(np.concatenate([r.audio.numpy() for r in pipe(text, voice=args.voice, speed=args.speed)]))
        sf.write(os.path.join(args.out_dir, f"{s['id']}.wav"), audio, SR)
        joined += [audio, np.zeros(int(args.gap * SR), dtype=audio.dtype)]
        print(f"{s['id']}: {len(audio) / SR:.1f}s audio in {time.time() - t0:.1f}s", flush=True)
    if args.joined:
        whole = np.concatenate(joined[:-1])
        sf.write(os.path.join(args.out_dir, args.joined), whole, SR)
        print(f"{args.joined}: {len(whole) / SR:.1f}s", flush=True)


if __name__ == "__main__":
    main()
