import { useState } from 'react';
import { Sheet, Icon, Badge, Check, useToast } from './ui';
import { CategorySheet, AccountSheet } from './pickers';
import { updateTxn, deleteTxn, rememberRule } from '../lib/actions';
import { ruleKeysFor } from '../lib/rules';
import { parseAmount, todayISO, inr } from '../lib/format';

export default function TxnSheet({ id, onClose, data }) {
  const toast = useToast();
  const t = id ? data.txns[id] : null;
  // The parent mounts this with key={id}, so the form starts fresh for each transaction.
  const [form, setForm] = useState(() => t && { payee: t.payee || '', amount: String(t.amount), dir: t.dir, category: t.category, account: t.account, date: t.date, note: t.note || '' });
  const [catOpen, setCatOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!t || !form) return null;

  const cats = Object.fromEntries(data.settings.categories.map((c) => [c.id, c]));
  const accounts = data.settings.accounts.filter((a) => !a.archived || a.id === form.account);
  const acc = data.settings.accounts.find((a) => a.id === form.account);
  const canRemember = ruleKeysFor({ ...t, payee: form.payee }).length > 0;
  const changedCat = form.category !== t.category;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const amount = parseAmount(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast('Check the amount');
    updateTxn(id, { payee: form.payee.trim(), amount, dir: form.dir, category: form.category, account: form.account, date: form.date, note: form.note.trim() });
    if (remember && canRemember) rememberRule({ ...t, payee: form.payee }, form.category, true);
    toast('Saved');
    onClose();
  };

  const del = () => {
    if (!confirmDel) return setConfirmDel(true);
    deleteTxn(id);
    toast('Deleted');
    onClose();
  };

  return (
    <Sheet open={!!t} onClose={onClose} title={t.source === 'pdf' ? 'From your statement' : 'Transaction'}>
      <div className="seg">
        <button className={form.dir === 'out' ? 'sel' : ''} onClick={() => set('dir', 'out')}>Spent</button>
        <button className={form.dir === 'in' ? 'sel' : ''} onClick={() => set('dir', 'in')}>Money in</button>
      </div>
      <div className="field">
        <div className="label">Amount</div>
        <div className="inputwrap">
          <span className="lead" style={{ fontWeight: 600 }}>₹</span>
          <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} style={{ fontSize: 20, fontWeight: 600 }} />
        </div>
      </div>
      <div className="field">
        <div className="label">Name</div>
        <input className="input" value={form.payee} onChange={(e) => set('payee', e.target.value)} placeholder="Who or what" maxLength={80} />
      </div>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="field grow">
          <div className="label">Category</div>
          <button className="select" style={{ width: '100%', textAlign: 'left' }} onClick={() => setCatOpen(true)}>
            <span className="ellipsis" style={{ display: 'block' }}>{cats[form.category]?.name || 'Pick'}</span>
          </button>
        </div>
        <div className="field grow">
          <div className="label">Account</div>
          <button className="select row" style={{ width: '100%', gap: 8 }} onClick={() => setAccOpen(true)}>
            <Badge account={acc} size={24} />
            <span className="ellipsis">{acc?.name || 'Pick'}</span>
          </button>
        </div>
      </div>
      {changedCat && canRemember && (
        <Check on={remember} onChange={setRemember}>
          Always use {cats[form.category]?.name} for {form.payee || 'this payee'}
        </Check>
      )}
      <div className="row" style={{ gap: 12 }}>
        <div className="field grow">
          <div className="label">Date</div>
          <input className="input" type="date" value={form.date} max={todayISO()} onChange={(e) => e.target.value && set('date', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <div className="label">Note</div>
        <input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional" maxLength={200} />
      </div>
      {t.details && (
        <div className="field">
          <div className="label">As shown on the statement</div>
          <div className="raw">{t.details}</div>
        </div>
      )}
      {cats[form.category]?.group === 'ignore' && <div className="help row" style={{ gap: 6 }}><Icon name="info" size={16} />Not counted in your budget, so it isn’t counted twice.</div>}
      <button className="btn primary" onClick={save}>Save</button>
      <button className="btn danger" onClick={del}>{confirmDel ? `Tap again to delete ${inr(t.amount, { exact: true })}` : 'Delete'}</button>

      <CategorySheet open={catOpen} onClose={() => setCatOpen(false)} data={data} value={form.category} onPick={(c) => { set('category', c); setRemember(true); }} dir={form.dir} />
      <AccountSheet open={accOpen} onClose={() => setAccOpen(false)} accounts={accounts} value={form.account} onPick={(a) => set('account', a)} />
    </Sheet>
  );
}
