import { useEffect, useRef, useState } from 'react';
import { Icon, Sheet, useToast } from '../components/ui';
import { summarise, previousPlanMonth } from '../lib/budget';
import { setBudget, setIncome, copyPlan, confirmPlan, addCategory, renameCategory, archiveCategory } from '../lib/actions';
import { inr, currentMonth, shiftMonth, monthName, parseAmount } from '../lib/format';
import { useApp } from '../lib/store';

export function AmountInput({ value, onCommit, className = 'amtinput', big = false, label }) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef();
  useEffect(() => {
    if (!focus) setText(value ? String(value) : '');
  }, [value, focus]);
  const commit = () => {
    const n = parseAmount(text);
    const v = Number.isFinite(n) ? n : 0;
    if (v !== (value || 0)) onCommit(v);
  };
  const shown = focus ? text : value ? inr(value).slice(1) : '';
  return (
    <input
      ref={ref}
      aria-label={label}
      className={className + (!value && !focus ? ' zero' : '')}
      inputMode="decimal"
      value={focus ? shown : value ? '₹' + shown : ''}
      placeholder="₹0"
      onFocus={(e) => { setFocus(true); setText(value ? String(value) : ''); setTimeout(() => e.target.select(), 0); }}
      onChange={(e) => setText(e.target.value.replace(/[^0-9.]/g, ''))}
      onBlur={() => { commit(); setFocus(false); }}
      onKeyDown={(e) => e.key === 'Enter' && ref.current.blur()}
      style={big ? { fontSize: 30, fontWeight: 700, width: '100%', height: 56, textAlign: 'left', letterSpacing: '-0.03em' } : undefined}
    />
  );
}

