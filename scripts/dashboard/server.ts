import {spawn, type ChildProcess} from 'node:child_process';
import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import http, {type IncomingMessage, type ServerResponse} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

type Role = 'owner' | 'agent';
type Action = 'validate' | 'preview' | 'qc' | 'final' | 'checkpoint-source' | 'checkpoint-preview' | 'checkpoint-final';
type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
interface Job {
  id: string; projectId: string; action: Action; status: JobStatus; createdAt: string;
  startedAt?: string; completedAt?: string; exitCode?: number | null; requestedBy: string; logFile: string;
  projectFingerprint?: string; gitCommit?: string;
}
interface Approval {file: string; sha256: string; size: number; mtimeMs: number; projectFingerprint: string; gitCommit: string; approvedAt: string; approvedBy: string}
interface DashboardState {jobs: Job[]; previewApprovals: Record<string, Approval>; finalApprovals: Record<string, Approval>}
interface Session {username: string; role: Role; expiresAt: number}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const STATE_DIR = process.env.DASHBOARD_STATE_DIR || '/var/lib/checkpoint-video';
const STATE_FILE = path.join(STATE_DIR, 'dashboard-state.json');
const PORT = Number(process.env.DASHBOARD_PORT || 3100);
const HOST = process.env.DASHBOARD_HOST || '127.0.0.1';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, Session>();
const loginFailures = new Map<string, {count: number; firstAt: number; blockedUntil: number}>();
const runningChildren = new Map<string, ChildProcess>();
let state: DashboardState = {jobs: [], previewApprovals: {}, finalApprovals: {}};
let workerActive = false;
let stateWrite: Promise<void> = Promise.resolve();

const json = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
  res.end(JSON.stringify(value));
};
const text = (res: ServerResponse, status: number, value: string, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store'});
  res.end(value);
};
const safeId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
const nowIso = () => new Date().toISOString();

