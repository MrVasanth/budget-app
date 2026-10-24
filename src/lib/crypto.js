// Locks your data with your passphrase before it leaves the phone.
// PBKDF2 (SHA-256) turns the passphrase into a key, AES-GCM encrypts.
// Without the passphrase the saved file is unreadable, including to GitHub.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 310000;

export function toB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64) {
  const s = atob(b64.replace(/\s/g, ''));
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export async function deriveKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // the key can never be read back out of the browser
    ['encrypt', 'decrypt'],
  );
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const canZip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encryptBytes(key, bytes) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptBytes(key, { iv, ct }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(ct));
  return new Uint8Array(pt);
}

export async function encryptText(key, text) {
  return encryptBytes(key, enc.encode(text));
}

export async function decryptText(key, box) {
  return dec.decode(await decryptBytes(key, box));
}

/** Encrypts any JSON-able object into a self-describing envelope. */
export async function seal(key, kdf, obj) {
  let bytes = enc.encode(JSON.stringify(obj));
  let z = false;
  if (canZip) {
    bytes = await pipe(bytes, new CompressionStream('gzip'));
    z = true;
  }
  const box = await encryptBytes(key, bytes);
  return { app: 'budget', v: 1, kdf: { name: 'PBKDF2-SHA256', iter: kdf.iter, salt: kdf.salt }, z, ...box };
}

export class WrongPassphrase extends Error {
  constructor() {
    super('That passphrase doesn’t open this data.');
    this.name = 'WrongPassphrase';
  }
}

export async function unseal(key, env) {
  let bytes;
  try {
    bytes = await decryptBytes(key, env);
  } catch {
    throw new WrongPassphrase();
  }
  if (env.z) bytes = await pipe(bytes, new DecompressionStream('gzip'));
  return JSON.parse(dec.decode(bytes));
}

export function isEnvelope(x) {
  return x && x.app === 'budget' && x.kdf && x.iv && x.ct;
}
