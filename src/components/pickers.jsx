import { Sheet, Badge, Icon } from './ui';
import { ALL_GROUPS } from '../defaults';

export function CategorySheet({ open, onClose, data, value, onPick, dir = 'out', title = 'Pick a category' }) {
  const cats = data.settings.categories.filter((c) => !c.archived || c.id === value);
  const order = dir === 'in' ? ['income', 'needs', 'wants', 'others', 'savings', 'investments', 'ignore'] : ['needs', 'wants', 'others', 'savings', 'investments', 'income', 'ignore'];
  const groups = order.map((id) => ALL_GROUPS.find((g) => g.id === id));
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {dir === 'in' && <div className="help">Someone paying you back? Pick what it was for (say, Eating out). It comes off that category’s spending.</div>}
      {groups.map((g) => {
        const list = cats.filter((c) => c.group === g.id);
        if (!list.length) return null;
        return (
          <div key={g.id} className="stack" style={{ gap: 8 }}>
            <div className="label">{g.name}{g.id === 'ignore' ? ' · not counted in your budget' : ''}</div>
            <div className="chips wrap">
              {list.map((c) => (
                <button key={c.id} className={'chip small' + (c.id === value ? ' sel' : '')} onClick={() => { onPick(c.id); onClose(); }}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}

export function AccountChips({ accounts, value, onPick }) {
  return (
    <div className="chips">
      {accounts.map((a) => (
        <button key={a.id} className={'chip withbadge' + (a.id === value ? ' sel' : '')} onClick={() => onPick(a.id)}>
          <Badge account={a} size={28} />
          {a.name}
        </button>
      ))}
    </div>
  );
}

export function CategoryButton({ data, value, onClick }) {
  const c = data.settings.categories.find((x) => x.id === value);
  return (
    <button className="select" onClick={onClick} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', maxWidth: 220 }}>
      <span className="ellipsis">{c ? c.name : 'Pick category'}</span>
    </button>
  );
}

export function AccountSheet({ open, onClose, accounts, value, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title="Which account?">
      <div className="card list">
        {accounts.map((a) => (
          <button key={a.id} className="setting" onClick={() => { onPick(a.id); onClose(); }}>
            <Badge account={a} size={34} />
            <span className="grow t">{a.name}</span>
            {a.id === value && <Icon name="check" style={{ color: 'var(--accent)' }} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
