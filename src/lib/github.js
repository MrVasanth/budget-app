// Reads and writes your encrypted data file in your private GitHub repo.

const API = 'https://api.github.com';
export const DATA_PATH = 'budget-data.json';

export class GitHubError extends Error {
  constructor(message, { status = 0, kind = 'error' } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.kind = kind; // 'auth' | 'notfound' | 'conflict' | 'offline' | 'rate' | 'error'
  }
}

function headers(token, accept = 'application/vnd.github+json') {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: accept,
  };
}

async function request(url, opts) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store', ...opts });
  } catch {
    throw new GitHubError('Can’t reach GitHub. Check your internet connection.', { kind: 'offline' });
  }
  return res;
}

async function fail(res, what) {
  let msg = '';
  try {
    msg = (await res.json()).message || '';
  } catch {
    /* ignore */
  }
  if (res.status === 401) throw new GitHubError('GitHub didn’t accept the key. It may be wrong or expired.', { status: 401, kind: 'auth' });
  if (res.status === 403 && /rate limit/i.test(msg)) throw new GitHubError('GitHub says to slow down. Trying again shortly.', { status: 403, kind: 'rate' });
  if (res.status === 403) throw new GitHubError('The GitHub key doesn’t have permission to save to this repo.', { status: 403, kind: 'auth' });
  if (res.status === 404) throw new GitHubError(`Couldn’t find ${what}.`, { status: 404, kind: 'notfound' });
  if (res.status === 409 || res.status === 422) throw new GitHubError('The data changed on another device.', { status: res.status, kind: 'conflict' });
  throw new GitHubError(`GitHub error ${res.status}${msg ? ': ' + msg : ''}`, { status: res.status });
}

export async function whoAmI(token) {
  const res = await request(`${API}/user`, { headers: headers(token) });
  if (!res.ok) await fail(res, 'your GitHub account');
  const u = await res.json();
  return u.login;
}

export async function getRepo(token, owner, repo) {
  const res = await request(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!res.ok) await fail(res, `the repo “${repo}”`);
  return res.json();
}

function decodeContent(b64) {
  const s = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Returns { sha, text } or null when the file doesn't exist yet. */
export async function getFile(token, owner, repo, path = DATA_PATH) {
  const url = `${API}/repos/${owner}/${repo}/contents/${path}`;
  const res = await request(url, { headers: headers(token) });
  if (res.status === 404) {
    // Distinguish "file not there yet" from "repo not reachable".
    await getRepo(token, owner, repo);
    return null;
  }
  if (!res.ok) await fail(res, path);
  const meta = await res.json();
  if (meta.content && meta.encoding === 'base64') return { sha: meta.sha, text: decodeContent(meta.content) };
  // Files over 1 MB come back without content; fetch the raw bytes instead.
  const raw = await request(url, { headers: headers(token, 'application/vnd.github.raw+json') });
  if (!raw.ok) await fail(raw, path);
  return { sha: meta.sha, text: await raw.text() };
}

/** Creates or replaces the file. Pass the current sha when replacing. Returns the new sha. */
export async function putFile(token, owner, repo, text, sha, path = DATA_PATH) {
  const body = {
    message: `Update budget data (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
    content: btoa(text), // text is plain ASCII (JSON + base64)
  };
  if (sha) body.sha = sha;
  const res = await request(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await fail(res, `the repo “${repo}”`);
  const out = await res.json();
  return out.content.sha;
}

/** Link that opens GitHub's "new key" page with everything pre-filled except repo choice. */
export function newTokenUrl() {
  const p = new URLSearchParams({
    name: 'Budget app',
    description: 'Lets the Budget app save your encrypted data to finance-data',
    expires_in: '366',
    contents: 'write',
  });
  return `https://github.com/settings/personal-access-tokens/new?${p}`;
}
