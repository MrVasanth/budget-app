import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import ICONS from '../icons';

export function Icon({ name, fill = false, size, className = '', style }) {
  const d = (fill && ICONS[name + '#fill']) || ICONS[name] || ICONS.help;
  const st = size ? { width: size, height: size, ...style } : style;
  return (
    <svg className={'icon ' + className} viewBox="0 -960 960 960" style={st} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Spinner({ size = 22 }) {
  return <Icon name="progress_activity" className="spin" size={size} />;
}

export function Badge({ account, size = 36 }) {
  if (!account) return null;
  const isCard = account.type === 'card';
  return (
    <span
      className="badge"
      style={{
        width: size,
        height: size,
        borderRadius: isCard ? Math.round(size * 0.3) : '50%',
        background: `oklch(var(--bdL) 0.07 ${account.hue})`,
        color: `oklch(var(--bdF) 0.13 ${account.hue})`,
        fontSize: Math.round(size * (account.mono.length > 1 ? 0.33 : 0.42)),
      }}
    >
      {account.mono}
    </span>
  );
}

// ---------- Android/browser back button closes the top sheet ----------
const layers = [];
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    const depth = (e.state && e.state.depth) || 0;
    while (layers.length > depth) {
      const top = layers.pop();
      top.byBack = true;
      top.close();
    }
  });
}

export function useBack(active, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const entry = { close: () => ref.current && ref.current(), byBack: false };
    layers.push(entry);
    try {
      history.pushState({ depth: layers.length }, '');
    } catch {
      /* ignore */
    }
    return () => {
      const i = layers.indexOf(entry);
      if (i >= 0) layers.splice(i, 1);
      if (!entry.byBack) {
        try {
          history.back();
        } catch {
          /* ignore */
        }
      }
    };
  }, [active]);
}

export function Sheet({ open, onClose, title, children, actions }) {
  useBack(open, onClose);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        {(title || actions) && (
          <div className="sheethead">
            <h2>{title}</h2>
            <div className="row" style={{ gap: 4 }}>
              {actions}
              <button className="iconbtn" onClick={onClose} aria-label="Close" style={{ background: 'var(--sunk)', width: 38, height: 38 }}>
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </>,
    document.body,
  );
}

export function Page({ open, onClose, children }) {
  useBack(open, onClose);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="page">
      <div className="inner">{children}</div>
    </div>,
    document.body,
  );
}

export function Check({ on, onChange, children }) {
  return (
    <label className={'check' + (on ? ' on' : '')} onClick={(e) => { e.preventDefault(); onChange(!on); }}>
      <span className="box">{on && <Icon name="check" />}</span>
      <span>{children}</span>
    </label>
  );
}

export function StatusChip({ status }) {
  const map = {
    ok: ['check_circle', 'On track'],
    funded: ['check_circle', 'Done'],
    watch: ['error', 'Watch pace'],
    over: ['error', 'Overspent'],
    none: ['schedule', 'Not planned'],
  };
  const [ic, label] = map[status] || map.none;
  return (
    <span className={'status ' + status}>
      <Icon name={ic} fill />
      {label}
    </span>
  );
}

export const barColor = (s) => (s === 'over' ? 'var(--red)' : s === 'watch' ? 'var(--amber)' : s === 'none' ? 'var(--faint)' : 'var(--green)');

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const show = (m) => {
    clearTimeout(timer.current);
    setMsg(m);
    timer.current = setTimeout(() => setMsg(null), 2600);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function PasswordInput({ value, onChange, placeholder, autoFocus, onEnter, autoComplete = 'off', mono = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="inputwrap">
      <span className="lead"><Icon name="lock" size={20} /></span>
      <input
        className={'input' + (mono ? ' mono' : '')}
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter && onEnter()}
      />
      <button type="button" className="iconbtn trail" onClick={() => setShow(!show)} aria-label={show ? 'Hide' : 'Show'}>
        <Icon name={show ? 'visibility_off' : 'visibility'} size={20} />
      </button>
    </div>
  );
}
