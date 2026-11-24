import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/generated/studio-props.json');
if (!fs.existsSync(file)) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, '{}\n');
}
