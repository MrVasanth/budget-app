import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, Icon, useToast } from './ui';
import { CategorySheet, AccountChips } from './pickers';
import { addTxn } from '../lib/actions';
import { recentCategories } from '../lib/budget';
import { inr, todayISO, shortDate } from '../lib/format';

const LAST_ACC = 'budget.lastAccount';
const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const DEFAULT_OUT = ['eating_out', 'groceries', 'transport', 'shopping', 'bills', 'health', 'entertainment', 'household'];
const DEFAULT_IN = ['other_income', 'salary', 'eating_out', 'shopping', 'travel'];

export default function QuickAdd({ open, onClose, data }) {
  const toast = useToast();
  // Cash first: it's the one you'll add by hand most often.
  const accounts = data.settings.accounts.filter((a) => !a.archived).sort((a, b) => (b.type === 'cash') - (a.type === 'cash'));
  const [dir, setDir] = useState('out');
  const [amt, setAmt] = useState('');
  const [cat, setCat] = useState(null);
  const [acc, setAcc] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const dateRef = useRef();

  useEffect(() => {
    if (!open) return;
    setDir('out');
    setAmt('');
    setCat(null);
    setDate(todayISO());
    setPayee('');
    setNote('');
    setShowNote(false);
    const last = store.get(LAST_ACC);
    setAcc(accounts.some((a) => a.id === last) ? last : accounts.find((a) => a.id === 'cash')?.id || accounts[0]?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the picked account visible when it's far along the row.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      document.querySelectorAll('.sheet .chips .chip.sel').forEach((el) => el.scrollIntoView({ inline: 'nearest', block: 'nearest' }));
    });
  }, [open, acc]);

  const catIds = useMemo(() => {
    const valid = new Set(data.settings.categories.filter((c) => !c.archived).map((c) => c.id));
    const base = dir === 'in' ? DEFAULT_IN : [...recentCategories(data), ...DEFAULT_OUT];
    const list = [...new Set(base)].filter((id) => valid.has(id)).slice(0, 8);
    if (cat && !list.includes(cat)) list.unshift(cat);
    return list;
  }, [data, dir, cat]);

  const cats = Object.fromEntries(data.settings.categories.map((c) => [c.id, c]));
  const value = parseFloat(amt || '0');

  const press = (k) => {
    setAmt((s) => {
      if (k === 'del') return s.slice(0, -1);
      if (k === '.') return s.includes('.') ? s : (s || '0') + '.';
      if (s.includes('.') && s.split('.')[1].length >= 2) return s;
      if (s.replace('.', '').length >= 8) return s;
      return s === '0' ? k : s + k;
    });
  };

  const display = amt ? (amt.includes('.') ? inr(Math.floor(value)).slice(1) + '.' + amt.split('.')[1] : inr(value).slice(1)) : '0';

  const save = () => {
    if (!value) return toast('Type the amount first');
    if (!cat) return toast('Pick a category');
    if (!acc) return toast('Pick how you paid');
    addTxn({ date, amount: value, dir, category: cat, account: acc, payee: payee || cats[cat]?.name || '', note });
    store.set(LAST_ACC, acc);
    toast(`Saved ${inr(value, { exact: true })}`);
    onClose();
  };

  const accName = accounts.find((a) => a.id === acc)?.name;
  const hint = acc === 'cash' ? 'Paid in cash' : accounts.find((a) => a.id === acc)?.type === 'card' ? `Charged to ${accName}. It counts now, not when the bill comes.` : accName ? `Paid from ${accName}` : '';

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="seg" style={{ width: 230 }}>
          <button className={dir === 'out' ? 'sel' : ''} onClick={() => { setDir('out'); setCat(null); }}>Spent</button>
          <button className={dir === 'in' ? 'sel' : ''} onClick={() => { setDir('in'); setCat(null); }}>Money in</button>
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close" style={{ background: 'var(--sunk)', width: 38, height: 38 }}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className={'amount-display' + (amt ? '' : ' empty')} aria-live="polite">
        <span className="r">₹</span>
        {display}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="label">Category</div>
        <div className="chips">
          {catIds.map((id) => (
            <button key={id} className={'chip' + (cat === id ? ' sel' : '')} onClick={() => setCat(id)}>{cats[id]?.name}</button>
          ))}
          <button className="chip" onClick={() => setPicker(true)}><Icon name="category" /> All</button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="label">{dir === 'in' ? 'Received in' : 'Paid with'}</div>
        <AccountChips accounts={accounts} value={acc} onPick={setAcc} />
        {hint && dir === 'out' && <div className="help row" style={{ gap: 6 }}><Icon name="info" size={16} />{hint}</div>}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="chip small" style={{ position: 'relative', overflow: 'hidden' }}>
          <Icon name="calendar_today" />
          {date === todayISO() ? `Today, ${shortDate(date)}` : shortDate(date)}
          <input
            ref={dateRef}
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%' }}
            aria-label="Date"
          />
        </label>
        <button className={'chip small' + (showNote ? ' sel' : '')} onClick={() => setShowNote(!showNote)}><Icon name="notes" /> What was it?</button>
      </div>
      {showNote && (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input sunk" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Name, e.g. Chai, Auto, Ravi" maxLength={80} />
          <input className="input sunk" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={200} />
        </div>
      )}

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
          <button key={k} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}>
            {k === 'del' ? <Icon name="backspace" /> : k}
          </button>
        ))}
      </div>

      <button className="btn primary" onClick={save}>Save {value ? inr(value, { exact: true }) : ''}</button>

      <CategorySheet open={picker} onClose={() => setPicker(false)} data={data} value={cat} onPick={setCat} dir={dir} />
    </Sheet>
  );
}
