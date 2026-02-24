import { parseDate, dStr } from './utils.js';

export const COMPLETE_MSGS = [
  'Run logged! Keep that momentum going.',
  'Crushed it! Every mile builds your base.',
  'Strong work — you\'re getting faster.',
  'Done! Consistency is your superpower.',
  'Nailed it! One step closer to race day.',
  'Logged! Your future self thanks you.',
];
export const SKIP_MSGS = [
  'Skipped. Life happens — don\'t make it a habit.',
  'Missed it. Push harder next time.',
  'Skipped. Every missed run costs fitness.',
  'Skipped. Come back stronger tomorrow.',
  'Missed it. Stay focused on race day.',
];

export const PUNISHMENT_COMPLETE_MSGS = [
  'That was the easy part. Tomorrow will be worse.',
  'Done. Don\'t expect a medal for the bare minimum.',
  'You finished. The bar is on the floor, but fine.',
  'Somehow you survived. Don\'t get comfortable.',
  'Logged. Your suffering has been acknowledged.',
  'Adequate. The pace gets worse next week.',
];
export const PUNISHMENT_SKIP_MSGS = [
  'Skipped. Pathetic. Your legs hate you for this.',
  'Did you even try? Absolutely inexcusable.',
  'Skipped. This is exactly why you won\'t PR.',
  'Really? REALLY? Get it together.',
  'Skipped. Your 5K time weeps.',
  'Wow. Truly unimpressive. See you tomorrow.',
];

export function randMsg(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function showToast(msg, type = 'ok') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 380); }, 3800);
}

export function daysSince(dateStr) {
  return Math.floor((Date.now() - parseDate(dateStr)) / 86400000);
}

export function isFuture(dateStr) {
  return dateStr > dStr(new Date());
}
