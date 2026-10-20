"""
Edge TTS helper (Microsoft Edge online "Read Aloud" voices via the edge-tts
package). Reads text from stdin, writes MP3 + word timings JSON.

    python edge_tts_cli.py <voice> <rate> <out.mp3> <timing.json>   (text on stdin)

Unofficial endpoint: personal / non-monetised use only. The same voices are
available with commercial rights through Azure AI Speech (paid tier).
"""
import asyncio
import json
import sys

import edge_tts


async def main() -> None:
    voice, rate, out_mp3, out_json = sys.argv[1:5]
    # Node writes UTF-8; Windows Python would decode stdin with the ANSI code page and the voice would read
    # "Königsberg" as "KÃ¶nigsberg" (found 2026-10-20).
    text = sys.stdin.buffer.read().decode("utf-8").strip()
    words = []
    communicate = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    with open(out_mp3, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 1e7  # 100 ns units
                words.append({"word": chunk["text"], "start": start, "end": start + chunk["duration"] / 1e7})
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({"engine": f"edge-tts {voice}", "words": words}, f, indent=2)


if __name__ == "__main__":
    asyncio.run(main())
