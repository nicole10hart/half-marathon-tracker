import { STATE_KEY } from './constants.js';

// Use const + in-place mutation so imported references stay valid across modules
export const state = { profile: null, plan: [], view: 'today', strava: null, crossTraining: [] };

export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch(e) { /* ignore */ }
}

export function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e) {}
}
