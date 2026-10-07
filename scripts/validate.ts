/**
 * npm run validate -- [--project <id>] [--format 9:16 | --formats 16:9,9:16,1:1] [--captions <style>]
 * Pre-render checks. With no format flags, checks 16:9, 9:16 and 1:1 so a
 * story is always known to adapt across formats.
 */
import {checkAssets, checkFonts, checkGeo, checkLayout, checkNarration, checkStoryboard, hasErrors, printFindings, type Finding} from './lib/checks';
import {loadProject, parseArgs, pickProject, resolveProjectFormat} from './lib/project';

const args = parseArgs();
const id = pickProject(args.str('project'));
const p = loadProject(id);
const captions = args.str('captions');
const formatList = args.str('formats')?.split(',') ?? (args.str('format') ? [args.str('format')!] : ['16:9', '9:16', '1:1']);

let all: Finding[] = [];
const primary = resolveProjectFormat(p.config, formatList[0]);
const common = [...checkFonts(), ...checkAssets(p), ...checkGeo(p), ...checkStoryboard(p, primary)];
printFindings(`Project "${id}"`, common);
all = all.concat(common);

for (const spec of formatList) {
  const fmt = resolveProjectFormat(p.config, spec);
  const findings = [...checkLayout(p, fmt, captions), ...checkNarration(p, fmt, captions)];
  printFindings(`${fmt.id} (${fmt.width}x${fmt.height}, ${fmt.orientation})`, findings);
  all = all.concat(findings);
}

const errors = all.filter((x) => x.level === 'error').length;
const warns = all.filter((x) => x.level === 'warn').length;
console.log(`\n${errors} error(s), ${warns} warning(s)`);
process.exit(hasErrors(all) ? 1 : 0);
