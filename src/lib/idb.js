// Tiny key-value store on the phone (IndexedDB). Holds the device key,
// the encrypted GitHub key and an encrypted copy of your data for offline use.

const DB = 'budget';
const STORE = 'kv';
let dbp;
const memory = new Map(); // fallback when the browser blocks storage (private mode)

function open() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbp;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbGet(key) {
  const db = await open();
  if (!db) return memory.get(key);
  try {
    return await tx(db, 'readonly', (s) => s.get(key));
  } catch {
    return memory.get(key);
  }
}

export async function idbSet(key, value) {
  memory.set(key, value);
  const db = await open();
  if (!db) return false;
  try {
    await tx(db, 'readwrite', (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function idbDel(key) {
  memory.delete(key);
  const db = await open();
  if (!db) return;
  try {
    await tx(db, 'readwrite', (s) => s.delete(key));
  } catch {
    /* ignore */
  }
}

export async function idbClear() {
  memory.clear();
  const db = await open();
  if (!db) return;
  try {
    await tx(db, 'readwrite', (s) => s.clear());
  } catch {
    /* ignore */
  }
}

export async function askPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}
