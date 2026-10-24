// "Always use this category for this payee" memory.
// A payee is recognised by its UPI ID when there is one, otherwise by its cleaned-up name.

const UPI_RE = /[a-z0-9][a-z0-9._-]{1,}@[a-z][a-z0-9]{1,}/gi;

export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function upiIds(text) {
  const ids = String(text || '').match(UPI_RE) || [];
  // skip things that are clearly emails of banks' own notification addresses
  return [...new Set(ids.map((x) => x.toLowerCase()))];
}

export function ruleKeysFor(t) {
  const keys = [];
  for (const id of upiIds(t.details)) keys.push('upi:' + id);
  const n = normName(t.payee);
  if (n && n.length >= 3) keys.push('name:' + n);
  return keys;
}

export function findRule(rules, t) {
  for (const k of ruleKeysFor(t)) {
    const r = rules[k];
    if (r && !r.deleted) return r;
  }
  return null;
}
