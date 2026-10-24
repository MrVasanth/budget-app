import { useState } from 'react';
import { Icon, PasswordInput, Spinner, Check } from '../components/ui';
import { connectRepo, createVault, unlockVault, getState } from '../lib/store';
import { newTokenUrl } from '../lib/github';
import { WrongPassphrase } from '../lib/crypto';
import { testKey } from '../lib/ai';
import { setApiKey } from '../lib/actions';
import { InstallHelp, isInstalled } from './Install';

const WORDS = 'mango river pencil cloud tiger lamp garden rocket coffee pepper silver window forest candle market button ocean pillow ladder planet lemon violet marble anchor basket thunder copper meadow saffron monsoon temple bamboo harbor falcon cotton orange jasmine kettle parrot spice velvet comet desert island lotus mirror nickel otter paddle quartz raven sugar tulip umbrella walnut yellow zebra almond bridge cactus dragon engine feather ginger hammer igloo jungle koala lantern magnet needle olive puzzle quiver rabbit saddle tomato unicorn valley whistle yogurt cobalt drum ember fig glacier honey indigo jelly kite lagoon mint noodle opal pebble quilt ribbon sparrow turnip vessel willow'.split(' ');

function suggestPassphrase() {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return [...a].map((n) => WORDS[n % WORDS.length]).join('-');
}

