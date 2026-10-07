/**
 * npm run voiceover -- [--project <id>] [--force] [--scene <id>] [--dry-run]
 * Generates narration for every scene with `narration`, using
 * project.json audio.provider ("piper" local, or "elevenlabs" paid API).
 * Unchanged scenes are never regenerated (no repeat billing).
 */
import {loadProject, parseArgs, pickProject} from './lib/project';
import {generateVoiceover, planVoiceover} from './lib/speech';
import {subscription} from './lib/tts/elevenlabs';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const opts = {force: args.bool('force'), only: args.str('scene')};
const plan = planVoiceover(p, opts);
const paid = p.audio.provider === 'elevenlabs';

console.log(`Voiceover for "${p.id}" — ${p.audio.provider} / ${p.audio.voice}${paid ? ` / ${p.audio.model}` : ''}`);
console.log(`  ${plan.toGenerate.length} scene(s) to generate${plan.toGenerate.length ? `: ${plan.toGenerate.join(', ')}` : ''}${paid ? ` — ${plan.characters} characters billed` : ''}`);

if (paid && plan.characters > 0) {
  const sub = await subscription();
  if (sub) {
    const left = sub.character_limit - sub.character_count;
    console.log(`  ElevenLabs plan "${sub.tier}": ${left.toLocaleString('en-US')} of ${sub.character_limit.toLocaleString('en-US')} characters left this period`);
    if (sub.tier === 'free') console.log('  NOTE  free plan: non-commercial only, and the title must credit "elevenlabs.io".');
    if (plan.characters > left) {
      console.error(`\nNot enough characters left (${plan.characters} needed). Nothing was generated.`);
      process.exit(1);
    }
  } else {
    console.log('  Quota unknown (key lacks "User: Read"); ElevenLabs will reject requests if the quota runs out.');
  }
}
if (args.bool('dry-run')) {
  console.log('\nDry run: nothing generated.');
  process.exit(0);
}

const m = await generateVoiceover(p, opts);
const total = Object.values(m.scenes).reduce((n, s) => n + s.duration, 0);
console.log(`\n${Object.keys(m.scenes).length} clip(s), ${total.toFixed(1)}s of narration. Licence: ${m.license}`);
if (m.attribution) console.log(`Attribution: ${m.attribution}`);
