// HTML-escape user-controlled strings before inserting into innerHTML
export function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseTimeSecs(str) {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split(':').map(n => parseInt(n, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function fmtSecs(s) {
  if (s == null) return '--';
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h}:${pad(m)}:${pad(ss)}`;
  return `${m}:${pad(ss)}`;
}

export function fmtPace(spm) {
  if (!spm) return '--';
  const m = Math.floor(spm / 60);
  const s = Math.round(spm % 60);
  return `${m}:${pad(s)}/mi`;
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// YYYY-MM-DD for a local Date
export function dStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// Parse YYYY-MM-DD without timezone shift
export function parseDate(str) {
  const [y,m,d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

export function todayStr() { return dStr(new Date()); }

export function friendlyDate(str) {
  const d = parseDate(str);
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
}
