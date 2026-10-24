import { useState } from 'react';
import { Icon } from '../components/ui';

export function isInstalled() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function guessPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'ios';
}

export function InstallHelp() {
  const [p, setP] = useState(guessPlatform());
  if (isInstalled()) {
    return <div className="alert green"><Icon name="check_circle" fill /><div className="t">It’s already on your home screen.</div></div>;
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="seg">
        <button className={p === 'ios' ? 'sel' : ''} onClick={() => setP('ios')}>iPhone</button>
        <button className={p === 'android' ? 'sel' : ''} onClick={() => setP('android')}>Android</button>
      </div>
      {p === 'ios' ? (
        <ol className="howto">
          <li><span>Open this page in <b>Safari</b>.</span></li>
          <li><span>Tap the <b>Share</b> button <Icon name="ios_share" size={18} style={{ display: 'inline', verticalAlign: '-3px' }} /> at the bottom.</span></li>
          <li><span>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
        </ol>
      ) : (
        <ol className="howto">
          <li><span>Open this page in <b>Chrome</b>.</span></li>
          <li><span>Tap the <b>⋮</b> menu at the top right.</span></li>
          <li><span>Tap <b>Add to Home screen</b> or <b>Install app</b>, then <b>Install</b>.</span></li>
        </ol>
      )}
    </div>
  );
}