function Shell({ step, total = isInstalled() ? 3 : 4, icon, title, children }) {
  return (
    <div className="center-screen setup">
      {step != null && (
        <div className="dots" aria-label={`Step ${step} of ${total}`}>
          {Array.from({ length: total }, (_, i) => <span key={i} className={i < step ? 'on' : ''} />)}
        </div>
      )}
      <div className="setup-ic"><Icon name={icon} /></div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export default function Setup({ onDone }) {
  const [step, setStep] = useState('welcome');
  const [conn, setConn] = useState(null);

  if (step === 'welcome') {
    return (
      <Shell icon="wallet" title="Plan your month. Spend without worry.">
        <p>Set a budget for Needs, Wants, Savings, Investments and Others. Upload your bank and card statements and the app sorts every spend for you.</p>
        <div className="callout">Setup takes about 5 minutes and you only do it once.</div>
        <button className="btn primary" onClick={() => setStep(isInstalled() ? 'github' : 'install-first')}>Start <Icon name="arrow_forward" /></button>
      </Shell>
    );
  }
  if (step === 'install-first') {
    // On iPhone the home-screen app keeps its own storage, so setting up in Safari
    // first would mean doing it twice. Install first, then set up inside the app.
    return (
      <Shell icon="add_to_home_screen" title="First, put it on your home screen">
        <p>Then open it from your home screen and continue there. That way you only set it up once.</p>
        <InstallHelp />
        <button className="btn secondary" onClick={() => setStep('github')}>Continue in the browser instead</button>
      </Shell>
    );
  }
  if (step === 'github') return <GitHubStep onNext={(c) => { setConn(c); setStep('pass'); }} />;
  if (step === 'pass') {
    return <PassStep conn={conn} onNext={() => (getState().data?.apiKey?.value ? (isInstalled() ? onDone() : setStep('install')) : setStep('claude'))} />;
  }
  if (step === 'claude') return <ClaudeStep onNext={() => (isInstalled() ? onDone() : setStep('install'))} />;
  return (
    <Shell step={4} icon="add_to_home_screen" title="Put it on your home screen">
      <p>So it opens like an app, with one tap.</p>
      <InstallHelp />
      <button className="btn primary" onClick={onDone}>Done, open my budget</button>
    </Shell>
  );
}

function GitHubStep({ onNext }) {
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState('finance-data');
  const [showRepo, setShowRepo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    setErr('');
    if (!token.trim()) return setErr('Paste the key from GitHub first.');
    setBusy(true);
    try {
      onNext(await connectRepo(token, repo.trim() || 'finance-data'));
    } catch (e) {
      setErr(e.kind === 'notfound'
        ? `Couldn’t open “${repo}”. Check that the key has access to it (step 2).`
        : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell step={1} icon="key" title="Connect your private data folder">
      <p>Your budget is saved in your private <b>{repo || 'finance-data'}</b> repo on GitHub. The app needs a key to save there.</p>
      <ol className="howto">
        <li><span>Tap <b>Create key on GitHub</b> below. It opens with everything filled in.</span></li>
        <li><span>Under <b>Repository access</b>, choose <b>Only select repositories</b>, then pick <b>{repo || 'finance-data'}</b>.</span></li>
        <li><span>Scroll down, tap <b>Generate token</b>, then copy the code. It starts with <span className="kbd">github_pat_</span></span></li>
        <li><span>Come back here and paste it below.</span></li>
      </ol>
      <a className="btn outline" href={newTokenUrl()} target="_blank" rel="noreferrer">Create key on GitHub <Icon name="open_in_new" size={18} /></a>
      <div className="field">
        <PasswordInput value={token} onChange={setToken} placeholder="Paste the key here" mono onEnter={go} />
        {showRepo ? (
          <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="Repo name" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        ) : (
          <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setShowRepo(true)}>Using a different repo name?</button>
        )}
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn primary" onClick={go} disabled={busy}>{busy ? <><Spinner /> Checking…</> : 'Connect'}</button>
    </Shell>
  );
}

function PassStep({ conn, onNext }) {
  const isNew = !conn.file;
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [wrote, setWrote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    setErr('');
    if (isNew) {
      if (pass.length < 8) return setErr('Use at least 8 characters. Four random words work well.');
      if (pass !== again) return setErr('The two passphrases don’t match.');
      if (!wrote) return setErr('Tick the box once you’ve written it down.');
    } else if (!pass) return setErr('Enter your passphrase.');
    setBusy(true);
    try {
      if (isNew) await createVault(conn, pass);
      else await unlockVault(conn, pass);
      onNext();
    } catch (e) {
      setErr(e instanceof WrongPassphrase ? 'That passphrase doesn’t open your data. Check for typos and try again.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!isNew) {
    return (
      <Shell step={2} icon="lock" title="Enter your passphrase">
        <p>Your budget is already saved. Enter the passphrase you created to open it on this device.</p>
        <PasswordInput value={pass} onChange={setPass} placeholder="Your passphrase" autoFocus onEnter={go} />
        {err && <div className="err">{err}</div>}
        <button className="btn primary" onClick={go} disabled={busy}>{busy ? <><Spinner /> Unlocking…</> : 'Unlock'}</button>
      </Shell>
    );
  }

  return (
    <Shell step={2} icon="shield_lock" title="Create a passphrase">
      <p>It locks your data before it’s saved. Without it nobody can read your data, not even GitHub.</p>
      <div className="callout warn"><b>Write it down somewhere safe.</b> If you forget it, your data can’t be recovered.</div>
      <div className="field">
        <PasswordInput value={pass} onChange={setPass} placeholder="Passphrase" autoComplete="new-password" />
        <PasswordInput value={again} onChange={setAgain} placeholder="Type it again" autoComplete="new-password" onEnter={go} />
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => { const s = suggestPassphrase(); setPass(s); setAgain(s); }}>
          Suggest one for me
        </button>
        {pass && pass === again && pass.length >= 8 && <div className="help">Your passphrase: <span className="kbd">{pass}</span></div>}
      </div>
      <Check on={wrote} onChange={setWrote}>I’ve written it down</Check>
      {err && <div className="err">{err}</div>}
      <button className="btn primary" onClick={go} disabled={busy}>{busy ? <><Spinner /> Locking your data…</> : 'Continue'}</button>
    </Shell>
  );
}

export function ClaudeKeyForm({ onSaved, compact = false }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    if (!key.trim().startsWith('sk-ant-')) return setErr('That doesn’t look like a Claude key. It starts with sk-ant-');
    setBusy(true);
    try {
      await testKey(key);
      setApiKey(key);
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {!compact && (
        <ol className="howto">
          <li><span>Tap <b>Open Claude Console</b> and sign up or log in.</span></li>
          <li><span>Open <b>Billing</b> and add a little credit. The smallest top-up covers hundreds of statements.</span></li>
          <li><span>Open <b>API keys</b>, tap <b>Create key</b>, name it “Budget app” and copy it. It starts with <span className="kbd">sk-ant-</span></span></li>
          <li><span>Paste it below.</span></li>
        </ol>
      )}
      {!compact && <a className="btn outline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Open Claude Console <Icon name="open_in_new" size={18} /></a>}
      <PasswordInput value={key} onChange={setKey} placeholder="Paste the Claude key here" mono onEnter={go} />
      {err && <div className="err">{err}</div>}
      <button className="btn primary" onClick={go} disabled={busy}>{busy ? <><Spinner /> Checking…</> : 'Check and save'}</button>
    </>
  );
}

function ClaudeStep({ onNext }) {
  return (
    <Shell step={3} icon="auto_awesome" title="Let the app read your statements">
      <p>Reading PDFs uses Claude, by Anthropic. It needs its own key with a small prepaid balance. One statement costs less than ₹1.</p>
      <ClaudeKeyForm onSaved={onNext} />
      <button className="btn secondary" onClick={onNext}>Skip for now</button>
      <div className="help" style={{ textAlign: 'center', marginTop: -8 }}>You can add it later in More.</div>
    </Shell>
  );
}
