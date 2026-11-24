#!/usr/bin/env node
import {randomBytes, scryptSync} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node generate-dashboard-credentials.mjs /etc/checkpoint-video/dashboard.env');
  process.exit(2);
}
const ownerPassword = randomBytes(24).toString('base64url');
const agentPassword = randomBytes(24).toString('base64url');
function record(prefix, password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return prefix + '_SALT=' + salt.toString('hex') + '\n' + prefix + '_HASH=' + hash.toString('hex');
}
const env = [
  record('DASHBOARD_OWNER', ownerPassword),
  record('DASHBOARD_AGENT', agentPassword),
].join('\n') + '\n';
fs.mkdirSync(path.dirname(target), {recursive: true});
fs.writeFileSync(target, env, {mode: 0o640});
const initialFile = target + '.initial.txt';
const initialText = 'Owner username: owner\\nOwner password: ' + ownerPassword + '\\nAgent username: agent\\nAgent password: ' + agentPassword + '\\n';
fs.writeFileSync(initialFile, initialText, {mode: 0o600});
console.log('INITIAL DASHBOARD CREDENTIALS — save these now, then delete the root-only recovery file.');
console.log(initialText);