export default function Plan({ ui }) {
  const { data } = useApp();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState({ needs: true, wants: true });
  const [edit, setEdit] = useState(false);
  const [nameSheet, setNameSheet] = useState(null); // { mode: 'add'|'rename', group, id, name }
  const s = summarise(data, month);
  const prev = previousPlanMonth(data, month);
  const confirmed = !!data.months[month]?.confirmed;

  const doCopy = () => {
    copyPlan(prev, month);
    setOpen({ needs: true, wants: true, savings: true, investments: true, others: true });
    toast(`Copied your ${monthName(prev)} plan`);
  };

  return (
    <div className="screen">
      <div className="topbar" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 2 }}>
          <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" style={{ marginLeft: -12 }}><Icon name="arrow_back" /></button>
          <h1 className="title">{monthName(month)} plan</h1>
          <button className="iconbtn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><Icon name="arrow_forward" /></button>
        </div>
      </div>

      {prev && !s.hasPlan && (
        <button className="alert blue" style={{ textAlign: 'left' }} onClick={doCopy}>
          <Icon name="content_copy" />
          <div className="grow"><div className="t">Copy your {monthName(prev)} plan</div><div className="d">Then change only what’s different.</div></div>
          <Icon name="chevron_right" />
        </button>
      )}

      <div className="card pad stack" style={{ gap: 6 }}>
        <div className="small muted">Income for {monthName(month)}</div>
        <AmountInput value={s.income} onCommit={(v) => setIncome(month, v)} big className="amtinput" label="Income" />
        {s.incomeReceived > 0 && Math.round(s.incomeReceived) !== Math.round(s.income) && (
          <div className="row small" style={{ gap: 8 }}>
            <span className="muted">Received so far: {inr(s.incomeReceived)}</span>
            <button className="link" onClick={() => setIncome(month, Math.round(s.incomeReceived))}>Use this</button>
          </div>
        )}
        {!s.income && !s.incomeReceived && <div className="help">Your salary and any other money you expect this month.</div>}
      </div>

      {s.income > 0 && (
        s.unassigned > 0.5 ? (
          <div className="alert amber"><Icon name="error" fill /><div className="grow"><div className="t">{inr(s.unassigned)} not planned yet</div><div className="d">Give every rupee a job below.</div></div></div>
        ) : s.unassigned < -0.5 ? (
          <div className="alert red"><Icon name="error" fill /><div className="grow"><div className="t">{inr(-s.unassigned)} more than your income</div><div className="d">Lower a few amounts so it fits.</div></div></div>
        ) : (
          <div className="alert green">
            <Icon name="check_circle" fill />
            <div className="grow"><div className="t">₹0 unplanned</div><div className="d">Every rupee has a job</div></div>
            {confirmed ? <span className="status ok"><Icon name="check" />Confirmed</span> : <button className="btn green small" onClick={() => { confirmPlan(month); toast('Plan confirmed. Spend worry-free!'); }}>Confirm plan</button>}
          </div>
        )
      )}

      {s.groups.map((g) => {
        const isOpen = !!open[g.id];
        const items = g.items.filter((i) => !i.archived || i.planned || i.spent);
        return (
          <div key={g.id} className="card">
            <button className="row" style={{ width: '100%', padding: '16px 18px', textAlign: 'left' }} onClick={() => setOpen({ ...open, [g.id]: !isOpen })} aria-expanded={isOpen}>
              <span className="grow" style={{ fontWeight: 600, fontSize: 17 }}>{g.name}</span>
              {s.income > 0 && <span className="small muted">{Math.round((g.planned / s.income) * 100)}%</span>}
              <span style={{ fontWeight: 700, fontSize: 17 }}>{inr(g.planned)}</span>
              <Icon name={isOpen ? 'expand_less' : 'expand_more'} style={{ color: 'var(--muted)' }} />
            </button>
            {isOpen && (
              <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
                {items.map((i) => (
                  <div key={i.id} className="row" style={{ padding: '10px 18px', minHeight: 60 }}>
                    {edit && (
                      <button className="iconbtn" style={{ width: 34, height: 34, marginLeft: -8, color: 'var(--red)' }} aria-label={`Remove ${i.name}`} onClick={() => { archiveCategory(i.id); if (i.planned) setBudget(month, i.id, 0); toast(`Removed ${i.name}`); }}>
                        <Icon name="delete" size={20} />
                      </button>
                    )}
                    <div className="grow" onClick={() => edit && setNameSheet({ mode: 'rename', id: i.id, name: i.name })}>
                      <div style={{ fontWeight: 500 }}>{i.name}{edit && <Icon name="edit" size={15} style={{ display: 'inline', marginLeft: 6, verticalAlign: '-2px', color: 'var(--muted)' }} />}</div>
                      {i.spent !== 0 && <div className="tiny" style={{ color: i.spent > i.planned && g.kind === 'spend' ? 'var(--red)' : 'var(--muted)' }}>{g.kind === 'save' ? 'done' : 'spent'} {inr(i.spent)}</div>}
                    </div>
                    <AmountInput value={i.planned} onCommit={(v) => setBudget(month, i.id, v)} label={`${i.name} amount`} />
                  </div>
                ))}
                {edit && (
                  <button className="row link" style={{ padding: '14px 18px', width: '100%' }} onClick={() => setNameSheet({ mode: 'add', group: g.id, name: '' })}>
                    <Icon name="add" size={20} /> Add a category
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button className="btn outline" onClick={() => { setEdit(!edit); setOpen({ needs: true, wants: true, savings: true, investments: true, others: true }); }}>
        <Icon name={edit ? 'check' : 'tune'} /> {edit ? 'Done editing categories' : 'Edit categories'}
      </button>
      {prev && s.hasPlan && <button className="btn secondary" onClick={doCopy}><Icon name="content_copy" /> Copy {monthName(prev)} plan again</button>}

      <NameSheet value={nameSheet} onClose={() => setNameSheet(null)} />
    </div>
  );
}

function NameSheet({ value, onClose }) {
  const [name, setName] = useState('');
  useEffect(() => {
    if (value) setName(value.name || '');
  }, [value]);
  const save = () => {
    if (!name.trim()) return;
    if (value.mode === 'add') addCategory(value.group, name);
    else renameCategory(value.id, name);
    onClose();
  };
  return (
    <Sheet open={!!value} onClose={onClose} title={value?.mode === 'add' ? 'New category' : 'Rename category'}>
      <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Pet care" maxLength={40} />
      <button className="btn primary" onClick={save}>Save</button>
    </Sheet>
  );
}
