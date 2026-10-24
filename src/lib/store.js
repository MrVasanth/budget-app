// App state, the device lock, and saving to GitHub in the background.
import { useSyncExternalStore } from 'react';
import { emptyState, DEFAULT_CATEGORIES } from '../defaults';
import { deriveKey, seal, unseal, encryptText, decryptText, randomBytes, toB64, fromB64, KDF_ITERATIONS, isEnvelope } from './crypto';
import { idbGet, idbSet, idbDel, idbClear, askPersistentStorage } from './idb';
import { getFile, putFile, whoAmI, getRepo, GitHubError } from './github';
import { mergeData } from './merge';

// ---------- observable state ----------
let S = {
  phase: 'loading', // 'loading' | 'setup' | 'ready'
  data: null,
  sync: { status: 'idle', lastSaved: 0, error: '' }, // idle | saving | saved | offline | error
  repo: null, // { owner, repo }
  hasDraft: false,
};
const listeners = new Set();
function emit() {
  for (const l of listeners) l();
}
function set(patch) {
  S = { ...S, ...patch };
  emit();
}
export function getState() {
  return S;
}
export function useApp() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => S,
  );
}

// ---------- device secrets (memory only) ----------
let key = null; // CryptoKey, cannot be exported
let kdf = null; // { iter, salt }
let token = '';
let owner = '';
let repo = '';
let sha = null;
let rev = 0;
let savedRev = 0;

function setSync(status, error = '') {
  set({ sync: { ...S.sync, status, error, lastSaved: status === 'saved' ? Date.now() : S.sync.lastSaved } });
}

// Older saved data may lack fields added later; fill them in.
function normalize(data) {
  const d = { ...emptyState(), ...data };
  d.settings = { ...emptyState().settings, ...d.settings };
  const ids = new Set(d.settings.categories.map((c) => c.id));
  // make sure the special categories always exist
  const missing = DEFAULT_CATEGORIES.filter((c) => (c.group === 'income' || c.group === 'ignore') && !ids.has(c.id));
  if (missing.length) d.settings = { ...d.settings, categories: [...d.settings.categories, ...missing] };
  return d;
}

// ---------- serialised background work ----------
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

// ---------- local encrypted cache ----------
let localTimer = null;
function saveLocalSoon() {
  clearTimeout(localTimer);
  localTimer = setTimeout(saveLocal, 250);
}
async function saveLocal() {
  if (!key || !S.data) return;
  try {
    const env = await seal(key, kdf, S.data);
    await idbSet('cache', { env, sha, dirty: rev !== savedRev, at: Date.now() });
  } catch {
    /* storage full or blocked: GitHub copy is still the source of truth */
  }
}

// ---------- boot ----------
export async function boot() {
  listen();
  const dev = await idbGet('device');
  if (!dev || !dev.key) {
    set({ phase: 'setup' });
    return;
  }
  try {
    key = dev.key;
    kdf = { iter: dev.iter, salt: dev.salt };
    owner = dev.owner;
    repo = dev.repo;
    token = await decryptText(key, dev.tokenBox);
    set({ repo: { owner, repo } });
    const cache = await idbGet('cache');
    if (cache && cache.env) {
      const data = normalize(await unseal(key, cache.env));
      sha = cache.sha || null;
      rev = cache.dirty ? 1 : 0;
      savedRev = 0;
      set({ phase: 'ready', data });
    }
    set({ hasDraft: !!(await idbGet('draft')) });
  } catch {
    // The saved device lock is damaged. Start setup again (data on GitHub is safe).
    await idbClear();
    set({ phase: 'setup' });
    return;
  }
  await syncNow();
  // First open on this device and GitHub was unreachable: nothing to show yet.
  if (!S.data) set({ phase: 'offline' });
}

// Keep saving and fetching in the background. These do nothing until the device is set up.
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow({ throttle: 15000 });
    else saveLocal();
  });
  window.addEventListener('pagehide', () => saveLocal());
  setInterval(() => {
    if (rev !== savedRev) syncNow();
  }, 60000);
}

// ---------- setup ----------
/** Checks the GitHub key and repo. Returns { owner, repo, file } where file is null for a new setup. */
export async function connectRepo(newToken, repoName) {
  const t = newToken.trim();
  const login = await whoAmI(t);
  const info = await getRepo(t, login, repoName);
  if (!info.private) {
    throw new GitHubError(`“${repoName}” is public. Make it private on GitHub first (Settings → Danger zone → Change visibility), then try again.`, { kind: 'public' });
  }
  const file = await getFile(t, login, repoName);
  return { owner: login, repo: repoName, token: t, file };
}

async function rememberDevice(conn, k, kdfInfo) {
  const tokenBox = await encryptText(k, conn.token);
  await idbSet('device', { key: k, iter: kdfInfo.iter, salt: kdfInfo.salt, owner: conn.owner, repo: conn.repo, tokenBox });
  askPersistentStorage();
  key = k;
  kdf = kdfInfo;
  token = conn.token;
  owner = conn.owner;
  repo = conn.repo;
}

