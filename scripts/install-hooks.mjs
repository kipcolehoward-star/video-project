// npm run hooks:install — installs the secrets pre-commit hook into .git/hooks.
import fs from 'node:fs';
fs.writeFileSync('.git/hooks/pre-commit', '#!/bin/sh\n# Blocks commits containing secrets (see scripts/check-secrets.mjs)\nnode scripts/check-secrets.mjs || exit 1\n', {mode: 0o755});
console.log('pre-commit secrets hook installed');
