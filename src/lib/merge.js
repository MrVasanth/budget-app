// Combines two copies of your data (say, phone and laptop) without losing edits.
// Each item keeps the version that was changed most recently.

function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = newer(out[k], v);
  return out;
}

export function mergeData(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  return {
    v: Math.max(local.v || 1, remote.v || 1),
    settings: newer(local.settings, remote.settings),
    apiKey: newer(local.apiKey, remote.apiKey),
    rules: mergeMap(local.rules, remote.rules),
    months: mergeMap(local.months, remote.months),
    txns: mergeMap(local.txns, remote.txns),
    imports: mergeMap(local.imports, remote.imports),
  };
}
