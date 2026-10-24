import { lazy, Suspense, useEffect, useState } from 'react';
import { Icon, Spinner, Sheet, Page, ToastProvider, useToast } from './components/ui';
import QuickAdd from './components/QuickAdd';
import TxnSheet from './components/TxnSheet';
import Home from './screens/Home';
import Transactions from './screens/Transactions';
import Plan from './screens/Plan';
import More from './screens/More';
import Setup from './screens/Setup';
import { useApp, boot, retryBoot } from './lib/store';
import { summarise } from './lib/budget';
import { moveBudget, setBudget } from './lib/actions';
import { inr, currentMonth } from './lib/format';

// The statement reader (with the PDF library) loads only when you open it.
const Import = lazy(() => import('./screens/Import'));

const TABS = [
  ['home', 'Home', 'home'],
  ['txns', 'Transactions', 'receipt_long'],
  ['plan', 'Plan', 'event_note'],
  ['more', 'More', 'more_horiz'],
];

export default function App() {
  const { phase } = useApp();
  const [wizard, setWizard] = useState(null);
  useEffect(() => {
    boot();
  }, []);
  useEffect(() => {
    if (phase === 'setup' && wizard === null) setWizard(true);
  }, [phase, wizard]);

  let body;
  if (wizard) body = <Setup onDone={() => setWizard(false)} />;
  else if (phase === 'ready') body = <Main />;
  else if (phase === 'offline') body = <Offline />;
  else body = <div className="center-screen" style={{ alignItems: 'center' }}><Spinner size={32} /></div>;
  return <ToastProvider>{body}</ToastProvider>;
}

function Offline() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen setup">
      <div className="setup-ic"><Icon name="cloud_off" /></div>
      <h1>Can’t reach GitHub</h1>
      <p>Your data is saved on GitHub and this device doesn’t have a copy yet. Connect to the internet and try again.</p>
      <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await retryBoot(); setBusy(false); }}>
        {busy ? <><Spinner /> Trying…</> : 'Try again'}
      </button>
    </div>
  );
}

function Main() {
  const { data } = useApp();
  const [tab, setTab] = useState('home');
  const [quick, setQuick] = useState(false);
  const [txnId, setTxnId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [cover, setCover] = useState(null);
  const [txFilter, setTxFilter] = useState(null);

  const ui = {
    setTab: (t, filter) => {
      setTxFilter(filter || null);
      setTab(t);
      window.scrollTo(0, 0);
    },
    openQuickAdd: () => setQuick(true),
    openTxn: (id) => setTxnId(id),
    openImport: () => setImporting(true),
    openCover: (cat) => setCover(cat),
  };

  return (
    <>
      {tab === 'home' && <Home ui={ui} />}
      {tab === 'txns' && <Transactions ui={ui} initialFilter={txFilter} key={JSON.stringify(txFilter)} />}
      {tab === 'plan' && <Plan ui={ui} />}
      {tab === 'more' && <More ui={ui} />}

      {(tab === 'home' || tab === 'txns') && (
        <button className="fab" onClick={ui.openQuickAdd} aria-label="Add a spend">
          <Icon name="add" />
        </button>
      )}

      <nav className="tabbar">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'sel' : ''} onClick={() => ui.setTab(id)} aria-current={tab === id ? 'page' : undefined}>
            <span className="ic"><Icon name={icon} fill={tab === id} /></span>
            {label}
          </button>
        ))}
      </nav>

      <QuickAdd open={quick} onClose={() => setQuick(false)} data={data} />
      {txnId && data.txns[txnId] && <TxnSheet key={txnId} id={txnId} data={data} onClose={() => setTxnId(null)} />}
      <Page open={importing} onClose={() => setImporting(false)}>
        {importing && (
          <Suspense fallback={<div className="center-screen" style={{ alignItems: 'center' }}><Spinner size={32} /></div>}>
            <Import onClose={() => { setImporting(false); setTab('home'); }} />
          </Suspense>
        )}
      </Page>
      <CoverSheet catId={cover} onClose={() => setCover(null)} data={data} />
    </>
  );
}

function CoverSheet({ catId, onClose, data }) {
  const toast = useToast();
  const month = currentMonth();
  if (!catId) return <Sheet open={false} onClose={onClose} />;
  const s = summarise(data, month);
  const item = s.groups.flatMap((g) => g.items).find((i) => i.id === catId);
  if (!item) return <Sheet open={false} onClose={onClose} />;
  const over = Math.max(0, item.spent - item.planned);
  // Same group first (another Want for a Want), then the rest; most money left first.
  const sources = s.groups
    .filter((g) => g.kind === 'spend')
    .flatMap((g) => g.items.map((i) => ({ ...i, groupName: g.name })))
    .filter((i) => i.id !== catId && i.left > 0)
    .sort((a, b) => (b.group === item.group) - (a.group === item.group) || b.left - a.left);

  const take = (from) => {
    const amt = Math.min(over, from.left);
    moveBudget(month, from.id, catId, amt);
    toast(`Moved ${inr(amt)} from ${from.name}`);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={`Cover ${inr(over)} for ${item.name}`}>
      <div className="muted">Move money from a category that has some left, so this month still adds up and next month’s salary stays untouched.</div>
      {s.unassigned > 0 && (
        <button className="setting card" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }} onClick={() => { const amt = Math.min(over, s.unassigned); setBudget(month, catId, item.planned + amt); toast(`Used ${inr(amt)} of unplanned money`); onClose(); }}>
          <span className="ic"><Icon name="wallet" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Unplanned money</span><span className="d">{inr(s.unassigned)} not given a job yet</span></span>
          <Icon name="chevron_right" />
        </button>
      )}
      {sources.length ? (
        <div className="card list" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
          {sources.map((i) => (
            <button key={i.id} className="setting" onClick={() => take(i)}>
              <span className="grow"><span className="t" style={{ display: 'block' }}>{i.name}</span><span className="d">{i.groupName} · {inr(i.left)} left</span></span>
              <span className="small" style={{ fontWeight: 600 }}>Take {inr(Math.min(over, i.left))}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="callout warn">No other category has money left this month. You could lower a Savings or Investments amount in Plan.</div>
      )}
    </Sheet>
  );
}
