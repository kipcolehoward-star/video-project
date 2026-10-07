/**
 * npm run dev -- [--project <id>] [--format 9:16]
 * Opens Remotion Studio on a project. Re-run with another --format to
 * preview the same story in a different aspect ratio.
 */
import fs from 'node:fs';
import path from 'node:path';
import {runBin} from './lib/exec';
import {ensureGeoData} from './lib/geodata';
import {buildProps, loadProject, parseArgs, pickProject, ROOT, resolveProjectFormat} from './lib/project';

const args = parseArgs();
const p = loadProject(pickProject(args.str('project')));
const fmt = resolveProjectFormat(p.config, args.str('format'));
const props = buildProps(p, fmt, {showGuides: args.bool('guides')});
ensureGeoData(p);

const out = path.join(ROOT, 'src', 'generated', 'studio-props.json');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, JSON.stringify(props, null, 2));
console.log(`Studio: project "${p.id}" as ${fmt.id} (${fmt.width}x${fmt.height})`);

process.exit(runBin('remotion', ['studio', 'src/index.ts', '--public-dir', p.dir]));
