import { useMemo, useState } from 'react';
import { Icon, Badge, Sheet } from '../components/ui';
import { CategorySheet } from '../components/pickers';
import { liveTxns, categoryMap, accountMap } from '../lib/budget';
import { inr, dayLabel, monthOf, monthName, currentMonth } from '../lib/format';
import { useApp } from '../lib/store';

export function TxnRow({ t, data, onClick }) {
  const cats = categoryMap(data);
  const accs = accountMap(data);
  const c = cats[t.category];
  const a = accs[t.account];
  const ignored = c && c.group === 'ignore';
  return (
    <button className="txn" onClick={onClick}>
      <Badge account={a} />
      <div className="grow">
        <div className="p ellipsis">{t.payee || c?.name || 'Transaction'}</div>
        <div className="m ellipsis">{c ? c.name : 'Uncategorised'} · {a ? a.name : 'Unknown account'}</div>
      </div>
      <div>
        <div className={'a' + (ignored ? ' ignored' : t.dir === 'in' ? ' in' : '')}>{t.dir === 'in' ? '+' : ''}{inr(t.amount, { exact: true })}</div>
        <div className="src"><Icon name={t.source === 'pdf' ? 'download' : 'edit'} />{t.source === 'pdf' ? 'Statement' : 'Added'}</div>
      </div>
    </button>
  );
}

export default function Transactions({ ui, initialFilter }) {
  const { data } = useApp();
  const [q, setQ] = useState('');
  const [month, setMonth] = useState(initialFilter?.month || currentMonth());
  const [cat, setCat] = useState(initialFilter?.category || null);
  const [acc, setAcc] = useState(null);
  const [sheet, setSheet] = useState(null); // 'month' | 'cat' | 'acc'
  const cats = categoryMap(data);
  const accs = accountMap(data);

  const all = useMemo(() => liveTxns(data), [data]);
  const months = useMemo(() => {
    const set = new Set(all.map((t) => monthOf(t.date)));
    set.add(currentMonth());
    return [...set].sort().reverse();
  }, [all]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((t) => (month === 'all' || monthOf(t.date) === month) && (!cat || t.category === cat) && (!acc || t.account === acc))
      .filter((t) => {
        if (!needle) return true;
        const hay = `${t.payee} ${t.details} ${t.note} ${cats[t.category]?.name || ''} ${accs[t.account]?.name || ''} ${t.amount}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
  }, [all, q, month, cat, acc, cats, accs]);

  const days = useMemo(() => {
    const out = [];
    for (const t of list) {
      let d = out[out.length - 1];
      if (!d || d.date !== t.date) out.push((d = { date: t.date, items: [], total: 0 }));
      d.items.push(t);
      const g = cats[t.category]?.group;
      if (g !== 'ignore' && g !== 'income') d.total += t.dir === 'in' ? -t.amount : t.amount;
    }
    return out.slice(0, 120);
  }, [list, cats]);

  const totals = useMemo(() => {
    let out = 0;
    let inn = 0;
    for (const t of list) {
      const g = cats[t.category]?.group;
      if (g === 'ignore') continue;
      if (t.dir === 'in') inn += t.amount;
      else out += t.amount;
    }
    return { out, inn };
  }, [list, cats]);

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="title">Transactions</h1>
        <button className="pill" onClick={() => ui.openImport()}><Icon name="upload_file" />Statement</button>
      </div>
      <div className="inputwrap">
        <span className="lead"><Icon name="search" size={20} /></span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, note or amount" type="search" />
      </div>
      <div className="chips" style={{ marginTop: -6 }}>
        <button className="chip small sel" onClick={() => setSheet('month')}>{month === 'all' ? 'All time' : monthName(month)} <Icon name="expand_more" /></button>
        <button className={'chip small' + (cat ? ' sel' : '')} onClick={() => (cat ? setCat(null) : setSheet('cat'))}>
          {cat ? cats[cat]?.name : 'Category'} <Icon name={cat ? 'close' : 'expand_more'} />
        </button>
        <button className={'chip small' + (acc ? ' sel' : '')} onClick={() => (acc ? setAcc(null) : setSheet('acc'))}>
          {acc ? accs[acc]?.name : 'Account'} <Icon name={acc ? 'close' : 'expand_more'} />
        </button>
      </div>

      {list.length > 0 && (
        <div className="row small muted" style={{ marginTop: -6, justifyContent: 'space-between' }}>
          <span>{list.length} transaction{list.length === 1 ? '' : 's'}</span>
          <span>Out {inr(totals.out)} · In {inr(totals.inn)}</span>
        </div>
      )}

      {days.length === 0 && (
        <div className="card empty">
          <Icon name="receipt_long" />
          <div>{q || cat || acc ? 'Nothing matches. Try clearing the filters.' : 'No transactions here yet.'}</div>
        </div>
      )}

      {days.map((d) => (
        <div key={d.date}>
          <div className="daygroup"><span>{dayLabel(d.date)}</span><span>{d.total > 0 ? inr(d.total) : ''}</span></div>
          <div className="card list">
            {d.items.map((t) => <TxnRow key={t.id} t={t} data={data} onClick={() => ui.openTxn(t.id)} />)}
          </div>
        </div>
      ))}
      {list.length > 0 && days.length === 120 && <div className="help" style={{ textAlign: 'center' }}>Showing the latest 120 days. Pick a month to see older ones.</div>}

      <Sheet open={sheet === 'month'} onClose={() => setSheet(null)} title="Show month">
        <div className="card list">
          {[...months, 'all'].map((m) => (
            <button key={m} className="setting" onClick={() => { setMonth(m); setSheet(null); }}>
              <span className="grow t">{m === 'all' ? 'All time' : monthName(m, true)}</span>
              {m === month && <Icon name="check" style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      </Sheet>
      <CategorySheet open={sheet === 'cat'} onClose={() => setSheet(null)} data={data} value={cat} onPick={setCat} title="Show category" />
      <Sheet open={sheet === 'acc'} onClose={() => setSheet(null)} title="Show account">
        <div className="card list">
          {data.settings.accounts.map((a) => (
            <button key={a.id} className="setting" onClick={() => { setAcc(a.id); setSheet(null); }}>
              <Badge account={a} size={34} />
              <span className="grow t">{a.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
