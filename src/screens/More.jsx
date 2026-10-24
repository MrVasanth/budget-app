import { useState } from 'react';
import { Icon, Badge, Sheet, Spinner, PasswordInput, useToast } from '../components/ui';
import { ClaudeKeyForm } from './Setup';
import { InstallHelp } from './Install';
import { useApp, syncNow, replaceToken, forgetDevice, exportBackup } from '../lib/store';
import { saveAccount, archiveAccount, setApiKey, deleteRule } from '../lib/actions';
import { liveTxns, categoryMap, accountMap } from '../lib/budget';
import { timeAgo, todayISO, uid } from '../lib/format';
import { newTokenUrl } from '../lib/github';
import { ALL_GROUPS, ACCOUNT_HUES } from '../defaults';

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function toCSV(data) {
  const cats = categoryMap(data);
  const accs = accountMap(data);
  const groups = Object.fromEntries(ALL_GROUPS.map((g) => [g.id, g.name]));
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Date', 'Name', 'Category', 'Group', 'Account', 'Money', 'Amount', 'Note', 'Added by', 'Statement text']];
  for (const t of liveTxns(data).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const c = cats[t.category];
    rows.push([t.date, t.payee, c?.name, groups[c?.group], accs[t.account]?.name, t.dir === 'in' ? 'In' : 'Out', t.amount, t.note, t.source === 'pdf' ? 'Statement' : 'You', t.details]);
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}

export default function More() {
  const { data, sync, repo } = useApp();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const [editAcc, setEditAcc] = useState(null);
  const accounts = data.settings.accounts.filter((a) => !a.archived);
  // One payee can be remembered by both its UPI ID and its name; show it once.
  const rules = Object.values(
    Object.values(data.rules)
      .filter((r) => !r.deleted)
      .reduce((acc, r) => {
        const k = r.label + '|' + r.category;
        (acc[k] = acc[k] || { label: r.label, category: r.category, keys: [] }).keys.push(r.key);
        return acc;
      }, {}),
  );
  const cats = categoryMap(data);
  const hasKey = !!data.apiKey?.value;

  const statusText = {
    saved: `Saved ${timeAgo(sync.lastSaved)}`,
    idle: 'Saved',
    saving: 'Saving…',
    offline: 'Offline. Changes are kept on this phone and saved when you’re back online.',
    error: sync.error || 'Couldn’t save',
  }[sync.status];

  return (
    <div className="screen">
      <div className="topbar"><h1 className="title">More</h1></div>

      {sync.status === 'error' && (
        <button className="alert red" style={{ textAlign: 'left' }} onClick={() => setSheet('token')}>
          <Icon name="cloud_off" />
          <div className="grow"><div className="t">Your changes aren’t being saved</div><div className="d">{sync.error}</div></div>
          <Icon name="chevron_right" />
        </button>
      )}

      <div className="label">Statement reader</div>
      <div className="card list">
        <button className="setting" onClick={() => setSheet('claude')}>
          <span className="ic"><Icon name="auto_awesome" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Claude key</span><span className="d">{hasKey ? 'Connected. Statements are read automatically.' : 'Not added yet. Needed to read PDFs.'}</span></span>
          <Icon name="chevron_right" style={{ color: 'var(--faint)' }} />
        </button>
        <button className="setting" onClick={() => setSheet('rules')}>
          <span className="ic"><Icon name="bolt" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Remembered payees</span><span className="d">{rules.length ? `${rules.length} payee${rules.length === 1 ? '' : 's'} always get the same category` : 'None yet. Tick “Always use this” to add one.'}</span></span>
          <Icon name="chevron_right" style={{ color: 'var(--faint)' }} />
        </button>
      </div>

      <div className="label">Your data</div>
      <div className="card list">
        <div className="setting">
          <span className="ic"><Icon name={sync.status === 'error' ? 'cloud_off' : 'cloud_done'} style={{ color: sync.status === 'error' ? 'var(--red)' : undefined }} /></span>
          <span className="grow">
            <span className="t" style={{ display: 'block' }}>Saved to GitHub, locked</span>
            <span className="d" style={{ color: sync.status === 'error' ? 'var(--red)' : undefined }}>{repo ? `${repo.owner}/${repo.repo} · ` : ''}{statusText}</span>
          </span>
          <button className="btn small secondary" onClick={() => syncNow().then(() => toast('Up to date'))}>{sync.status === 'saving' ? <Spinner size={18} /> : 'Save now'}</button>
        </div>
        <button className="setting" onClick={() => setSheet('token')}>
          <span className="ic"><Icon name="key" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Update GitHub key</span><span className="d">When it expires (once a year) or stops working</span></span>
          <Icon name="chevron_right" style={{ color: 'var(--faint)' }} />
        </button>
        <button className="setting" onClick={() => { download(`budget-${todayISO()}.csv`, toCSV(data), 'text/csv;charset=utf-8'); }}>
          <span className="ic"><Icon name="download" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Download as spreadsheet</span><span className="d">All transactions as a CSV file (not locked)</span></span>
        </button>
        <button className="setting" onClick={async () => { const t = await exportBackup(); if (t) download(`budget-backup-${todayISO()}.json`, t, 'application/json'); }}>
          <span className="ic"><Icon name="shield_lock" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Download locked backup</span><span className="d">Encrypted copy, opens only with your passphrase</span></span>
        </button>
      </div>

      <div className="label">Accounts & cards</div>
      <div className="card list">
        {accounts.map((a) => (
          <button key={a.id} className="setting" onClick={() => setEditAcc({ ...a })}>
            <Badge account={a} size={38} />
            <span className="grow"><span className="t" style={{ display: 'block' }}>{a.name}</span><span className="d">{a.type === 'card' ? 'Credit card' : a.type === 'cash' ? 'Cash' : 'Bank account'}</span></span>
            <Icon name="chevron_right" style={{ color: 'var(--faint)' }} />
          </button>
        ))}
        <button className="setting" onClick={() => setEditAcc({ id: '', name: '', type: 'bank', mono: '', hue: ACCOUNT_HUES[accounts.length % ACCOUNT_HUES.length] })}>
          <span className="ic"><Icon name="add" /></span>
          <span className="grow t" style={{ color: 'var(--accent)' }}>Add an account or card</span>
        </button>
      </div>

      <div className="label">This phone</div>
      <div className="card list">
        <button className="setting" onClick={() => setSheet('install')}>
          <span className="ic"><Icon name="add_to_home_screen" /></span>
          <span className="grow t">Put on home screen</span>
          <Icon name="chevron_right" style={{ color: 'var(--faint)' }} />
        </button>
        <button className="setting" onClick={() => setSheet('lock')}>
          <span className="ic"><Icon name="logout" /></span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Remove from this device</span><span className="d">Your data stays safe on GitHub</span></span>
        </button>
      </div>

      <div className="help" style={{ textAlign: 'center', padding: '0 12px' }}>
        Your data is locked with your passphrase on this phone before it’s saved to your private GitHub repo. Statement PDFs never leave your phone.
      </div>

      <Sheet open={sheet === 'claude'} onClose={() => setSheet(null)} title="Claude key">
        <div className="muted">{hasKey ? 'A key is saved. Paste a new one to replace it.' : 'The app uses Claude to read your statement PDFs.'}</div>
        <ClaudeKeyForm onSaved={() => { toast('Claude key saved'); setSheet(null); }} />
        {hasKey && <button className="btn danger" onClick={() => { setApiKey(''); toast('Key removed'); setSheet(null); }}>Remove key</button>}
      </Sheet>

      <Sheet open={sheet === 'rules'} onClose={() => setSheet(null)} title="Remembered payees">
        {rules.length ? (
          <div className="card list" style={{ boxShadow: 'inset 0 0 0 1px var(--line)' }}>
            {rules.map((r) => (
              <div key={r.label + r.category} className="setting">
                <span className="grow">
                  <span className="t" style={{ display: 'block' }}>{r.label}</span>
                  <span className="d">Always {cats[r.category]?.name || 'a removed category'}</span>
                </span>
                <button className="iconbtn" onClick={() => r.keys.forEach(deleteRule)} aria-label={`Forget ${r.label}`}><Icon name="delete" size={20} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">When you fix a category and tick “Always use this”, the payee shows up here.</div>
        )}
      </Sheet>

      <Sheet open={sheet === 'install'} onClose={() => setSheet(null)} title="Put on home screen">
        <InstallHelp />
      </Sheet>

      <TokenSheet open={sheet === 'token'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'lock'} onClose={() => setSheet(null)} title="Remove from this device?">
        <div className="muted">This phone forgets your keys and its copy of your data. Your data stays on GitHub. To use the app here again, you’ll need the GitHub key and your passphrase.</div>
        {sync.status !== 'saved' && sync.status !== 'idle' && <div className="callout warn">Some changes aren’t saved to GitHub yet. Tap <b>Save now</b> first.</div>}
        <button className="btn danger" onClick={forgetDevice}>Remove from this device</button>
      </Sheet>

      {editAcc && <AccountSheet key={editAcc.id || 'new'} value={editAcc} onClose={() => setEditAcc(null)} data={data} />}
    </div>
  );
}

function TokenSheet({ open, onClose }) {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    setBusy(true);
    try {
      await replaceToken(token);
      toast('GitHub key updated');
      setToken('');
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Update GitHub key">
      <ol className="howto">
        <li><span>Tap <b>Create key on GitHub</b>.</span></li>
        <li><span>Choose <b>Only select repositories</b> and pick <b>finance-data</b>.</span></li>
        <li><span>Tap <b>Generate token</b>, copy it and paste it below.</span></li>
      </ol>
      <a className="btn outline" href={newTokenUrl()} target="_blank" rel="noreferrer">Create key on GitHub <Icon name="open_in_new" size={18} /></a>
      <PasswordInput value={token} onChange={setToken} placeholder="Paste the new key" mono onEnter={go} />
      {err && <div className="err">{err}</div>}
      <button className="btn primary" onClick={go} disabled={busy || !token.trim()}>{busy ? <><Spinner /> Checking…</> : 'Save key'}</button>
    </Sheet>
  );
}

function AccountSheet({ value, onClose, data }) {
  const toast = useToast();
  const [f, setForm] = useState(value); // mounted with a key, so it starts fresh each time
  const used = f && f.id && liveTxns(data).some((t) => t.account === f.id);
  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const save = () => {
    const name = (f.name || '').trim();
    if (!name) return toast('Give it a name');
    const mono = (f.mono || '').trim().slice(0, 2).toUpperCase() || name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '··';
    saveAccount({ ...f, id: f.id || uid('a'), name, mono });
    toast('Saved');
    onClose();
  };
  return (
    <Sheet open={!!value} onClose={onClose} title={f && f.id ? 'Edit account' : 'New account'}>
      {f && (
        <>
          <div className="row" style={{ gap: 14 }}>
            <Badge account={{ ...f, mono: (f.mono || f.name || '?').slice(0, 2).toUpperCase() }} size={52} />
            <input className="input grow" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Name, e.g. HDFC Millennia" maxLength={30} />
          </div>
          <div className="seg">
            {[['bank', 'Bank'], ['card', 'Credit card'], ['cash', 'Cash']].map(([k, l]) => (
              <button key={k} className={f.type === k ? 'sel' : ''} onClick={() => set('type', k)}>{l}</button>
            ))}
          </div>
          <div className="field">
            <div className="label">Badge letters</div>
            <input className="input" value={f.mono} onChange={(e) => set('mono', e.target.value.slice(0, 2))} placeholder="2 letters" maxLength={2} style={{ textTransform: 'uppercase', width: 120 }} />
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {ACCOUNT_HUES.map((h) => (
              <button key={h} onClick={() => set('hue', h)} aria-label={`Colour ${h}`} style={{ width: 36, height: 36, borderRadius: 99, background: `oklch(var(--bdL) 0.07 ${h})`, boxShadow: f.hue === h ? '0 0 0 2px var(--ink)' : 'none' }} />
            ))}
          </div>
          <button className="btn primary" onClick={save}>Save</button>
          {f.id && (
            <button className="btn danger" onClick={() => { archiveAccount(f.id); toast(`${f.name} hidden`); onClose(); }}>
              {used ? 'Hide this account' : 'Remove this account'}
            </button>
          )}
          {f.id && used && <div className="help" style={{ marginTop: -8 }}>Its past transactions stay in your history.</div>}
        </>
      )}
    </Sheet>
  );
}
