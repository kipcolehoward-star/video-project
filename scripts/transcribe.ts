/**
 * npm run transcribe -- [--project <id>] [--force] [--verify]
 * --verify: with engine timing (ElevenLabs), also run whisper and report how closely they agree.
 * whisper.cpp word timings, aligned onto the script's words -> transcript.json.
 */
import {loadProject, parseArgs, pickProject} from './lib/project';
import {transcribeProject} from './lib/speech';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
console.log(`Transcribing "${p.id}"`);
transcribeProject(p, {force: args.bool('force'), verify: args.bool('verify')});
console.log('\nWrote transcript.json');
