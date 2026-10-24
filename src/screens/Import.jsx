import { useEffect, useRef, useState } from 'react';
import { Icon, Badge, Check, Spinner, PasswordInput, useToast } from '../components/ui';
import { CategorySheet } from '../components/pickers';
import { ClaudeKeyForm } from './Setup';
import { openPdf, NeedsPassword } from '../lib/pdf';
import { readStatement, draftToSave } from '../lib/importer';
import { saveImport } from '../lib/actions';
import { saveDraft, loadDraft, clearDraft, useApp } from '../lib/store';
import { categoryMap, accountMap } from '../lib/budget';
import { inr, shortDate } from '../lib/format';

export default function Import({ onClose }) {
  const { data, hasDraft } = useApp();
  const [stage, setStage] = useState(hasDraft ? 'loading' : 'upload');
  const [draft, setDraft] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!hasDraft) return;
    loadDraft().then((d) => {
      if (d) {
        setDraft(d);
        setStage('review');
      } else setStage('upload');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async ({ file, password, accountId }) => {
    const account = data.settings.accounts.find((a) => a.id === accountId);
    setJob({ file, password, accountId });
    setError('');
    setStage('processing');
    setProgress({ step: 'unlock' });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const d = await readStatement({ file, password, account, data, apiKey: data.apiKey.value, progress: setProgress, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (!d.items.length) {
        setError('No transactions were found in this PDF. Check that it’s a statement with transactions in it.');
        setStage('error');
        return;
      }
      setDraft(d);
      await saveDraft(d);
      setStage('review');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e.message || 'Something went wrong while reading the statement.');
      setStage('error');
    }
  };

  const cancel = () => {
    abortRef.current && abortRef.current.abort();
    setStage('upload');
  };

  if (stage === 'loading') return <div className="center-screen" style={{ alignItems: 'center' }}><Spinner size={32} /></div>;
  if (stage === 'upload') return <Upload data={data} onClose={onClose} onStart={start} initial={job} />;
  if (stage === 'processing') return <Processing progress={progress} job={job} data={data} onCancel={cancel} />;
  if (stage === 'error') {
    return (
      <div className="screen no-tabs">
        <div className="pagehead"><button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button><h1>Upload a statement</h1></div>
        <div className="alert red" style={{ alignItems: 'flex-start' }}><Icon name="error" fill /><div className="grow"><div className="t">Couldn’t finish reading it</div><div className="d" style={{ color: 'var(--ink)', marginTop: 4 }}>{error}</div></div></div>
        <button className="btn primary" onClick={() => job && start(job)}><Icon name="refresh" /> Try again</button>
        <button className="btn secondary" onClick={() => setStage('upload')}>Choose a different file</button>
      </div>
    );
  }
  return <Review data={data} draft={draft} setDraft={(d) => { setDraft(d); saveDraft(d); }} onClose={onClose} />;
}

function Upload({ data, onClose, onStart, initial }) {
  const accounts = data.settings.accounts.filter((a) => !a.archived && a.type !== 'cash');
  const [accountId, setAccountId] = useState(initial?.accountId || null);
  const [file, setFile] = useState(initial?.file || null);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState(initial?.password || '');
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef();
  const noKey = !data.apiKey?.value;

  const pick = async (f) => {
    setErr('');
    if (!f) return;
    if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return setErr('Please choose a PDF file.');
    if (f.size > 25 * 1024 * 1024) return setErr('That file is over 25 MB. Upload one month at a time.');
    setFile(f);
    setLocked(false);
    setPassword('');
    setChecking(true);
    try {
      const doc = await openPdf(f);
      doc.destroy();
    } catch (e) {
      if (e instanceof NeedsPassword) setLocked(true);
      else setErr(e.message);
    } finally {
      setChecking(false);
    }
  };

  const go = async () => {
    setErr('');
    if (!accountId) return setErr('Pick which account or card this statement is for.');
    if (!file) return setErr('Choose the PDF first.');
    if (locked) {
      if (!password) return setErr('Type the PDF password.');
      setChecking(true);
      try {
        const doc = await openPdf(file, password);
        doc.destroy();
      } catch (e) {
        setChecking(false);
        return setErr(e.message);
      }
      setChecking(false);
    }
    onStart({ file, password, accountId });
  };

  const acc = accounts.find((a) => a.id === accountId);

  return (
    <div className="screen no-tabs">
      <div className="pagehead">
        <button className="iconbtn" onClick={onClose} aria-label="Back"><Icon name="arrow_back" /></button>
        <h1>Upload a statement</h1>
      </div>

      {noKey ? (
        <div className="card pad stack">
          <div style={{ fontWeight: 700, fontSize: 18 }}>First, add your Claude key</div>
          <div className="muted">The app uses Claude to read statements. You only do this once.</div>
          <ClaudeKeyForm />
        </div>
      ) : (
        <>
          <div className="stack" style={{ gap: 10 }}>
            <div className="label">Which account is it for?</div>
            <div className="acctgrid">
              {accounts.map((a) => (
                <button key={a.id} className={'acctbtn' + (a.id === accountId ? ' sel' : '')} onClick={() => setAccountId(a.id)}>
                  <Badge account={a} size={30} />
                  <span className="ellipsis">{a.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack" style={{ gap: 10 }}>
            <div className="label">The PDF</div>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
            {file ? (
              <div className="card filecard">
                <span className="ficon">PDF</span>
                <div className="grow">
                  <div className="ellipsis" style={{ fontWeight: 600 }}>{file.name}</div>
                  <div className="small muted">{Math.max(1, Math.round(file.size / 1024))} KB{checking ? ' · checking…' : locked ? ' · password protected' : ''}</div>
                </div>
                <button className="link" onClick={() => inputRef.current.click()}>Change</button>
              </div>
            ) : (
              <button className="dropzone" onClick={() => inputRef.current.click()}>
                <Icon name="upload_file" style={{ color: 'var(--accent)' }} />
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600 }}>Choose the PDF</span>
                  <span className="small muted">Download it from net banking or the statement email first</span>
                </span>
              </button>
            )}
          </div>

          {locked && (
            <div className="field">
              <div className="label">PDF password</div>
              <PasswordInput value={password} onChange={setPassword} placeholder="The statement’s password" onEnter={go} autoFocus />
              <div className="help">Banks usually use your customer ID, date of birth (like 14101990) or part of your name. The statement email says which. The password is only used on this phone to open the file.</div>
            </div>
          )}

          <div className="help row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Icon name="shield_lock" size={18} />
            <span>The PDF stays on your phone. Only its text, with account numbers hidden, is sent to Claude to sort.</span>
          </div>
        </>
      )}

      {err && <div className="err">{err}</div>}

      {!noKey && (
        <div className="bottombar">
          <button className="btn primary" onClick={go} disabled={checking}>
            {checking ? <><Spinner /> Checking…</> : acc ? `Read ${acc.name} statement` : 'Read statement'}
          </button>
        </div>
      )}
    </div>
  );
}

function Processing({ progress, job, data, onCancel }) {
  const acc = data.settings.accounts.find((a) => a.id === job?.accountId);
  const p = progress || { step: 'unlock' };
  const order = ['unlock', 'pages', 'reading', 'matching'];
  const at = order.indexOf(p.step);
  let pct = 3;
  if (p.step === 'pages') pct = 5 + 15 * ((p.done || 0) / (p.total || 1));
  if (p.step === 'reading') pct = 20 + 75 * ((p.done || 0) / (p.total || 1));
  if (p.step === 'matching') pct = 97;
  const steps = [
    ['Opening the PDF', 'unlock'],
    [p.step === 'pages' && p.total ? `Reading pages (${p.done} of ${p.total})` : 'Reading the pages', 'pages'],
    [p.step === 'reading' && p.total > 1 ? `Sorting transactions (part ${Math.min(p.done + 1, p.total)} of ${p.total})` : 'Sorting your transactions', 'reading'],
    ['Checking for ones you already have', 'matching'],
  ];
  return (
    <div className="screen no-tabs">
      <div className="pagehead"><button className="iconbtn" onClick={onCancel} aria-label="Cancel"><Icon name="close" /></button><h1>Upload a statement</h1></div>
      <div className="row small muted" style={{ gap: 8 }}><Badge account={acc} size={24} />{acc?.name} · {job?.file?.name}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15 }}>Reading and sorting your transactions</div>
      <div>
        <div style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em' }}>{Math.round(pct)}%</div>
        <div className="progress" style={{ height: 8, marginTop: 8 }}><div style={{ width: pct + '%', background: 'var(--accent)' }} /></div>
      </div>
      <div className="card pad steps">
        {steps.map(([label, key], i) => {
          const state = i < at ? 'done' : i === at ? 'active' : 'pending';
          return (
            <div key={key} className={'stepline ' + state}>
              {state === 'done' ? <Icon name="check_circle" fill /> : state === 'active' ? <Spinner /> : <Icon name="radio_button_unchecked" />}
              <span style={{ fontWeight: state === 'active' ? 600 : 400 }}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="help" style={{ textAlign: 'center' }}>Usually under a minute. Keep this screen open.</div>
      <button className="btn secondary" onClick={onCancel}>Cancel</button>
    </div>
  );
}

function Review({ data, draft, setDraft, onClose }) {
  const toast = useToast();
  const cats = categoryMap(data);
  const acc = accountMap(data)[draft.accountId];
  const [pickFor, setPickFor] = useState(null);
  const [showAuto, setShowAuto] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isIgnore = (i) => cats[i.category]?.group === 'ignore';
  const fresh = draft.items.filter((i) => i.status === 'new');
  const review = fresh.filter((i) => i.review);
  const auto = fresh.filter((i) => !i.review && !isIgnore(i));
  const ignored = fresh.filter((i) => !i.review && isIgnore(i));
  const matched = draft.items.filter((i) => i.status === 'matched');
  const dups = draft.items.filter((i) => i.status === 'duplicate');
  const dates = draft.items.map((i) => i.date).sort();
  const from = draft.statement.period_start || dates[0];
  const to = draft.statement.period_end || dates[dates.length - 1];

  const update = (id, patch) => setDraft({ ...draft, items: draft.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const accept = () => setDraft({ ...draft, items: draft.items.map((i) => (i.review ? { ...i, review: false } : i)) });

  const save = async () => {
    saveImport(draftToSave(draft));
    await clearDraft();
    toast(`Saved ${fresh.length} transaction${fresh.length === 1 ? '' : 's'}`);
    onClose();
  };
  const discard = async () => {
    if (!confirmDiscard) return setConfirmDiscard(true);
    await clearDraft();
    onClose();
  };

  const item = pickFor && draft.items.find((i) => i.id === pickFor);

  return (
    <div className="screen no-tabs" style={{ paddingBottom: 150 }}>
      <div className="pagehead">
        <button className="iconbtn" onClick={onClose} aria-label="Back"><Icon name="arrow_back" /></button>
        <div className="grow">
          <h1>Check your statement</h1>
          <div className="sub">{acc?.name}{from ? ` · ${shortDate(from)} – ${shortDate(to)}` : ''}</div>
        </div>
      </div>

      <div className="card pad stack" style={{ gap: 16 }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>{draft.items.length} transactions</div>
        <div className="statgrid">
          <div className="s"><Icon name="check_circle" fill style={{ color: 'var(--green)' }} /><div><div className="n">{auto.length}</div><div className="small muted">Sorted for you</div></div></div>
          <div className="s"><Icon name="error" fill style={{ color: 'var(--amber)' }} /><div><div className="n">{review.length}</div><div className="small muted">Need a quick look</div></div></div>
          <div className="s"><Icon name="swap_horiz" style={{ color: 'var(--accent)' }} /><div><div className="n">{ignored.length}</div><div className="small muted">Card bills & transfers (not counted)</div></div></div>
          <div className="s"><Icon name="content_copy" style={{ color: 'var(--muted)' }} /><div><div className="n">{matched.length + dups.length}</div><div className="small muted">Already in the app</div></div></div>
        </div>
        <div className="row small" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Money out <b style={{ color: 'var(--ink)' }}>{inr(draft.totals.out)}</b></span>
          <span className="muted">Money in <b style={{ color: 'var(--ink)' }}>{inr(draft.totals.in)}</b></span>
        </div>
      </div>

      {draft.warnings.map((w) => (
        <div key={w} className="alert amber" style={{ alignItems: 'flex-start' }}><Icon name="warning" fill /><div className="d" style={{ color: 'var(--ink)' }}>{w}</div></div>
      ))}

      {review.length > 0 && (
        <>
          <div className="section-head"><h2>Need a quick look · {review.length}</h2><button className="link" onClick={accept}>All look right</button></div>
          <div className="help" style={{ marginTop: -4 }}>Claude wasn’t sure about these. Fix the category if it’s wrong. Anything you don’t touch keeps the suggestion.</div>
          {review.map((i) => <ReviewCard key={i.id} i={i} cats={cats} onPick={() => setPickFor(i.id)} onRemember={(v) => update(i.id, { remember: v })} onOk={() => update(i.id, { review: false })} />)}
        </>
      )}

      {auto.length > 0 && (
        <>
          <div className="section-head"><h2>Sorted for you · {auto.length}</h2><button className="link" onClick={() => setShowAuto(!showAuto)}>{showAuto ? 'Hide' : 'Show'}</button></div>
          {showAuto && <div className="card list">{auto.map((i) => <CompactRow key={i.id} i={i} cats={cats} onPick={() => setPickFor(i.id)} />)}</div>}
        </>
      )}

      {ignored.length > 0 && (
        <>
          <div className="section-head"><h2>Not counted · {ignored.length}</h2></div>
          <div className="help" style={{ marginTop: -4 }}>Card bill payments and moves between your own accounts. They’re kept out of your budget so nothing is counted twice.</div>
          <div className="card list">{ignored.map((i) => <CompactRow key={i.id} i={i} cats={cats} onPick={() => setPickFor(i.id)} />)}</div>
        </>
      )}

      {matched.length + dups.length > 0 && (
        <>
          <div className="section-head"><h2>Already in the app · {matched.length + dups.length}</h2><button className="link" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'}</button></div>
          {showDone && (
            <div className="card list">
              {[...matched, ...dups].map((i) => (
                <div key={i.id} className="txn">
                  <div className="grow">
                    <div className="p ellipsis">{i.manualPayee || i.payee}</div>
                    <div className="m">{i.status === 'matched' ? 'Matches one you added' : 'Already saved from a statement'} · {shortDate(i.date)}</div>
                  </div>
                  <div className="a">{i.dir === 'in' ? '+' : ''}{inr(i.amount, { exact: true })}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <button className="btn secondary" onClick={discard} style={{ marginTop: 8 }}>{confirmDiscard ? 'Tap again to throw this away' : 'Discard this statement'}</button>

      <div className="bottombar">
        <button className="btn primary" onClick={save}>{fresh.length ? `Save ${fresh.length} transaction${fresh.length === 1 ? '' : 's'}` : 'Done, nothing new'}</button>
        <div className="tiny muted" style={{ textAlign: 'center' }}>
          {matched.length + dups.length > 0 ? `${matched.length + dups.length} already in the app will be skipped` : 'You can change any of them later'}
        </div>
      </div>

      <CategorySheet
        open={!!item}
        onClose={() => setPickFor(null)}
        data={data}
        value={item?.category}
        dir={item?.dir}
        title={item ? item.payee || 'Pick a category' : ''}
        onPick={(c) => item && update(item.id, { category: c, remember: true, touched: true })}
      />
    </div>
  );
}

function ReviewCard({ i, cats, onPick, onRemember, onOk }) {
  const conf = { medium: ['Medium confidence', 'error'], low: ['Low confidence', 'help'], high: ['Sure', 'check_circle'] }[i.confidence] || ['Unsure', 'help'];
  const c = cats[i.category];
  return (
    <div className="card pad stack" style={{ gap: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{i.payee}</div>
          <div className="raw">{i.details}</div>
        </div>
        <div className="right">
          <div style={{ fontWeight: 700, fontSize: 17, color: i.dir === 'in' ? 'var(--green)' : undefined }}>{i.dir === 'in' ? '+' : ''}{inr(i.amount, { exact: true })}</div>
          <div className="small muted">{shortDate(i.date)}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="select" onClick={onPick} style={{ maxWidth: '60%' }}><span className="ellipsis" style={{ display: 'block' }}>{c?.name || 'Pick'}</span></button>
        {i.touched ? <span className="conf high"><Icon name="check_circle" fill />Changed</span> : <span className={'conf ' + i.confidence}><Icon name={conf[1]} fill />{conf[0]}</span>}
        <button className="link" style={{ marginLeft: 'auto' }} onClick={onOk}>Looks right</button>
      </div>
      {i.dir === 'in' && c && c.group !== 'income' && c.group !== 'ignore' && <div className="help">Counts as money back, so it comes off your {c.name} spending.</div>}
      <Check on={!!i.remember} onChange={onRemember}>Always use this for {i.payee || 'this payee'}</Check>
    </div>
  );
}

function CompactRow({ i, cats, onPick }) {
  return (
    <button className="txn" onClick={onPick}>
      <div className="grow">
        <div className="p ellipsis">{i.payee}</div>
        <div className="m ellipsis">{cats[i.category]?.name} · {shortDate(i.date)}{i.ruled ? ' · your rule' : ''}</div>
      </div>
      <div className={'a' + (i.dir === 'in' ? ' in' : '')}>{i.dir === 'in' ? '+' : ''}{inr(i.amount, { exact: true })}</div>
      <Icon name="edit" size={18} style={{ color: 'var(--faint)' }} />
    </button>
  );
}