async function persistState() {
  stateWrite = stateWrite.then(async () => {
    await fs.mkdir(STATE_DIR, {recursive: true});
    const tmp = STATE_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), {mode: 0o600});
    await fs.rename(tmp, STATE_FILE);
  });
  await stateWrite;
}
async function loadState() {
  await fs.mkdir(path.join(STATE_DIR, 'logs'), {recursive: true});
  try { state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8')) as DashboardState; }
  catch { state = {jobs: [], previewApprovals: {}, finalApprovals: {}}; }
  for (const job of state.jobs) {
    if (job.status === 'running') { job.status = 'interrupted'; job.completedAt = nowIso(); }
  }
  await persistState();
}
function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie || '';
  const result: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const pair = part.trim().split('=');
    if (pair.length === 2) result[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
  }
  return result;
}
function getSession(req: IncomingMessage): Session | null {
  const token = parseCookies(req).checkpoint_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return session;
}
function requireSession(req: IncomingMessage, res: ServerResponse): Session | null {
  const session = getSession(req);
  if (!session) json(res, 401, {error: 'Please sign in.'});
  return session;
}
function requireOwner(session: Session, res: ServerResponse) {
  if (session.role === 'owner') return true;
  json(res, 403, {error: 'This action requires the owner account.'});
  return false;
}
function passwordMatches(password: string, saltHex: string | undefined, hashHex: string | undefined) {
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
async function readBody(req: IncomingMessage): Promise<any> {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString();
    if (body.length > 1024 * 1024) throw new Error('Request body too large.');
  }
  return body ? JSON.parse(body) : {};
}
function checkOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
async function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
async function projectFingerprint(projectId: string): Promise<string> {
  const base = path.join(ROOT, 'projects', projectId);
  const records: string[] = [];
  async function walk(dir: string, relative: string) {
    const entries = await fs.readdir(dir, {withFileTypes: true});
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relative ? relative + '/' + entry.name : entry.name;
      if (rel === 'previews' || rel.startsWith('previews/') || rel === 'output' || rel.startsWith('output/')) continue;
      if (rel === 'audio/.mixwork' || rel.startsWith('audio/.mixwork/') || rel === 'audio/mix.wav' || rel === 'audio/mix.json') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) records.push(rel + ':' + await hashFile(full));
    }
  }
  await walk(base, '');
  return createHash('sha256').update(records.sort().join('\\n')).digest('hex');
}
async function frameworkIsClean(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['status', '--porcelain', '--', 'src', 'scripts', 'package.json', 'package-lock.json'], {cwd: ROOT});
    let output = '';
    child.stdout.on('data', (d) => output += d.toString());
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim().length === 0) : reject(new Error('Cannot inspect Git working tree.')));
  });
}
async function latestMp4(projectId: string, folder: 'previews' | 'output') {
  const dir = path.join(ROOT, 'projects', projectId, folder);
  let names: string[];
  try { names = await fs.readdir(dir); } catch { return null; }
  const files = await Promise.all(names.filter((n) => n.toLowerCase().endsWith('.mp4')).map(async (name) => {
    const full = path.join(dir, name);
    const st = await fs.stat(full).catch(() => null);
    return st?.isFile() ? {name, full, mtimeMs: st.mtimeMs, size: st.size} : null;
  }));
  return files.filter((x): x is NonNullable<typeof x> => Boolean(x)).sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
}
async function currentCommit() {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], {cwd: ROOT});
    let output = '';
    child.stdout?.on('data', (d) => output += d.toString());
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error('Cannot read current Git commit.')));
  });
}
async function listProjects() {
  const base = path.join(ROOT, 'projects');
  const entries = await fs.readdir(base, {withFileTypes: true}).catch(() => []);
  const result: any[] = [];
  for (const entry of entries.filter((x) => x.isDirectory() && safeId(x.name))) {
    const projectId = entry.name;
    let config: any = {};
    try { config = JSON.parse(await fs.readFile(path.join(base, projectId, 'project.json'), 'utf8')); } catch { continue; }
    const preview = await latestMp4(projectId, 'previews');
    const final = await latestMp4(projectId, 'output');
    const previewApproval = state.previewApprovals[projectId];
    const finalApproval = state.finalApprovals[projectId];
    const commit = previewApproval || finalApproval ? await currentCommit() : '';
    const previewApproved = Boolean(preview && previewApproval && preview.name === previewApproval.file && preview.size === previewApproval.size && preview.mtimeMs === previewApproval.mtimeMs && commit === previewApproval.gitCommit);
    const finalApproved = Boolean(final && finalApproval && final.name === finalApproval.file && final.size === finalApproval.size && final.mtimeMs === finalApproval.mtimeMs && commit === finalApproval.gitCommit);
    result.push({
      id: projectId, title: typeof config.title === 'string' ? config.title : projectId,
      format: config.video?.format || '—',
      preview: preview ? {name: preview.name, url: '/media/' + projectId + '/previews/' + encodeURIComponent(preview.name), size: preview.size, updatedAt: new Date(preview.mtimeMs).toISOString()} : null,
      final: final ? {name: final.name, url: '/media/' + projectId + '/output/' + encodeURIComponent(final.name), size: final.size, updatedAt: new Date(final.mtimeMs).toISOString()} : null,
      previewApproved, finalApproved,
    });
  }
  return result.sort((a, b) => a.title.localeCompare(b.title));
}
function commandFor(job: Job): {cmd: string; args: string[]} {
  const id = job.projectId;
  switch (job.action) {
    case 'validate': return {cmd: 'npm', args: ['run', 'validate', '--', '--project', id]};
    case 'preview': return {cmd: 'npm', args: ['run', 'render:preview', '--', '--project', id]};
    case 'final': return {cmd: 'npm', args: ['run', 'render', '--', '--project', id]};
    case 'qc': {
      const dir = path.join(ROOT, 'projects', id, 'output');
      const shell = 'file=$(find "' + dir + '" -maxdepth 1 -type f -name "*.mp4" -printf "%T@ %p\\n" | sort -nr | head -1 | cut -d" " -f2-); test -n "$file"; npm run qc -- "$file" --project "' + id + '"';
      return {cmd: 'bash', args: ['-lc', shell]};
    }
    case 'checkpoint-source': return {cmd: 'bash', args: ['scripts/server/push-project-checkpoint.sh', id, 'Source']};
    case 'checkpoint-preview': return {cmd: 'bash', args: ['scripts/server/push-project-checkpoint.sh', id, 'Preview']};
    case 'checkpoint-final': return {cmd: 'bash', args: ['scripts/server/push-project-checkpoint.sh', id, 'Final', '--owner-approved']};
  }
}
async function runQueue() {
  if (workerActive) return;
  workerActive = true;
  try {
    while (true) {
      const job = state.jobs.find((x) => x.status === 'queued');
      if (!job) break;
      job.status = 'running';
      job.startedAt = nowIso();
      job.logFile = path.join(STATE_DIR, 'logs', job.id + '.log');
      await persistState();
      const command = commandFor(job);
      const log = await fs.open(job.logFile, 'a');
      const child = spawn(command.cmd, command.args, {
        cwd: ROOT,
        env: {...process.env, RENDER_CONCURRENCY: '3', PATH: (process.env.HOME || '/home/checkpoint') + '/.venvs/video/bin:/usr/local/bin:/usr/bin:/bin'},
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      runningChildren.set(job.id, child);
      child.stdout.on('data', (data) => { void log.write(data); });
      child.stderr?.on('data', (data) => { void log.write(data); });
      const exitCode = await new Promise<number>((resolve) => {
        child.on('error', async (error) => { await log.write('\nSpawn error: ' + error.message + '\n'); resolve(127); });
        child.on('close', (code) => resolve(code ?? 1));
      });
      await log.close();
      runningChildren.delete(job.id);
      job.exitCode = exitCode;
      job.status = exitCode === 0 ? 'succeeded' : 'failed';
      job.completedAt = nowIso();
      await persistState();
    }
  } finally {
    workerActive = false;
    if (state.jobs.some((x) => x.status === 'queued')) void runQueue();
  }
}
function enqueue(projectId: string, action: Action, username: string) {
  const job: Job = {
    id: randomBytes(12).toString('hex'), projectId, action, status: 'queued',
    createdAt: nowIso(), requestedBy: username, logFile: path.join(STATE_DIR, 'logs', 'pending.log'),
  };
  state.jobs.push(job);
  void persistState().then(() => runQueue());
  return job;
}
async function media(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const match = pathname.match(/^\/media\/([A-Za-z0-9][A-Za-z0-9._-]*)\/(previews|output)\/([^/]+)$/);
  if (!match) return text(res, 404, 'Not found');
  const projectId = match[1];
  const folder = match[2] as 'previews' | 'output';
  const name = decodeURIComponent(match[3]);
  if (name !== path.basename(name) || !name.toLowerCase().endsWith('.mp4')) return text(res, 400, 'Invalid media path');
  const file = path.resolve(ROOT, 'projects', projectId, folder, name);
  const base = path.resolve(ROOT, 'projects', projectId, folder) + path.sep;
  if (!file.startsWith(base)) return text(res, 400, 'Invalid media path');
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return text(res, 404, 'Media not found');
  const range = req.headers.range;
  const headers: Record<string, string> = {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=300'};
  if (range) {
    const rangeMatch = range.match(/bytes=(\d*)-(\d*)/);
    if (!rangeMatch) return text(res, 416, 'Invalid range');
    const start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    const end = rangeMatch[2] ? Math.min(Number(rangeMatch[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return text(res, 416, 'Range not satisfiable');
    res.writeHead(206, {...headers, 'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size, 'Content-Length': String(end - start + 1)});
    createReadStream(file, {start, end}).pipe(res);
    return;
  }
  res.writeHead(200, {...headers, 'Content-Length': String(stat.size)});
  createReadStream(file).pipe(res);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/media/')) {
    if (!requireSession(req, res)) return;
    return media(req, res, url.pathname);
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'POST' && !checkOrigin(req)) return json(res, 403, {error: 'Origin rejected.'});
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const ip = req.socket.remoteAddress || 'unknown';
      let failure = loginFailures.get(ip);
      if (failure && Date.now() - failure.firstAt > 15 * 60 * 1000) { loginFailures.delete(ip); failure = undefined; }
      if (failure && failure.blockedUntil > Date.now()) return json(res, 429, {error: 'Too many login attempts. Try again later.'});
      let body: any;
      try { body = await readBody(req); } catch { return json(res, 400, {error: 'Invalid request.'}); }
      const username = body.username === 'owner' ? 'owner' : body.username === 'agent' ? 'agent' : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const prefix = username === 'owner' ? 'DASHBOARD_OWNER' : 'DASHBOARD_AGENT';
      const valid = Boolean(username && password && passwordMatches(password, process.env[prefix + '_SALT'], process.env[prefix + '_HASH']));
      if (!valid) {
        const current = loginFailures.get(ip) || {count: 0, firstAt: Date.now(), blockedUntil: 0};
        current.count++;
        if (current.count >= 5) current.blockedUntil = Date.now() + 15 * 60 * 1000;
        loginFailures.set(ip, current);
        return json(res, 401, {error: 'Incorrect username or password.'});
      }
      loginFailures.delete(ip);
      const role = username as Role;
      const token = randomBytes(32).toString('hex');
      sessions.set(token, {username: role, role, expiresAt: Date.now() + SESSION_TTL_MS});
      const cookie = 'checkpoint_session=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + (SESSION_TTL_MS / 1000);
      return json(res, 200, {username: role, role}, {'Set-Cookie': cookie});
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const token = parseCookies(req).checkpoint_session;
      if (token) sessions.delete(token);
      return json(res, 200, {ok: true}, {'Set-Cookie': 'checkpoint_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    }
    const session = requireSession(req, res);
    if (!session) return;
    if (req.method === 'GET' && url.pathname === '/api/session') return json(res, 200, {username: session.username, role: session.role});
    if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, await listProjects());
    if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, state.jobs.slice(-40).reverse());
    const logMatch = url.pathname.match(/^\/api\/jobs\/([a-f0-9]+)\/logs$/);
    if (req.method === 'GET' && logMatch) {
      const job = state.jobs.find((x) => x.id === logMatch[1]);
      if (!job) return json(res, 404, {error: 'Job not found.'});
      const content = await fs.readFile(job.logFile, 'utf8').catch(() => '');
      return json(res, 200, {log: content.slice(-16000)});
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      let body: any;
      try { body = await readBody(req); } catch { return json(res, 400, {error: 'Invalid request.'}); }
      const projectId = typeof body.projectId === 'string' ? body.projectId : '';
      const action = body.action as Action;
      const allowed: Action[] = ['validate', 'preview', 'qc', 'final', 'checkpoint-source', 'checkpoint-preview', 'checkpoint-final'];
      if (!safeId(projectId) || !allowed.includes(action)) return json(res, 400, {error: 'Invalid project or action.'});
      const projects = await listProjects();
      if (!projects.some((p) => p.id === projectId)) return json(res, 404, {error: 'Project not found.'});
      if (['final', 'checkpoint-final'].includes(action) && !requireOwner(session, res)) return;
      if (action === 'final') {
        const approved = state.previewApprovals[projectId];
        const preview = await latestMp4(projectId, 'previews');
        if (!approved || !preview || preview.name !== approved.file || await hashFile(preview.full) !== approved.sha256 || await currentCommit() !== approved.gitCommit) {
          return json(res, 409, {error: 'The latest preview is not approved for the current Git commit. Render and approve a fresh preview first.'});
        }
      }
      if (action === 'qc' && !(await latestMp4(projectId, 'output'))) return json(res, 409, {error: 'There is no final MP4 to run QC against.'});
      if (action === 'checkpoint-preview' && !(await latestMp4(projectId, 'previews'))) return json(res, 409, {error: 'Render a preview first.'});
      if (action === 'checkpoint-final') {
        const approved = state.finalApprovals[projectId];
        const final = await latestMp4(projectId, 'output');
        if (!approved || !final || final.name !== approved.file || await hashFile(final.full) !== approved.sha256 || await currentCommit() !== approved.gitCommit) {
          return json(res, 409, {error: 'Final output must be QC-checked and owner-approved before checkpointing.'});
        }
      }
      return json(res, 202, enqueue(projectId, action, session.username));
    }
    const previewApprovalMatch = url.pathname.match(/^\/api\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/approve-preview$/);
    if (req.method === 'POST' && previewApprovalMatch) {
      if (!requireOwner(session, res)) return;
      const projectId = previewApprovalMatch[1];
      const preview = await latestMp4(projectId, 'previews');
      if (!preview) return json(res, 409, {error: 'There is no preview to approve.'});
      const checkpoint = [...state.jobs].reverse().find((x) => x.projectId === projectId && x.action === 'checkpoint-preview' && x.status === 'succeeded' && x.completedAt && new Date(x.completedAt).getTime() >= preview.mtimeMs);
      if (!checkpoint) return json(res, 409, {error: 'Push this preview to GitHub before approving it.'});
      state.previewApprovals[projectId] = {file: preview.name, sha256: await hashFile(preview.full), gitCommit: await currentCommit(), approvedAt: nowIso(), approvedBy: session.username};
      delete state.finalApprovals[projectId];
      await persistState();
      return json(res, 200, {ok: true, message: 'Preview approved. Final rendering is now unlocked.'});
    }
    const finalApprovalMatch = url.pathname.match(/^\/api\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)\/approve-final$/);
    if (req.method === 'POST' && finalApprovalMatch) {
      if (!requireOwner(session, res)) return;
      const projectId = finalApprovalMatch[1];
      const final = await latestMp4(projectId, 'output');
      if (!final) return json(res, 409, {error: 'There is no final output to approve.'});
      const qcJob = [...state.jobs].reverse().find((x) => x.projectId === projectId && x.action === 'qc');
      if (!qcJob || qcJob.status !== 'succeeded' || !qcJob.completedAt || new Date(qcJob.completedAt).getTime() < final.mtimeMs) {
        return json(res, 409, {error: 'A successful QC run after the latest final render is required before approval.'});
      }
      state.finalApprovals[projectId] = {file: final.name, sha256: await hashFile(final.full), gitCommit: await currentCommit(), approvedAt: nowIso(), approvedBy: session.username};
      await persistState();
      return json(res, 200, {ok: true, message: 'Final output approved. You may now checkpoint it to GitHub.'});
    }
    return json(res, 404, {error: 'API route not found.'});
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'Method not allowed');
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, 'index.html')) return text(res, 400, 'Invalid path');
  const data = await fs.readFile(file).catch(() => null);
  if (!data) return text(res, 404, 'Not found');
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'application/octet-stream';
  res.writeHead(200, {'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'});
  res.end(data);
}

await loadState();
const server = http.createServer((req, res) => {
  void handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) json(res, 500, {error: 'Internal server error.'});
    else res.destroy();
  });
});
server.listen(PORT, HOST, () => console.log('Checkpoint Geo Studio listening on http://' + HOST + ':' + PORT));
process.on('SIGTERM', () => { server.close(); for (const child of runningChildren.values()) child.kill('SIGTERM'); });
process.on('SIGINT', () => { server.close(); for (const child of runningChildren.values()) child.kill('SIGTERM'); });
