/**
 * npm run voices [-- --voice <voice_id>]
 * Lists ElevenLabs voices on your account and the remaining character quota.
 * No characters are billed. Works with restricted keys (missing permissions
 * are reported, not fatal).
 */
import {parseArgs} from './lib/project';
import {getVoice, listVoices, subscription} from './lib/tts/elevenlabs';

const args = parseArgs();
const sub = await subscription();
if (sub) {
  const left = sub.character_limit - sub.character_count;
  console.log(`Plan "${sub.tier}": ${left.toLocaleString('en-US')} of ${sub.character_limit.toLocaleString('en-US')} characters left`);
  if (sub.tier === 'free') console.log('NOTE  free plan: non-commercial only, and the title must credit "elevenlabs.io".');
} else {
  console.log('Quota: unknown (API key lacks the "User: Read" permission; enable it on the key to see quota).');
}

const one = args.str('voice');
if (one) {
  const v = await getVoice(one);
  console.log(v ? `\nVoice ${v.voice_id}: ${v.name} (${v.category ?? 'n/a'}) ${JSON.stringify(v.labels ?? {})}` : `\nVoice ${one}: details not readable with this key (needs "Voices: Read").`);
  process.exit(0);
}

try {
  const voices = await listVoices();
  console.log(`\n${voices.length} voice(s):`);
  for (const v of voices) {
    const labels = Object.entries(v.labels ?? {}).map(([k, val]) => `${k}: ${val}`).join(', ');
    console.log(`  ${v.voice_id}  ${v.name.padEnd(24)} ${(v.category ?? '').padEnd(12)} ${labels}`);
  }
} catch (e) {
  console.log(`\nVoice list not readable with this key: ${(e as Error).message.slice(0, 160)}`);
}
