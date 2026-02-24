import { state, saveState } from './state.js';
import { parseTimeSecs, parseDate, uid, dStr } from './utils.js';
import { TYPE_LABELS } from './constants.js';
import { COMPLETE_MSGS, SKIP_MSGS, randMsg, showToast, daysSince, isFuture } from './feedback.js';
import { calcPaces, getPlanTotalWeeks, recalcFuturePaces } from './plan-generator.js';
import { renderMainContent } from './render-app.js';
import { closeModal, openDayCellPicker } from './render-modal.js';

// Read the type select in the open modal and apply changes to run r
function applyTypeChange(r) {
  const typeEl = document.getElementById('modal-run-type');
  if (!typeEl || typeEl.value === r.type) return;
  r.type  = typeEl.value;
  r.label = TYPE_LABELS[r.type] || r.label;
  const paces = calcPaces(
    parseTimeSecs(state.profile?.fiveKTime),
    parseTimeSecs(state.profile?.tenKTime)
  );
  r.estimatedPace = paces[r.type] || r.estimatedPace;
}

// Strip Strava verification from a run (called when date changes)
function clearStravaLink(r) {
  if (!r.stravaVerified) return;
  r.stravaVerified   = false;
  r.stravaActivityId = null;
  r.avgHR            = null;
  r.maxHR            = null;
  r.hrStream         = null;
  showToast('Strava link removed — re-verify on the new date', 'warn');
}

let dragRunId = null;

export function handleComplete(id, confirmed) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;

  if (isFuture(r.date)) {
    showToast('⛔ Can\'t log a future run!', 'warn');
    return;
  }

  const daysOld = daysSince(r.date);
  if (!confirmed && daysOld > 7) {
    const btn = document.querySelector('.btn-success[onclick*="handleComplete"]');
    if (btn) {
      btn.textContent = `⚠️ ${daysOld}d ago — tap again to confirm`;
      btn.setAttribute('onclick', `handleComplete('${id}', true)`);
      btn.style.background = '#d97706';
    }
    return;
  }

  const distEl = document.getElementById('modal-actual-dist');
  const paceEl = document.getElementById('modal-actual-pace');
  let actDist = distEl ? (parseFloat(distEl.value) || r.distance) : r.distance;
  const actPace = paceEl ? parseTimeSecs(paceEl.value) : null;

  applyTypeChange(r);

  // Tempo segment breakdown
  if (r.type === 'tempo') {
    const wuEl = document.getElementById('modal-seg-wu');
    const tmEl = document.getElementById('modal-seg-tm');
    const cdEl = document.getElementById('modal-seg-cd');
    const wu = wuEl ? parseFloat(wuEl.value) || null : null;
    const tm = tmEl ? parseFloat(tmEl.value) || null : null;
    const cd = cdEl ? parseFloat(cdEl.value) || null : null;
    r.actualWarmup   = wu;
    r.actualTempo    = tm;
    r.actualCooldown = cd;
    if (wu != null && tm != null && cd != null) {
      actDist = Math.round((wu + tm + cd) * 10) / 10;
    }
  }

  r.completed      = true;
  r.skipped        = false;
  r.actualDistance = (actDist !== r.distance) ? actDist : null;
  r.actualPace     = (actPace && actPace !== r.estimatedPace) ? actPace : null;

  recalcFuturePaces();
  saveState(); closeModal(); renderMainContent();
  showToast(randMsg(COMPLETE_MSGS), 'ok');
}

export function handleUncomplete(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  r.completed      = false;
  r.actualDistance = null;
  r.actualPace     = null;
  r.actualWarmup   = null;
  r.actualTempo    = null;
  r.actualCooldown = null;
  saveState(); closeModal(); renderMainContent();
}

export function handleUpdateRun(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;

  const distEl = document.getElementById('modal-actual-dist');
  const paceEl = document.getElementById('modal-actual-pace');
  let actDist = distEl ? (parseFloat(distEl.value) || r.distance) : r.distance;
  const actPace = paceEl ? parseTimeSecs(paceEl.value) : null;

  applyTypeChange(r);

  // Tempo segment breakdown
  if (r.type === 'tempo') {
    const wuEl = document.getElementById('modal-seg-wu');
    const tmEl = document.getElementById('modal-seg-tm');
    const cdEl = document.getElementById('modal-seg-cd');
    const wu = wuEl ? parseFloat(wuEl.value) || null : null;
    const tm = tmEl ? parseFloat(tmEl.value) || null : null;
    const cd = cdEl ? parseFloat(cdEl.value) || null : null;
    r.actualWarmup   = wu;
    r.actualTempo    = tm;
    r.actualCooldown = cd;
    if (wu != null && tm != null && cd != null) {
      actDist = Math.round((wu + tm + cd) * 10) / 10;
    }
  }

  r.actualDistance = (actDist !== r.distance) ? actDist : null;
  r.actualPace     = (actPace && actPace !== r.estimatedPace) ? actPace : null;

  recalcFuturePaces();
  saveState(); closeModal(); renderMainContent();
  showToast('Run data updated', 'ok');
}

