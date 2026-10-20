/**
 * YouTube Data API v3 for the user's own Google Cloud project (no SDK; Node's fetch + http).
 *
 * Auth: OAuth for a "Desktop app" client (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .env). The first run opens the
 * browser on Google's consent page and catches the answer on a 127.0.0.1 port (loopback flow with PKCE). The refresh
 * token is kept OUTSIDE the repo (~/.video-project/youtube-token.json), so it can never be committed. While the
 * consent screen is in "Testing", Google expires it after about 7 days; an expired token just starts the login again.
 *
 * Limits: uploads from a project that has not passed Google's YouTube API audit are locked to private by YouTube,
 * whatever privacyStatus says. Custom thumbnails need a phone-verified channel.
 */
import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {requireEnv} from './env';

const TOKEN_FILE = path.join(os.homedir(), '.video-project', 'youtube-token.json');
// upload: videos.insert and thumbnails.set; force-ssl: captions and reading the channel/video status.
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'];
const HINT = 'Google Cloud Console → Google Auth Platform → Clients → your Desktop app client.';

const client = () => ({id: requireEnv('YOUTUBE_CLIENT_ID', HINT), secret: requireEnv('YOUTUBE_CLIENT_SECRET', HINT)});

/** Opens a URL in the default browser (rundll32 takes the URL as one argument, so "&" needs no quoting). */
function openBrowser(url: string) {
  const cmd = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd[0] as string, cmd[1] as string[], {detached: true, stdio: 'ignore'}).unref();
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(body)});
  const json = (await res.json()) as {access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string};
  return {ok: res.ok, json};
}

/** Browser login; resolves with a refresh token. Times out after 5 minutes. */
async function login(): Promise<string> {
  const {id, secret} = client();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirect = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: id, redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
    code_challenge: challenge, code_challenge_method: 'S256', state,
  })}`;
  console.log('\nOpening Google sign-in in your browser. Choose the account (and channel) that owns the YouTube channel, then Allow.');
  console.log('If no browser opens, visit this link:\n' + url + '\n');
  openBrowser(url);
  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No answer from the Google sign-in within 5 minutes.')), 5 * 60_000);
    server.on('request', (req, res) => {
      const q = new URL(req.url ?? '/', redirect).searchParams;
      if (!q.get('code') && !q.get('error')) return void res.end();
      const ok = q.get('state') === state && q.get('code');
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      res.end(`<p style="font:16px sans-serif">${ok ? 'Signed in. You can close this tab and return to Claude Code.' : 'Sign-in failed: ' + (q.get('error') ?? 'state mismatch')}</p>`);
      clearTimeout(timer);
      if (ok) resolve(q.get('code')!);
      else reject(new Error(`Google sign-in failed: ${q.get('error') ?? 'state mismatch'}`));
    });
  }).finally(() => server.close());
  const {ok, json} = await tokenRequest({code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier});
  if (!ok || !json.refresh_token) throw new Error(`Token exchange failed: ${json.error ?? 'no refresh token'} ${json.error_description ?? ''}`);
  fs.mkdirSync(path.dirname(TOKEN_FILE), {recursive: true});
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({refresh_token: json.refresh_token, saved: new Date().toISOString()}), {mode: 0o600});
  return json.refresh_token;
}

/** An access token, logging in first when there is no saved login or Google has expired it. */
export async function accessToken(forceLogin = false): Promise<string> {
  const {id, secret} = client();
  let refresh = !forceLogin && fs.existsSync(TOKEN_FILE) ? (JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) as {refresh_token: string}).refresh_token : null;
  for (let attempt = 0; attempt < 2; attempt++) {
    refresh ??= await login();
    const {ok, json} = await tokenRequest({refresh_token: refresh, client_id: id, client_secret: secret, grant_type: 'refresh_token'});
    if (ok && json.access_token) return json.access_token;
    if (json.error !== 'invalid_grant') throw new Error(`Google token refresh failed: ${json.error} ${json.error_description ?? ''}`);
    console.log('The saved YouTube login has expired; signing in again.');
    refresh = null;
  }
  throw new Error('Could not get a YouTube login.');
}

async function api<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {...init, headers: {authorization: `Bearer ${token}`, ...(init.headers ?? {})}});
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function myChannel(token: string) {
  const r = await api<{items?: {id: string; snippet: {title: string; customUrl?: string}}[]}>(token, 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true');
  return r.items?.[0] ?? null;
}

export interface VideoMeta {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacy: 'private' | 'unlisted' | 'public';
  madeForKids: boolean;
  /** ISO time; YouTube publishes then (requires privacy "private" until that moment). */
  publishAt?: string;
}

/** Resumable upload: one request for the metadata, then the file in a single PUT. Returns the video id. */
export async function uploadVideo(token: string, file: string, meta: VideoMeta): Promise<string> {
  const size = fs.statSync(file).size;
  const body = {
    snippet: {title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId},
    status: {privacyStatus: meta.privacy, selfDeclaredMadeForKids: meta.madeForKids, ...(meta.publishAt ? {publishAt: meta.publishAt} : {})},
  };
  const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(size), 'x-upload-content-type': 'video/mp4'},
    body: JSON.stringify(body),
  });
  if (!start.ok) throw new Error(`YouTube upload start ${start.status}: ${(await start.text()).slice(0, 600)}`);
  const location = start.headers.get('location');
  if (!location) throw new Error('YouTube did not return an upload address.');
  const res = await fetch(location, {method: 'PUT', headers: {'content-type': 'video/mp4', 'content-length': String(size)}, body: fs.readFileSync(file)});
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube upload ${res.status}: ${text.slice(0, 600)}`);
  return (JSON.parse(text) as {id: string}).id;
}

export async function uploadCaptions(token: string, videoId: string, srtFile: string, language = 'en', name = 'English') {
  const boundary = `b${crypto.randomBytes(8).toString('hex')}`;
  const meta = JSON.stringify({snippet: {videoId, language, name, isDraft: false}});
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
    fs.readFileSync(srtFile),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  await api(token, 'https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', {method: 'POST', headers: {'content-type': `multipart/related; boundary=${boundary}`}, body});
}

export async function setThumbnail(token: string, videoId: string, image: string) {
  const type = image.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  await api(token, `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {method: 'POST', headers: {'content-type': type}, body: fs.readFileSync(image)});
}

export async function videoStatus(token: string, videoId: string) {
  const r = await api<{items?: {status: {uploadStatus: string; privacyStatus: string; failureReason?: string; rejectionReason?: string}}[]}>(token, `https://www.googleapis.com/youtube/v3/videos?part=status&id=${videoId}`);
  return r.items?.[0]?.status ?? null;
}
