// Every change you make goes through here.
import { commit } from './store';
import { uid, round2 } from './format';
import { ruleKeysFor } from './rules';

const now = () => Date.now();

export function addTxn(t) {
  const id = uid('m');
  commit((d) => ({
    ...d,
    txns: {
      ...d.txns,
      [id]: {
        id,
        date: t.date,
        amount: round2(t.amount),
        dir: t.dir || 'out',
        payee: (t.payee || '').trim(),
        details: '',
        account: t.account,
        category: t.category,
        note: (t.note || '').trim(),
        source: 'manual',
        createdAt: now(),
        updatedAt: now(),
      },
    },
  }));
  return id;
}

export function updateTxn(id, patch) {
  commit((d) => {
    const cur = d.txns[id];
    if (!cur) return d;
    return { ...d, txns: { ...d.txns, [id]: { ...cur, ...patch, updatedAt: now() } } };
  });
}

export function deleteTxn(id) {
  // Kept as a hidden marker so the same statement line isn't re-added later.
  updateTxn(id, { deleted: true });
}

/** Remembers a payee → category choice and applies it to past matching transactions. */
export function rememberRule(txn, category, applyToPast = true) {
  const keys = ruleKeysFor(txn);
  if (!keys.length) return;
  commit((d) => {
    const rules = { ...d.rules };
    for (const k of keys) rules[k] = { key: k, category, label: txn.payee || k, updatedAt: now() };
    let txns = d.txns;
    if (applyToPast) {
      txns = { ...d.txns };
      for (const t of Object.values(d.txns)) {
        if (t.deleted || t.id === txn.id || t.category === category || t.dir !== txn.dir) continue;
        const tk = ruleKeysFor(t);
        if (tk.some((k) => keys.includes(k))) txns[t.id] = { ...t, category, updatedAt: now() };
      }
    }
    return { ...d, rules, txns };
  });
}

export function deleteRule(k) {
  commit((d) => ({ ...d, rules: { ...d.rules, [k]: { ...d.rules[k], deleted: true, updatedAt: now() } } }));
}

function monthEntry(d, month) {
  return d.months[month] || { budget: {}, income: 0, updatedAt: 0 };
}

export function setBudget(month, category, amount) {
  commit((d) => {
    const m = monthEntry(d, month);
    return { ...d, months: { ...d.months, [month]: { ...m, budget: { ...m.budget, [category]: Math.max(0, round2(amount) || 0) }, updatedAt: now() } } };
  });
}

export function setIncome(month, amount) {
  commit((d) => {
    const m = monthEntry(d, month);
    return { ...d, months: { ...d.months, [month]: { ...m, income: Math.max(0, round2(amount) || 0), updatedAt: now() } } };
  });
}

export function copyPlan(from, to) {
  commit((d) => {
    const src = d.months[from];
    if (!src) return d;
    const m = monthEntry(d, to);
    return { ...d, months: { ...d.months, [to]: { ...m, budget: { ...src.budget }, income: m.income || src.income || 0, updatedAt: now() } } };
  });
}

/** Moves budget from one category to another (to cover overspending). */
export function moveBudget(month, fromCat, toCat, amount) {
  commit((d) => {
    const m = monthEntry(d, month);
    const b = { ...m.budget };
    const amt = round2(Math.min(amount, b[fromCat] || 0));
    b[fromCat] = round2((b[fromCat] || 0) - amt);
    b[toCat] = round2((b[toCat] || 0) + amt);
    return { ...d, months: { ...d.months, [month]: { ...m, budget: b, updatedAt: now() } } };
  });
}

export function confirmPlan(month) {
  commit((d) => {
    const m = monthEntry(d, month);
    return { ...d, months: { ...d.months, [month]: { ...m, confirmed: true, updatedAt: now() } } };
  });
}

export function updateSettings(fn) {
  commit((d) => ({ ...d, settings: { ...fn(d.settings), updatedAt: now() } }));
}

export function addCategory(group, name) {
  const id = uid('c');
  updateSettings((s) => ({ ...s, categories: [...s.categories, { id, group, name: name.trim(), hint: '' }] }));
  return id;
}

export function renameCategory(id, name) {
  updateSettings((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) }));
}

export function archiveCategory(id, archived = true) {
  updateSettings((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, archived } : c)) }));
}

export function saveAccount(acc) {
  updateSettings((s) => {
    const exists = s.accounts.some((a) => a.id === acc.id);
    return { ...s, accounts: exists ? s.accounts.map((a) => (a.id === acc.id ? { ...a, ...acc } : a)) : [...s.accounts, acc] };
  });
}

export function archiveAccount(id, archived = true) {
  updateSettings((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, archived } : a)) }));
}

export function setApiKey(value) {
  commit((d) => ({ ...d, apiKey: { value: value.trim(), updatedAt: now() } }));
}

/** Saves a reviewed statement in one go. */
export function saveImport({ importInfo, newTxns, matched, rules }) {
  commit((d) => {
    const txns = { ...d.txns };
    for (const t of newTxns) txns[t.id] = { ...t, createdAt: now(), updatedAt: now() };
    for (const m of matched) {
      const cur = txns[m.manualId];
      if (cur) txns[m.manualId] = { ...cur, importIds: [...(cur.importIds || []), m.importId], details: cur.details || m.details, updatedAt: now() };
    }
    const nextRules = { ...d.rules };
    for (const r of rules) nextRules[r.key] = { ...r, updatedAt: now() };
    return { ...d, txns, rules: nextRules, imports: { ...d.imports, [importInfo.id]: { ...importInfo, updatedAt: now() } } };
  });
}