/** First time ever: creates the encrypted data file. */
export async function createVault(conn, passphrase) {
  const salt = toB64(randomBytes(16));
  const kdfInfo = { iter: KDF_ITERATIONS, salt };
  const k = await deriveKey(passphrase, fromB64(salt), KDF_ITERATIONS);
  const data = normalize(emptyState());
  const env = await seal(k, kdfInfo, data);
  sha = await putFile(conn.token, conn.owner, conn.repo, JSON.stringify(env), null);
  await rememberDevice(conn, k, kdfInfo);
  rev = 0;
  savedRev = 0;
  set({ phase: 'ready', data, repo: { owner, repo } });
  setSync('saved');
  await saveLocal();
}

/** New phone or laptop: opens the existing file with the passphrase. */
export async function unlockVault(conn, passphrase) {
  let env;
  try {
    env = JSON.parse(conn.file.text);
  } catch {
    env = null;
  }
  if (!isEnvelope(env)) throw new Error('The data file in this repo isn’t from this app.');
  const kdfInfo = { iter: env.kdf.iter, salt: env.kdf.salt };
  const k = await deriveKey(passphrase, fromB64(kdfInfo.salt), kdfInfo.iter);
  const data = normalize(await unseal(k, env)); // throws WrongPassphrase
  sha = conn.file.sha;
  await rememberDevice(conn, k, kdfInfo);
  rev = 0;
  savedRev = 0;
  set({ phase: 'ready', data, repo: { owner, repo } });
  setSync('saved');
  await saveLocal();
}

/** Replaces the GitHub key on this device (for when it expires). */
export async function replaceToken(newToken) {
  const t = newToken.trim();
  const login = await whoAmI(t);
  await getRepo(t, login, repo);
  token = t;
  owner = login;
  const dev = await idbGet('device');
  await idbSet('device', { ...dev, owner, tokenBox: await encryptText(key, t) });
  set({ repo: { owner, repo } });
  await syncNow();
}

export async function forgetDevice() {
  await idbClear();
  key = null;
  token = '';
  location.reload();
}

// ---------- syncing ----------
let lastPull = 0;
let pushTimer = null;

export async function retryBoot() {
  await syncNow();
  if (!S.data) set({ phase: 'offline' });
}

export function syncNow({ throttle = 0 } = {}) {
  if (!key) return Promise.resolve();
  if (throttle && Date.now() - lastPull < throttle) return Promise.resolve();
  return serial(async () => {
    try {
      await pull();
      await push();
    } catch (e) {
      handleSyncError(e);
    }
  });
}

function handleSyncError(e) {
  if (e && e.kind === 'offline') setSync('offline');
  else if (e && e.kind === 'auth') setSync('error', 'GitHub key expired or wrong. Update it in More → Your data.');
  else setSync('error', (e && e.message) || 'Couldn’t save to GitHub.');
}

async function pull() {
  lastPull = Date.now();
  const f = await getFile(token, owner, repo);
  if (!f) {
    // File missing on GitHub (first save, or deleted). Next push recreates it.
    sha = null;
    if (!S.data) set({ phase: 'ready', data: normalize(emptyState()) });
    if (S.data) rev = savedRev + 1;
    return;
  }
  if (f.sha === sha && S.data) return;
  const remote = normalize(await unseal(key, JSON.parse(f.text)));
  if (S.data && rev !== savedRev) {
    set({ data: mergeData(S.data, remote) });
    rev++;
  } else {
    set({ data: remote, phase: 'ready' });
  }
  sha = f.sha;
  saveLocalSoon();
  if (rev === savedRev) setSync('saved');
}

async function push() {
  if (rev === savedRev) return;
  setSync('saving');
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = rev;
    const env = await seal(key, kdf, S.data);
    try {
      sha = await putFile(token, owner, repo, JSON.stringify(env), sha);
      savedRev = target;
      break;
    } catch (e) {
      if (e.kind !== 'conflict' || attempt === 2) throw e;
      await pull(); // merge the other device's changes, then try again
    }
  }
  saveLocalSoon();
  setSync(rev === savedRev ? 'saved' : 'saving');
  if (rev !== savedRev) schedulePush(800);
}

function schedulePush(ms = 2500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    serial(async () => {
      try {
        await push();
      } catch (e) {
        handleSyncError(e);
        if (e.kind !== 'auth') schedulePush(30000);
      }
    });
  }, ms);
}

/** Applies a change to your data, saves it on the phone right away and to GitHub shortly after. */
export function commit(fn) {
  if (!S.data) return;
  const next = fn(S.data);
  if (!next || next === S.data) return;
  rev++;
  set({ data: next, sync: { ...S.sync, status: 'saving' } });
  saveLocalSoon();
  schedulePush();
}

// ---------- statement review draft (kept if you leave mid-review) ----------
export async function saveDraft(draft) {
  if (!key) return;
  try {
    await idbSet('draft', await seal(key, kdf, draft));
    set({ hasDraft: true });
  } catch {
    /* ignore */
  }
}
export async function loadDraft() {
  const env = await idbGet('draft');
  if (!env || !key) return null;
  try {
    return await unseal(key, env);
  } catch {
    return null;
  }
}
export async function clearDraft() {
  await idbDel('draft');
  set({ hasDraft: false });
}

/** The same encrypted file that's on GitHub, for keeping a copy elsewhere. */
export async function exportBackup() {
  if (!key || !S.data) return null;
  return JSON.stringify(await seal(key, kdf, S.data));
}
