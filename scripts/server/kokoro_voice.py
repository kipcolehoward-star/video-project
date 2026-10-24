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
  ... kokoro_voice.py --stdin <out-dir>   (npm run voiceover: reads {"voice", "speed", "scenes": [{"id", "text"}]})

Writes <out-dir>/<scene-id>.wav (24 kHz mono, trimmed) and <scene-id>.timing.json (Kokoro's own word timings,
shifted to the trimmed clip) and, with --joined, the whole read joined with the gap. From a storyboard,
pronunciation overrides {shown|spoken} are voiced as the spoken part and *keyword* marks are dropped.
The first run downloads the model and voice from Hugging Face (hexgrad/Kokoro-82M, about 330 MB).
"""
import argparse
import json
import os
import re
import sys
import time

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SR = 24000


def spoken(narration: str) -> str:
    return re.sub(r"\{[^|}]*\|([^}]*)\}", r"\1", narration).replace("*", "")


def voice_scene(pipe: KPipeline, text: str, voice: str, speed: float) -> tuple[np.ndarray, list[dict]]:
    """One clip for one scene, edge silence trimmed, with word timings (seconds into the trimmed clip)."""
    chunks, words, offset = [], [], 0.0
    for r in pipe(text, voice=voice, speed=speed):
        audio = r.audio.numpy()
        for t in r.tokens or []:
            # Punctuation tokens carry the pause after a word; captions only need the words.
            if t.start_ts is not None and t.end_ts is not None and re.search(r"\w", t.text):
                words.append({"word": t.text, "start": offset + t.start_ts, "end": offset + t.end_ts})
        chunks.append(audio)
        offset += len(audio) / SR
    a = np.concatenate(chunks)
    # Cut Kokoro's leading/trailing silence, keeping 20 ms before the first sound and 60 ms after the last (word tails).
    loud = np.where(np.abs(a) > 0.003)[0]
    if not len(loud):
        return a, words
    start, end = max(0, loud[0] - int(0.02 * SR)), loud[-1] + int(0.06 * SR)
    a, cut, dur = a[start:end], start / SR, (end - start) / SR
    clamp = lambda x: round(min(max(x - cut, 0.0), dur), 3)
    return a, [{**w, "start": clamp(w["start"]), "end": clamp(w["end"])} for w in words]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard", nargs="?")
    ap.add_argument("out_dir")
    ap.add_argument("--stdin", action="store_true", help='read {"voice", "speed", "scenes": [{"id", "text"}]} from stdin')
    ap.add_argument("--voice", default="am_liam")
    ap.add_argument("--speed", type=float, default=0.90)
    ap.add_argument("--gap", type=float, default=0.18, help="silence between scene clips in --joined (seconds)")
    ap.add_argument("--joined", help="also write the whole read as one file (name inside out-dir)")
    args = ap.parse_args()

    if args.stdin:
        job = json.load(sys.stdin)
        voice, speed, scenes = job.get("voice", args.voice), float(job.get("speed", args.speed)), job["scenes"]
    else:
        voice, speed = args.voice, args.speed
        board = json.load(open(args.storyboard, encoding="utf-8"))["scenes"]
        scenes = [{"id": s["id"], "text": spoken(s["narration"])} for s in board if s.get("narration")]
    os.makedirs(args.out_dir, exist_ok=True)
    # Voice names start with the language: a = American English, b = British English (Kokoro VOICES.md).
    pipe = KPipeline(lang_code=voice[0], repo_id="hexgrad/Kokoro-82M")
    joined = []
    for s in scenes:
        t0 = time.time()
        audio, words = voice_scene(pipe, s["text"], voice, speed)
        sf.write(os.path.join(args.out_dir, f"{s['id']}.wav"), audio, SR)
        with open(os.path.join(args.out_dir, f"{s['id']}.timing.json"), "w", encoding="utf-8") as f:
            json.dump({"engine": f"kokoro-82M {voice} x{speed:.2f}", "words": words}, f, indent=1)
        joined += [audio, np.zeros(int(args.gap * SR), dtype=audio.dtype)]
        print(f"{s['id']}: {len(audio) / SR:.1f}s audio, {len(words)} words in {time.time() - t0:.1f}s", flush=True)
    if args.joined:
        whole = np.concatenate(joined[:-1])
        sf.write(os.path.join(args.out_dir, args.joined), whole, SR)
        print(f"{args.joined}: {len(whole) / SR:.1f}s", flush=True)


if __name__ == "__main__":
    main()
