// The budget maths. Everything is counted by the date you spent the money,
// not the date a card bill arrives.
import { GROUPS } from '../defaults';
import { monthOf, daysLeft, daysInMonth, todayISO, round2, shiftMonth } from './format';

export function categoryMap(data) {
  const m = {};
  for (const c of data.settings.categories) m[c.id] = c;
  return m;
}

export function accountMap(data) {
  const m = {};
  for (const a of data.settings.accounts) m[a.id] = a;
  return m;
}

export function liveTxns(data) {
  return Object.values(data.txns).filter((t) => !t.deleted);
}

export function txnsInMonth(data, month) {
  return liveTxns(data).filter((t) => monthOf(t.date) === month);
}

export function groupOf(data, catId) {
  const c = data.settings.categories.find((x) => x.id === catId);
  return c ? c.group : 'others';
}

/**
 * Net effect of one transaction on its category:
 * money out adds to spending, money in (refund, friend paying you back) takes it off.
 */
export function signed(t) {
  return t.dir === 'in' ? -t.amount : t.amount;
}

export function monthPlan(data, month) {
  return data.months[month] || null;
}

export function hasPlan(data, month) {
  const p = data.months[month];
  return !!(p && Object.values(p.budget || {}).some((v) => v > 0));
}

/** Everything the Home and Plan screens need for one month. */
export function summarise(data, month, today = todayISO()) {
  const cats = categoryMap(data);
  const plan = data.months[month] || { budget: {}, income: 0 };
  const budget = plan.budget || {};
  const txns = txnsInMonth(data, month);

  const spentByCat = {};
  let incomeReceived = 0;
  let salaryReceived = 0;
  for (const t of txns) {
    const c = cats[t.category] || cats.misc;
    const g = c ? c.group : 'others';
    if (g === 'ignore') continue;
    if (g === 'income') {
      const v = t.dir === 'in' ? t.amount : -t.amount;
      incomeReceived += v;
      if (t.category === 'salary') salaryReceived += v;
      continue;
    }
    const id = c ? c.id : 'misc';
    spentByCat[id] = (spentByCat[id] || 0) + signed(t);
  }

  const dl = daysLeft(month, today);
  const dim = daysInMonth(month);
  const elapsed = month < monthOf(today) ? 1 : month > monthOf(today) ? 0 : (dim - dl + 1) / dim;

  const groups = GROUPS.map((g) => {
    const list = data.settings.categories.filter((c) => c.group === g.id && (!c.archived || budget[c.id] || spentByCat[c.id]));
    const items = list.map((c) => {
      const planned = round2(budget[c.id] || 0);
      const spent = round2(spentByCat[c.id] || 0);
      return { ...c, planned, spent, left: round2(planned - spent), status: status(g.kind, planned, spent, elapsed) };
    });
    const planned = round2(items.reduce((s, x) => s + x.planned, 0));
    const spent = round2(items.reduce((s, x) => s + x.spent, 0));
    return { ...g, items, planned, spent, left: round2(planned - spent), status: status(g.kind, planned, spent, elapsed) };
  });

  const spendGroups = groups.filter((g) => g.kind === 'spend');
  const spendPlanned = round2(spendGroups.reduce((s, g) => s + g.planned, 0));
  const spendSpent = round2(spendGroups.reduce((s, g) => s + g.spent, 0));
  const spendLeft = round2(spendPlanned - spendSpent);
  const totalPlanned = round2(groups.reduce((s, g) => s + g.planned, 0));
  const income = round2(plan.income || 0);

  const overspent = groups
    .filter((g) => g.kind === 'spend')
    .flatMap((g) => g.items.filter((i) => i.spent > i.planned && i.spent > 0).map((i) => ({ ...i, over: round2(i.spent - i.planned) })))
    .sort((a, b) => b.over - a.over);

  return {
    month,
    plan,
    hasPlan: totalPlanned > 0,
    income,
    incomeReceived: round2(incomeReceived),
    salaryReceived: round2(salaryReceived),
    totalPlanned,
    unassigned: round2(income - totalPlanned),
    groups,
    spendPlanned,
    spendSpent,
    spendLeft,
    daysLeft: dl,
    perDay: dl > 0 ? Math.max(0, Math.floor(spendLeft / dl)) : 0,
    overspent,
    txnCount: txns.length,
  };
}

function status(kind, planned, spent, elapsed) {
  if (kind === 'save') {
    if (planned <= 0) return spent > 0 ? 'funded' : 'none';
    return spent >= planned ? 'funded' : 'ok';
  }
  if (planned <= 0) return spent > 0 ? 'over' : 'none';
  if (spent > planned) return 'over';
  if (spent / planned > Math.min(1, elapsed + 0.12) && spent / planned > 0.5) return 'watch';
  return 'ok';
}

/** Most recent earlier month that has a plan, for "Copy last month". */
export function previousPlanMonth(data, month) {
  for (let i = 1; i <= 24; i++) {
    const m = shiftMonth(month, -i);
    if (hasPlan(data, m)) return m;
  }
  return null;
}

/** Category ids you've used most in the last few weeks, for quick add. */
export function recentCategories(data, limit = 8) {
  const counts = {};
  const txns = liveTxns(data)
    .filter((t) => t.dir === 'out')
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 150);
  for (const t of txns) counts[t.category] = (counts[t.category] || 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, limit);
}
