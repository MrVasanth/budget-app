import { useState } from 'react';
import { Icon, StatusChip, barColor } from '../components/ui';
import { TxnRow } from './Transactions';
import { summarise, liveTxns } from '../lib/budget';
import { inr, currentMonth, monthName, longToday } from '../lib/format';
import { useApp } from '../lib/store';

export default function Home({ ui }) {
  const { data, sync, hasDraft } = useApp();
  const month = currentMonth();
  const s = summarise(data, month);
  const [open, setOpen] = useState({});
  const recent = liveTxns(data)
    .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.createdAt || 0) - (a.createdAt || 0)))
    .slice(0, 5);
  const noKey = !data.apiKey?.value;
  const pct = s.spendPlanned > 0 ? Math.min(100, Math.max(0, (s.spendSpent / s.spendPlanned) * 100)) : 0;

  return (
    <div className="screen">
      <div className="topbar">
        <div>
          <div className="sub">{longToday()}</div>
          <h1 className="title">{monthName(month)}</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <SyncPill sync={sync} onClick={() => ui.setTab('more')} />
          <span className="pill"><Icon name="calendar_today" />{s.daysLeft} {s.daysLeft === 1 ? 'day' : 'days'} left</span>
        </div>
      </div>

      {s.hasPlan ? (
        <div className="hero">
          <div className="k">Left to spend this month</div>
          <div className="big"><span className="r">{s.spendLeft < 0 ? '−₹' : '₹'}</span>{inr(Math.abs(s.spendLeft)).slice(1)}</div>
          <div className="s">{s.spendLeft < 0 ? 'Over your plan for Needs, Wants and Others' : `of ${inr(s.spendPlanned)} for Needs, Wants and Others`}</div>
          <div className="bar"><div style={{ width: pct + '%', background: s.spendLeft < 0 ? 'oklch(0.75 0.14 25)' : '#fff' }} /></div>
          <div className="inner">
            <span>About <b>{inr(s.perDay)}</b> a day</span>
            <span style={{ opacity: 0.75 }}>for {s.daysLeft} {s.daysLeft === 1 ? 'day' : 'days'}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="hero">
            <div className="k">Spent so far this month</div>
            <div className="big"><span className="r">₹</span>{inr(s.spendSpent).slice(1)}</div>
            <div className="s">{s.txnCount} transaction{s.txnCount === 1 ? '' : 's'}</div>
          </div>
          <div className="card pad stack" style={{ background: 'var(--accentSoft)', boxShadow: 'none', gap: 14 }}>
            <div className="setup-ic" style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--surface)' }}><Icon name="event_note" /></div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>No plan for {monthName(month)} yet</div>
            <div className="muted">Split this month’s income across Needs, Wants, Savings, Investments and Others. It takes two minutes.</div>
            <button className="btn primary" onClick={() => ui.setTab('plan')}>Set up this month’s plan <Icon name="arrow_forward" /></button>
          </div>
        </>
      )}

      {sync.status === 'error' && (
        <button className="alert red" style={{ textAlign: 'left' }} onClick={() => ui.setTab('more')}>
          <Icon name="cloud_off" />
          <div className="grow"><div className="t">Your changes aren’t being saved</div><div className="d">They’re kept on this phone. Tap to fix.</div></div>
          <Icon name="chevron_right" />
        </button>
      )}

      {hasDraft && (
        <button className="alert blue" style={{ textAlign: 'left' }} onClick={() => ui.openImport()}>
          <Icon name="task_alt" />
          <div className="grow"><div className="t">Finish checking your statement</div><div className="d">You left before saving it.</div></div>
          <Icon name="chevron_right" />
        </button>
      )}

      {s.overspent.slice(0, 2).map((o) => (
        <div key={o.id} className="alert red">
          <Icon name="error" fill />
          <div className="grow">
            <div className="t">{o.name} is over by {inr(o.over)}</div>
            <div className="d">Spent {inr(o.spent)} of {inr(o.planned)}</div>
          </div>
          <button className="chipbtn" onClick={() => ui.openCover(o.id)}>Fix</button>
        </div>
      ))}

      <button className="card row" style={{ padding: 16, textAlign: 'left', gap: 14 }} onClick={() => ui.openImport()}>
        <span className="setup-ic" style={{ width: 46, height: 46, borderRadius: 14 }}><Icon name="upload_file" /></span>
        <span className="grow">
          <span style={{ display: 'block', fontWeight: 600 }}>Upload a statement</span>
          <span className="small muted">{noKey ? 'Add your Claude key first, in More' : 'PDF from your bank or credit card'}</span>
        </span>
        <Icon name="chevron_right" style={{ color: 'var(--faint)' }} />
      </button>

      {s.hasPlan && (
        <>
          <div className="section-head"><h2>Envelopes</h2><button className="link" onClick={() => ui.setTab('plan')}>Plan</button></div>
          <div className="card list">
            {s.groups.map((g) => {
              const save = g.kind === 'save';
              const w = g.planned > 0 ? Math.min(100, (g.spent / g.planned) * 100) : g.spent > 0 ? 100 : 0;
              const isOpen = !!open[g.id];
              return (
                <div key={g.id}>
                  <button className="env" onClick={() => setOpen({ ...open, [g.id]: !isOpen })} aria-expanded={isOpen}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</span>
                      <span className="row" style={{ gap: 6 }}><StatusChip status={g.status} /><Icon name={isOpen ? 'expand_less' : 'expand_more'} style={{ color: 'var(--faint)' }} /></span>
                    </div>
                    <div>
                      {save ? (
                        <><span className="amt">{inr(g.spent)}</span><span className="of">of {inr(g.planned)} done</span></>
                      ) : (
                        <><span className="amt" style={{ color: g.left < 0 ? 'var(--red)' : undefined }}>{inr(g.left)}</span><span className="of">left of {inr(g.planned)}</span></>
                      )}
                    </div>
                    <div className="progress"><div style={{ width: w + '%', background: barColor(g.status) }} /></div>
                  </button>
                  {isOpen && (
                    <div className="env-sub">
                      {g.items.filter((i) => i.planned || i.spent).map((i) => (
                        <div key={i.id} className="line">
                          <span className="n ellipsis">{i.name}</span>
                          <span className="small muted">{save ? `${inr(i.spent)} of ${inr(i.planned)}` : `spent ${inr(i.spent)}`}</span>
                          {!save && <span className={'v' + (i.left < 0 ? ' over' : '')}>{i.left < 0 ? `${inr(-i.left)} over` : `${inr(i.left)} left`}</span>}
                        </div>
                      ))}
                      {!g.items.some((i) => i.planned || i.spent) && <div className="small muted">Nothing planned or spent here yet.</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="section-head"><h2>Recent</h2>{recent.length > 0 && <button className="link" onClick={() => ui.setTab('txns')}>See all</button>}</div>
      {recent.length ? (
        <div className="card list">
          {recent.map((t) => <TxnRow key={t.id} t={t} data={data} onClick={() => ui.openTxn(t.id)} />)}
        </div>
      ) : (
        <div className="card empty">
          <Icon name="receipt_long" />
          <div>No transactions yet. Upload a statement or tap <b>+</b> to add a cash spend.</div>
        </div>
      )}
    </div>
  );
}

export function SyncPill({ sync, onClick }) {
  const label = { saving: 'Saving', saved: 'Saved', offline: 'Offline', error: 'Not saved', idle: 'Saved' }[sync.status] || 'Saved';
  return (
    <button className="pill" onClick={onClick} aria-label={`Sync status: ${label}`} title={sync.error || label}
      style={{ color: sync.status === 'error' ? 'var(--red)' : sync.status === 'saving' ? 'var(--accent)' : sync.status === 'offline' ? 'var(--muted)' : 'var(--green)' }}>
      <Icon name={sync.status === 'error' || sync.status === 'offline' ? 'cloud_off' : sync.status === 'saving' ? 'sync' : 'cloud_done'} className={sync.status === 'saving' ? 'spin' : ''} />
      {sync.status === 'error' || sync.status === 'offline' ? label : ''}
    </button>
  );
}
