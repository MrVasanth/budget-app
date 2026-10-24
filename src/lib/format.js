// Money and date helpers. All money is Indian rupees with Indian digit grouping (₹1,20,000).

const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** ₹1,20,000. exact=true keeps paise (₹486.50). */
export function inr(n, { exact = false, sign = false } = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const body = (exact ? inrExact : inrWhole).format(exact ? abs : Math.round(abs));
  const minus = v < 0 && Math.round(abs * (exact ? 100 : 1)) !== 0 ? '−' : '';
  const plus = sign && v > 0 ? '+' : '';
  return `${minus}${plus}₹${body}`;
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Parses "1,20,000.50" or "₹486" into a number. Returns NaN when empty. */
export function parseAmount(s) {
  if (typeof s === 'number') return s;
  const cleaned = String(s ?? '').replace(/[₹,\s]/g, '');
  if (!cleaned) return NaN;
  return Number(cleaned);
}

const pad = (n) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in the phone's own time zone. */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthOf(iso) {
  return String(iso).slice(0, 7);
}

export function currentMonth() {
  return monthOf(todayISO());
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Days left in the month including today. For past months 0, future months the whole month. */
export function daysLeft(month, today = todayISO()) {
  const tm = monthOf(today);
  if (month < tm) return 0;
  if (month > tm) return daysInMonth(month);
  return daysInMonth(month) - Number(today.slice(8, 10)) + 1;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function monthName(month, withYear = false) {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1];
  return withYear || y !== new Date().getFullYear() ? `${name} ${y}` : name;
}

export function shortDate(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${SHORT[d.getMonth()]}`;
}

export function longToday(d = new Date()) {
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Today · 14 Oct", "Yesterday · 13 Oct", "Sunday · 12 Oct", "3 Sep 2025" */
export function dayLabel(iso, today = todayISO()) {
  const d = parseISO(iso);
  const t = parseISO(today);
  const diff = Math.round((t - d) / 86400000);
  const short = shortDate(iso);
  if (diff === 0) return `Today · ${short}`;
  if (diff === 1) return `Yesterday · ${short}`;
  if (diff > 1 && diff < 7) return `${DAYS[d.getDay()]} · ${short}`;
  if (d.getFullYear() !== t.getFullYear()) return `${short} ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} · ${short}`;
}

export function dayDiff(a, b) {
  return Math.round((parseISO(a) - parseISO(b)) / 86400000);
}

export function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function uid(prefix = 'm') {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + '_' + [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}