export function handleSkip(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  r.skipped = true; r.completed = false;
  r.actualDistance = null; r.actualPace = null;
  saveState(); closeModal(); renderMainContent();
  showToast(randMsg(SKIP_MSGS), 'skip');
}

export function handleUnskip(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  r.skipped = false;
  saveState(); closeModal(); renderMainContent();
}

export function handleSaveNotes(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  applyTypeChange(r);
  const ta = document.getElementById('modal-notes');
  if (ta) r.notes = ta.value;
  saveState(); closeModal(); renderMainContent();
}

export function handleMove(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  const inp = document.getElementById('modal-date');
  if (inp && inp.value && inp.value !== r.date) {
    clearStravaLink(r);
    r.date = inp.value;
    saveState();
  }
  closeModal(); renderMainContent();
}

export function onDragStart(e, runId) {
  dragRunId = runId;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', runId);
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-run-id="${runId}"]`);
    if (el) el.classList.add('dragging');
  });
}

export function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('dov');
}

export function onDragLeave(e) {
  e.currentTarget.classList.remove('dov');
}

export function dayCellClick(e, dateStr) {
  if (e.target.closest('.run-card')) return; // clicking a run card opens its modal
  if (e.target.closest('.ct-item')) return;  // clicking a CT item opens CT modal
  openDayCellPicker(dateStr);
}

export function handleAddCT(dateStr) {
  const type     = document.getElementById('ct-type')?.value;
  const duration = parseInt(document.getElementById('ct-duration')?.value, 10) || 0;
  const notes    = document.getElementById('ct-notes')?.value.trim() || '';
  if (!type) return;
  if (!state.crossTraining) state.crossTraining = [];
  state.crossTraining.push({ id: uid(), date: dateStr, type, duration, notes });
  saveState(); closeModal(); renderMainContent();
  showToast(`${type} logged`, 'ok');
}

export function handleUpdateCT(id) {
  const ct = (state.crossTraining || []).find(x => x.id === id);
  if (!ct) return;
  ct.type     = document.getElementById('ct-type')?.value || ct.type;
  ct.duration = parseInt(document.getElementById('ct-duration')?.value, 10) || 0;
  ct.notes    = document.getElementById('ct-notes')?.value.trim() || '';
  saveState(); closeModal(); renderMainContent();
  showToast('Cross training updated', 'ok');
}

export function handleDeleteCT(id) {
  if (!state.crossTraining) return;
  const idx = state.crossTraining.findIndex(x => x.id === id);
  if (idx === -1) return;
  state.crossTraining.splice(idx, 1);
  saveState(); closeModal(); renderMainContent();
  showToast('Cross training deleted', 'skip');
}

export function handleAddRun(dateStr) {
  const typeEl  = document.getElementById('new-run-type');
  const distEl  = document.getElementById('new-run-dist');
  const notesEl = document.getElementById('new-run-notes');

  const type     = typeEl?.value || 'easy';
  const distance = parseFloat(distEl?.value);
  if (!distance || distance <= 0) { showToast('Enter a distance', 'warn'); return; }
  const notes    = notesEl?.value.trim() || '';

  // Determine week number from plan start date
  const start   = parseDate(state.profile.startDate);
  const startSun = new Date(start); startSun.setDate(start.getDate() - start.getDay());
  const target  = parseDate(dateStr);
  const targSun = new Date(target); targSun.setDate(target.getDate() - target.getDay());
  const week    = Math.max(1, Math.round((targSun - startSun) / (7 * 86400000)) + 1);
  const wFE     = Math.max(0, getPlanTotalWeeks() - week);

  const paces = calcPaces(
    parseTimeSecs(state.profile?.fiveKTime),
    parseTimeSecs(state.profile?.tenKTime)
  );

  const newRun = {
    id:             uid(),
    date:           dateStr,
    type,
    label:          TYPE_LABELS[type],
    distance:       Math.round(distance * 10) / 10,
    estimatedPace:  paces[type],
    week,
    wFE,
    notes,
    completed:      false,
    skipped:        false,
    stravaVerified: false,
    userAdded:      true,
  };
  state.plan.push(newRun);

  // Auto-link a pending Strava activity from "Add New" in bulk sync
  if (state.strava?.pendingLink) {
    const p      = state.strava.pendingLink;
    const distMi = Math.round(p.distanceM / 1609.34 * 100) / 100;
    const pace   = p.distanceM > 0 ? Math.round(p.movingTimeSecs / (p.distanceM / 1609.34)) : newRun.estimatedPace;
    newRun.stravaActivityId = p.id;
    newRun.stravaVerified   = true;
    newRun.actualDistance   = (distMi !== newRun.distance) ? distMi : null;
    newRun.actualPace       = (pace !== newRun.estimatedPace) ? pace : null;
    newRun.avgHR            = p.avgHR > 0 ? Math.round(p.avgHR) : null;
    newRun.maxHR            = p.maxHR > 0 ? Math.round(p.maxHR) : null;
    newRun.completed        = true;
    state.strava.pendingLink = null;
  }

  saveState(); closeModal(); renderMainContent();
  showToast('Run added', 'ok');
}

export function stravaUnlink(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  r.stravaActivityId = null;
  r.stravaVerified   = false;
  r.avgHR            = null;
  r.maxHR            = null;
  r.hrStream         = null;
  saveState();
  import('./render-modal.js').then(m => { m.closeModal(true); m.openModal(id); });
  renderMainContent();
  showToast('Strava activity unlinked', 'warn');
}

export function handleAddInjury() {
  const bodyPart  = document.getElementById('inj-part')?.value;
  const severity  = document.getElementById('inj-severity')?.value;
  const notes     = document.getElementById('inj-notes')?.value.trim() || '';
  const startDate = document.getElementById('inj-startdate')?.value || dStr(new Date());
  if (!bodyPart || !severity) return;
  if (!state.injuries) state.injuries = [];
  const existing = state.injuries.find(x => x.bodyPart === bodyPart && !x.resolved);
  if (existing) { showToast(`Active injury already logged for ${bodyPart}`, 'warn'); return; }
  state.injuries.push({ id: uid(), bodyPart, severity, notes, startDate, resolved: false });
  saveState(); closeModal(); renderMainContent();
  showToast('Injury logged', 'warn');
}

export function handleUpdateInjury(id) {
  const inj = (state.injuries || []).find(x => x.id === id);
  if (!inj) return;
  inj.bodyPart  = document.getElementById('inj-part')?.value || inj.bodyPart;
  inj.severity  = document.getElementById('inj-severity')?.value || inj.severity;
  inj.notes     = document.getElementById('inj-notes')?.value.trim() || '';
  inj.startDate = document.getElementById('inj-startdate')?.value || inj.startDate;
  saveState(); closeModal(); renderMainContent();
  showToast('Injury updated', 'ok');
}

export function handleResolveInjury(id) {
  const inj = (state.injuries || []).find(x => x.id === id);
  if (!inj) return;
  inj.resolved = true;
  inj.resolvedDate = dStr(new Date());
  saveState(); closeModal(); renderMainContent();
  showToast('Injury marked resolved', 'ok');
}

export function handleDeleteInjury(id) {
  if (!state.injuries) return;
  const idx = state.injuries.findIndex(x => x.id === id);
  if (idx === -1) return;
  state.injuries.splice(idx, 1);
  saveState(); closeModal(); renderMainContent();
  showToast('Injury removed', 'skip');
}

export function handleDeleteRun(id) {
  const r = state.plan.find(x => x.id === id);
  if (!r) return;
  const idx = state.plan.indexOf(r);
  state.plan.splice(idx, 1);
  saveState(); closeModal(); renderMainContent();
  showToast('Run deleted', 'skip');
}

export function onDrop(e, targetDate) {
  e.preventDefault();
  document.querySelectorAll('.day-cell.dov').forEach(c => c.classList.remove('dov'));
  if (!dragRunId) return;
  const run = state.plan.find(r => r.id === dragRunId);
  dragRunId = null;
  if (!run || run.date === targetDate) { renderMainContent(); return; }
  clearStravaLink(run);
  run.date = targetDate;
  saveState();
  renderMainContent();
}
