#!/usr/bin/env python3
"""Speech-to-text with faster-whisper (open source, runs locally on CPU).

Run on the render server with the whisper venv:
  ~/.venvs/whisper/bin/python scripts/server/transcribe.py <audio-or-video> [--model turbo] [--lang en]

Writes <input>.transcript.txt (timestamped lines) and <input>.transcript.srt next to the input.
The first run downloads the model from Hugging Face (turbo is about 1.6 GB).
"""
import argparse
import os
import subprocess
import sys
import time

import numpy as np
from faster_whisper import WhisperModel


def load_audio(path: str) -> np.ndarray:
    # Decode with the system FFmpeg (16 kHz mono float). faster-whisper's built-in PyAV decoder
    # fails on Python 3.14 ("open() got an unexpected keyword argument 'metadata_errors'").
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def stamp(t: float, sep: str = ".") -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--model", default="turbo")
    ap.add_argument("--lang", default=None, help="language code, e.g. en (default: detect)")
    ap.add_argument("--threads", type=int, default=os.cpu_count() or 4)
    args = ap.parse_args()

    started = time.time()
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=args.threads)
    segments, info = model.transcribe(
        load_audio(args.input),
        language=args.lang,
        beam_size=5,
        vad_filter=True,
        # Stops one misheard line from repeating through the rest of a noisy recording.
        condition_on_previous_text=False,
    )
    print(f"language={info.language} p={info.language_probability:.2f} duration={info.duration:.1f}s", flush=True)

    base = os.path.splitext(args.input)[0]
    n = 0
    with open(base + ".transcript.txt", "w", encoding="utf-8") as txt, \
            open(base + ".transcript.srt", "w", encoding="utf-8") as srt:
        for seg in segments:
            text = seg.text.strip()
            if not text:
                continue
            n += 1
            # avg_logprob below about -1 or no_speech_prob near 1 marks a line the model was unsure of.
            txt.write(f"[{stamp(seg.start)} - {stamp(seg.end)}] ({seg.avg_logprob:.2f}) {text}\n")
            srt.write(f"{n}\n{stamp(seg.start, ',')} --> {stamp(seg.end, ',')}\n{text}\n\n")
            txt.flush()
            print(f"{stamp(seg.end)} / {stamp(info.duration)}", flush=True)

    print(f"DONE segments={n} seconds={time.time() - started:.0f}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
