// Turns a statement PDF into a list of transactions ready for you to check.
import { openPdf, readPages, chunkPages, maskNumbers } from './pdf';
import { readChunk, AIError } from './ai';
import { findRule, ruleKeysFor } from './rules';
import { liveTxns } from './budget';
import { dayDiff, round2, todayISO, uid } from './format';

function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function lineKey(accountId, t) {
  const desc = String(t.details || t.payee).toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${accountId}|${t.date}|${t.dir}|${t.amount.toFixed(2)}|${desc}`;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Reads a PDF and returns a draft for review.
 * progress({ step, done, total }) — steps: 'unlock', 'pages', 'reading', 'matching'.
 */
export async function readStatement({ file, password, account, data, apiKey, progress = () => {}, signal }) {
  progress({ step: 'unlock' });
  const doc = await openPdf(file, password);
  progress({ step: 'pages', done: 0, total: doc.numPages });
  const { pages, truncated } = await readPages(doc, (done, total) => progress({ step: 'pages', done, total }));
  doc.destroy();
  for (const p of pages) if (p.text) p.text = maskNumbers(p.text);

  const ctx = { account, accounts: data.settings.accounts, categories: data.settings.categories, today: todayISO() };
  const chunks = chunkPages(pages);
  if (!chunks.length) throw new Error('This PDF has no pages to read.');
  let doneChunks = 0;
  const total = chunks.length;
  progress({ step: 'reading', done: 0, total });

  const readOne = async (chunk) => {
    try {
      return [await readChunk(apiKey, chunk, ctx, signal)];
    } catch (e) {
      if (e instanceof AIError && e.kind === 'too_long' && chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2);
        return [...(await readOne(chunk.slice(0, mid))), ...(await readOne(chunk.slice(mid)))];
      }
      throw e;
    }
  };

  // First batch alone: it usually shows the statement period, which helps date the rest.
  const results = [];
  const first = await readOne(chunks[0]);
  results.push(first);
  doneChunks++;
  progress({ step: 'reading', done: doneChunks, total });
  const st0 = first.find((r) => r.statement && (r.statement.period_start || r.statement.period_end))?.statement;
  if (st0) ctx.periodHint = `${st0.period_start || '?'} to ${st0.period_end || '?'}`;
  const rest = await pool(chunks.slice(1), 3, async (c) => {
    const r = await readOne(c);
    doneChunks++;
    progress({ step: 'reading', done: doneChunks, total });
    return r;
  });
  results.push(...rest);

  const flat = results.flat();
  const extracted = flat.flatMap((r) => r.transactions);
  const statement = {};
  for (const r of flat) {
    for (const [k, v] of Object.entries(r.statement || {})) {
      if (v === null || v === undefined || v === '') continue;
      if (k === 'period_start') statement[k] = statement[k] && statement[k] < v ? statement[k] : v;
      else if (k === 'period_end') statement[k] = statement[k] && statement[k] > v ? statement[k] : v;
      else if (statement[k] === undefined) statement[k] = Number(v);
    }
  }

  if (account.type !== 'card') fixDirections(extracted, statement.opening_balance);

  progress({ step: 'matching' });
  return buildDraft({ extracted, statement, account, data, fileName: file.name, truncated });
}

/**
 * Double-checks money in vs money out using the running balance column:
 * if the balance went down by the amount, it was money out. Works for oldest-first
 * and newest-first statements. Only corrects when the balances clearly agree.
 */
export function fixDirections(list, opening = null) {
  const near = (a, b) => Math.abs(a - b) < 0.05;
  const judge = (order) => {
    const votes = [];
    for (let k = 1; k < order.length; k++) {
      const prev = order[k - 1];
      const cur = order[k];
      if (prev.balance === null || cur.balance === null) continue;
      const diff = cur.balance - prev.balance;
      if (near(diff, -cur.amount)) votes.push([cur, 'out']);
      else if (near(diff, cur.amount)) votes.push([cur, 'in']);
      else votes.push([cur, null]);
    }
    return votes;
  };
  const withBal = list.filter((t) => t.balance !== null);
  if (withBal.length < 3) return list;
  // The opening balance sits just before the oldest row, whichever way the statement is sorted.
  const start = Number.isFinite(opening) ? [{ balance: opening, amount: 0 }] : [];
  const fwd = judge([...start, ...list]);
  const rev = judge([...start, ...[...list].reverse()]);
  const score = (v) => v.filter((x) => x[1]).length / Math.max(1, v.length);
  const best = score(fwd) >= score(rev) ? fwd : rev;
  if (score(best) < 0.6) return list;
  for (const [t, dir] of best) if (dir && t.dir !== dir) t.dir = dir;
  return list;
}

export function buildDraft({ extracted, statement, account, data, fileName, truncated }) {
  const existingIds = new Set();
  for (const t of Object.values(data.txns)) {
    existingIds.add(t.id);
    for (const i of t.importIds || []) existingIds.add(i);
  }
  const manual = liveTxns(data).filter((t) => t.source === 'manual' && t.account === account.id && !(t.importIds || []).length);
  const usedManual = new Set();
  const seen = {};
  const items = extracted
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((t) => {
      const base = lineKey(account.id, t);
      const occ = (seen[base] = (seen[base] || 0) + 1);
      const id = 'i_' + fnv(base + '|' + occ, 2166136261) + fnv(base + '|' + occ, 374761393);
      const item = { ...t, id, suggested: t.category, ruled: false, status: 'new', remember: false };
      if (existingIds.has(id)) return { ...item, status: 'duplicate' };
      const match = manual
        .filter((m) => !usedManual.has(m.id) && m.dir === t.dir && Math.abs(m.amount - t.amount) < 0.01 && Math.abs(dayDiff(m.date, t.date)) <= 2)
        .sort((a, b) => Math.abs(dayDiff(a.date, t.date)) - Math.abs(dayDiff(b.date, t.date)))[0];
      if (match) {
        usedManual.add(match.id);
        return { ...item, status: 'matched', manualId: match.id, category: match.category, manualPayee: match.payee };
      }
      const rule = findRule(data.rules, t);
      if (rule && data.settings.categories.some((c) => c.id === rule.category)) {
        return { ...item, category: rule.category, ruled: true, confidence: 'high' };
      }
      return item;
    })
    .map((i) => ({ ...i, review: i.status === 'new' && !i.ruled && i.confidence !== 'high' }));

  const warnings = [];
  const out = round2(extracted.filter((t) => t.dir === 'out').reduce((s, t) => s + t.amount, 0));
  const inn = round2(extracted.filter((t) => t.dir === 'in').reduce((s, t) => s + t.amount, 0));
  const off = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 1;
  if (off(statement.total_debits, out) || off(statement.total_credits, inn)) {
    warnings.push('The totals printed on the statement don’t match what was read. A few rows may be missing or extra, so give the list a quick look.');
  } else if (account.type !== 'card' && off(round2((statement.opening_balance ?? NaN) - out + inn), statement.closing_balance)) {
    warnings.push('The opening and closing balances don’t add up with what was read. A few rows may be missing, so give the list a quick look.');
  }
  if (truncated) warnings.push('Only the first 40 pages were read. Upload long statements one month at a time.');
  const future = items.filter((i) => i.date > todayISO()).length;
  if (future) warnings.push(`${future} transaction${future > 1 ? 's have' : ' has'} a date in the future. Check the dates.`);

  return {
    id: uid('imp'),
    accountId: account.id,
    fileName,
    createdAt: Date.now(),
    statement,
    totals: { out, in: inn },
    items,
    warnings,
  };
}

/** Converts a reviewed draft into what gets saved. */
export function draftToSave(draft) {
  const newItems = draft.items.filter((i) => i.status === 'new');
  const newTxns = newItems.map((i) => ({
    id: i.id,
    date: i.date,
    amount: round2(i.amount),
    dir: i.dir,
    payee: i.payee,
    details: i.details,
    account: draft.accountId,
    category: i.category,
    note: '',
    source: 'pdf',
    importId: draft.id,
  }));
  const matched = draft.items.filter((i) => i.status === 'matched').map((i) => ({ manualId: i.manualId, importId: i.id, details: i.details }));
  const rules = [];
  for (const i of newItems) {
    if (!i.remember) continue;
    for (const key of ruleKeysFor(i)) rules.push({ key, category: i.category, label: i.payee || key });
  }
  const dates = draft.items.map((i) => i.date).sort();
  const importInfo = {
    id: draft.id,
    account: draft.accountId,
    fileName: draft.fileName,
    from: draft.statement.period_start || dates[0] || null,
    to: draft.statement.period_end || dates[dates.length - 1] || null,
    added: newTxns.length,
    at: Date.now(),
  };
  return { importInfo, newTxns, matched, rules };
}
