import { state, saveState } from './state.js';
import { dStr, fmtPace, fmtSecs, parseTimeSecs, esc } from './utils.js';
import { getCurrentWeek, getPlanTotalWeeks, estimateHalf, getTrainingProjection } from './plan-generator.js';
import { renderPlanHTML, setupDragListeners } from './render-plan.js';
import { renderStatsHTML } from './render-stats.js';
import { WARMUP_EXERCISES, COOLDOWN_EXERCISES, COOLDOWN_ROUTINES } from './constants.js';
// render-setup imported lazily to avoid circular dependency at module init time
// (render-setup.js calls renderApp via dynamic import)

// Warm-up exercise IDs per run type
const WARMUP_ROUTINES = {
  easy:     ['walk', 'leg-fb', 'ankle', 'high-knees', 'hip-lunge', 'calf-str'],
  tempo:    ['walk', 'leg-fb', 'leg-side', 'ankle', 'calf-raise', 'high-knees', 'butt-kicks', 'lateral'],
  long:     ['walk', 'leg-fb', 'leg-side', 'calf-raise', 'hip-lunge', 'high-knees', 'glute-br', 'calf-str'],
  recovery: ['walk', 'ankle', 'calf-str', 'quad-str', 'hip-lunge', 'itband-str'],
  race:     ['walk', 'leg-fb', 'leg-side', 'calf-raise', 'high-knees', 'butt-kicks', 'lateral', 'hip-lunge'],
  rest:     ['walk', 'ankle', 'calf-str', 'quad-str', 'itband-str', 'glute-br'],
};

// Injury keyword → extra exercise IDs to add
const INJURY_EXTRAS = [
  { match: /knee/i,       ids: ['quad-str', 'itband-str', 'glute-br'] },
  { match: /ankle/i,      ids: ['ankle', 'calf-raise', 'calf-str'] },
  { match: /calf|achilles/i, ids: ['calf-str', 'calf-raise'] },
  { match: /shin/i,       ids: ['shin-str', 'calf-str'] },
  { match: /hip|it band/i,   ids: ['itband-str', 'hip-lunge', 'glute-br'] },
  { match: /hamstring/i,  ids: ['leg-fb', 'hip-lunge'] },
  { match: /plantar/i,    ids: ['calf-str', 'ankle', 'shin-str'] },
  { match: /back/i,       ids: ['glute-br', 'hip-lunge'] },
];

function buildWarmupIds(runType) {
  const base = [...(WARMUP_ROUTINES[runType] || WARMUP_ROUTINES.rest)];
  const activeInjuries = (state.injuries || []).filter(i => !i.resolved);
  const extras = new Set();
  activeInjuries.forEach(inj => {
    INJURY_EXTRAS.forEach(rule => {
      if (rule.match.test(inj.bodyPart)) rule.ids.forEach(id => extras.add(id));
    });
  });
  // Append injury-specific extras that aren't already in base
  extras.forEach(id => { if (!base.includes(id)) base.push(id); });
  return base;
}

// Approximate minutes per exercise ID
const DUR_MINS = {
  walk:4, 'leg-fb':1, 'leg-side':1, ankle:1, 'calf-raise':1,
  'hip-lunge':1.5, 'high-knees':0.5, 'butt-kicks':0.5, lateral:0.5,
  'glute-br':1.5, 'calf-str':1, 'quad-str':1, 'itband-str':1, 'shin-str':1,
};

function renderWarmupHTML(runType) {
  const ids  = buildWarmupIds(runType);
  const exMap = Object.fromEntries(WARMUP_EXERCISES.map(e => [e.id, e]));
  const exercises = ids.map(id => exMap[id]).filter(Boolean);
  const activeInjuries = (state.injuries || []).filter(i => !i.resolved);
  const totalMins = Math.round(ids.reduce((s, id) => s + (DUR_MINS[id] || 1), 0));
  const today = dStr(new Date());
  const isDone = _warmupDoneDate === today;

  const pills = exercises.map((e, i) =>
    `<span class="warmup-pill" onclick="openWarmupGuide('${runType}',${i})">${e.name}</span>`
  ).join('');

  const btn = isDone
    ? `<button class="btn btn-ghost" style="width:100%" onclick="openWarmupGuide('${runType}')">↺ Restart Warm-Up</button>`
    : `<button class="btn btn-primary" style="width:100%" onclick="openWarmupGuide('${runType}')">Start Guided Warm-Up →</button>`;

  return `
    <div class="stats-card warmup-card${isDone ? ' warmup-done' : ''}">
      <div class="warmup-header">
        <span class="warmup-title">Pre-Run Warm-Up</span>
        ${isDone
          ? `<span class="warmup-done-badge">✓ Done</span>`
          : `<span class="warmup-time">~${totalMins} min</span>`}
      </div>
      <div class="warmup-meta">${exercises.length} exercises${activeInjuries.length ? ` &nbsp;·&nbsp; adjusted for ${activeInjuries.length} active injur${activeInjuries.length > 1 ? 'ies' : 'y'}` : ''}</div>
      <div class="warmup-pills">${pills}</div>
      ${btn}
    </div>`;
}

// --- Guided warm-up overlay ---
let _warmupExs      = [];
let _warmupIdx      = 0;
let _warmupRunType  = 'easy';
let _warmupDoneDate = null; // YYYY-MM-DD when today's warm-up was completed

const WARMUP_TYPE_COLORS = {
  easy: '#22c55e', tempo: '#f97316', long: '#3b82f6',
  recovery: '#a78bfa', race: '#f59e0b', rest: '#64748b',
};

export function openWarmupGuide(runType, startIdx = 0) {
  const ids  = buildWarmupIds(runType);
  const exMap = Object.fromEntries(WARMUP_EXERCISES.map(e => [e.id, e]));
  _warmupExs    = ids.map(id => exMap[id]).filter(Boolean);
  _warmupIdx    = Math.max(0, Math.min(_warmupExs.length - 1, startIdx));
  _warmupRunType = runType;
  _renderWarmupStep();
}

function _renderWarmupStep() {
  const ex    = _warmupExs[_warmupIdx];
  const total = _warmupExs.length;
  const isLast = _warmupIdx === total - 1;

  // Mark injury-extra exercises
  const activeInjuries = (state.injuries || []).filter(i => !i.resolved);
  const injuryExtraIds = new Set();
  activeInjuries.forEach(inj => {
    INJURY_EXTRAS.forEach(rule => {
      if (rule.match.test(inj.bodyPart)) rule.ids.forEach(id => injuryExtraIds.add(id));
    });
  });
  const injNote = injuryExtraIds.has(ex.id)
    ? `<div class="wg-inj-note">Added for active injury</div>` : '';

  const pills = _warmupExs.map((e, i) => {
    const cls   = i < _warmupIdx ? 'wg-pill done' : i === _warmupIdx ? 'wg-pill current' : 'wg-pill';
    const label = i < _warmupIdx ? `✓ ${e.name}` : e.name;
    return `<span class="${cls}" onclick="warmupJump(${i})">${label}</span>`;
  }).join('');

  const typeColor = WARMUP_TYPE_COLORS[_warmupRunType] || '#f97316';

  let el = document.getElementById('warmup-guide');
  if (!el) {
    el = document.createElement('div');
    el.id = 'warmup-guide';
    document.body.appendChild(el);
  }
  el.style.setProperty('--wg-color', typeColor);

  const pct = Math.round((_warmupIdx + 1) / total * 100);

  el.innerHTML = `
    <div class="wg-progress-bar"><div class="wg-progress-fill" style="width:${pct}%"></div></div>
    <div class="wg-topbar">
      <span></span>
      <span class="wg-counter">${_warmupIdx + 1} of ${total}</span>
      <button class="wg-close" onclick="closeWarmupGuide()" aria-label="Exit">✕</button>
    </div>
    <div class="wg-card">
      <div class="wg-step-num">${_warmupIdx + 1}</div>
      <div class="wg-name">${ex.name}</div>
      <div class="wg-dur-pill">${ex.dur}</div>
      <div class="wg-desc">${ex.desc}</div>
      ${injNote}
    </div>
    <div class="wg-actions">
      ${_warmupIdx > 0
        ? `<button class="btn btn-ghost" onclick="warmupStep(-1)">← Prev</button>`
        : '<span></span>'}
      ${isLast
        ? `<button class="btn btn-success" onclick="finishWarmupGuide()">Done ✓</button>`
        : `<button class="btn btn-primary" onclick="warmupStep(1)">Next →</button>`}
    </div>
    <div class="wg-pills">${pills}</div>
  `;
}

export function warmupStep(dir) {
  _warmupIdx = Math.max(0, Math.min(_warmupExs.length - 1, _warmupIdx + dir));
  _renderWarmupStep();
}

export function warmupJump(idx) {
  _warmupIdx = Math.max(0, Math.min(_warmupExs.length - 1, idx));
  _renderWarmupStep();
}

export function finishWarmupGuide() {
  _warmupDoneDate = dStr(new Date());
  document.getElementById('warmup-guide')?.remove();
  renderMainContent();
}

export function closeWarmupGuide() {
  document.getElementById('warmup-guide')?.remove();
}

// ---- Cool-Down ----

const CD_DUR_MINS = {
  'cd-walk':4, 'cd-calf':1, 'cd-quad':1, 'cd-ham':1,
  'cd-hip':1, 'cd-it':1, 'cd-glute':1,
  'cd-pigeon':1.5, 'cd-back':1.5, 'cd-breath':1,
};

function renderCooldownHTML(runType) {
  const ids     = COOLDOWN_ROUTINES[runType] || COOLDOWN_ROUTINES.rest;
  const exMap   = Object.fromEntries(COOLDOWN_EXERCISES.map(e => [e.id, e]));
  const exercises = ids.map(id => exMap[id]).filter(Boolean);
  const totalMins = Math.round(ids.reduce((s, id) => s + (CD_DUR_MINS[id] || 1), 0));
  const today   = dStr(new Date());
  const isDone  = _cooldownDoneDate === today;

  const pills = exercises.map((e, i) =>
    `<span class="warmup-pill" onclick="openCooldownGuide('${runType}',${i})">${e.name}</span>`
  ).join('');

  const btn = isDone
    ? `<button class="btn btn-ghost" style="width:100%" onclick="openCooldownGuide('${runType}')">↺ Restart Cool-Down</button>`
    : `<button class="btn btn-blue" style="width:100%" onclick="openCooldownGuide('${runType}')">Start Guided Cool-Down →</button>`;

  return `
    <div class="stats-card cooldown-card${isDone ? ' cooldown-done' : ''}">
      <div class="warmup-header">
        <span class="warmup-title">Post-Run Cool-Down</span>
        ${isDone
          ? `<span class="warmup-done-badge">✓ Done</span>`
          : `<span class="cooldown-time">~${totalMins} min</span>`}
      </div>
      <div class="warmup-meta">${exercises.length} exercises</div>
      <div class="warmup-pills">${pills}</div>
      ${btn}
    </div>`;
}

let _cooldownExs      = [];
let _cooldownIdx      = 0;
let _cooldownRunType  = 'easy';
let _cooldownDoneDate = null;

export function openCooldownGuide(runType, startIdx = 0) {
  const ids   = COOLDOWN_ROUTINES[runType] || COOLDOWN_ROUTINES.rest;
  const exMap = Object.fromEntries(COOLDOWN_EXERCISES.map(e => [e.id, e]));
  _cooldownExs    = ids.map(id => exMap[id]).filter(Boolean);
  _cooldownIdx    = Math.max(0, Math.min(_cooldownExs.length - 1, startIdx));
  _cooldownRunType = runType;
  _renderCooldownStep();
}

function _renderCooldownStep() {
  const ex     = _cooldownExs[_cooldownIdx];
  const total  = _cooldownExs.length;
  const isLast = _cooldownIdx === total - 1;
  const typeColor = '#3b82f6';

  const pills = _cooldownExs.map((e, i) => {
    const cls   = i < _cooldownIdx ? 'wg-pill done' : i === _cooldownIdx ? 'wg-pill current' : 'wg-pill';
    const label = i < _cooldownIdx ? `✓ ${e.name}` : e.name;
    return `<span class="${cls}" onclick="cooldownJump(${i})">${label}</span>`;
  }).join('');

  let el = document.getElementById('cooldown-guide');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cooldown-guide';
    document.body.appendChild(el);
  }
  el.style.setProperty('--wg-color', typeColor);

  const pct = Math.round((_cooldownIdx + 1) / total * 100);

  el.innerHTML = `
    <div class="wg-progress-bar"><div class="wg-progress-fill" style="width:${pct}%"></div></div>
    <div class="wg-topbar">
      <span></span>
      <span class="wg-counter">${_cooldownIdx + 1} of ${total}</span>
      <button class="wg-close" onclick="closeCooldownGuide()" aria-label="Exit">✕</button>
    </div>
    <div class="wg-card">
      <div class="wg-step-num">${_cooldownIdx + 1}</div>
      <div class="wg-name">${ex.name}</div>
      <div class="wg-dur-pill">${ex.dur}</div>
      <div class="wg-desc">${ex.desc}</div>
    </div>
    <div class="wg-actions">
      ${_cooldownIdx > 0
        ? `<button class="btn btn-ghost" onclick="cooldownStep(-1)">← Prev</button>`
        : '<span></span>'}
      ${isLast
        ? `<button class="btn btn-success" onclick="finishCooldownGuide()">Done ✓</button>`
        : `<button class="btn btn-blue" onclick="cooldownStep(1)">Next →</button>`}
    </div>
    <div class="wg-pills">${pills}</div>
  `;
}

export function cooldownStep(dir) {
  _cooldownIdx = Math.max(0, Math.min(_cooldownExs.length - 1, _cooldownIdx + dir));
  _renderCooldownStep();
}

export function cooldownJump(idx) {
  _cooldownIdx = Math.max(0, Math.min(_cooldownExs.length - 1, idx));
  _renderCooldownStep();
}

export function finishCooldownGuide() {
  _cooldownDoneDate = dStr(new Date());
  document.getElementById('cooldown-guide')?.remove();
  renderMainContent();
}

export function closeCooldownGuide() {
  document.getElementById('cooldown-guide')?.remove();
}

function renderInjuriesHTML() {
  const all    = state.injuries || [];
  const active = all.filter(i => !i.resolved);
  const sevColor = { Mild: '#f59e0b', Moderate: '#f97316', Severe: '#ef4444' };
  const chips = active.map(inj => `
    <div class="inj-chip inj-sev-${inj.severity.toLowerCase()}" onclick="openInjuryModal('${inj.id}')">
      <span class="inj-chip-dot" style="background:${sevColor[inj.severity] || 'var(--t3)'}"></span>
      <span class="inj-chip-part">${esc(inj.bodyPart)}</span>
      <span class="inj-chip-sev">${esc(inj.severity)}</span>
    </div>`).join('');
  const resolvedNote = all.length > active.length
    ? `<div style="font-size:0.75rem;color:var(--t3);margin-top:6px">${all.length - active.length} resolved</div>` : '';
  return `
    <div class="stats-card">
      <div class="sc-title">Injuries</div>
      ${active.length
        ? `<div class="inj-chips">${chips}</div>${resolvedNote}`
        : `<div style="color:var(--t3);font-size:0.82rem;margin-bottom:10px">No active injuries — great shape!</div>`}
      <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="openInjuryModal()">+ Log Injury</button>
    </div>`;
}

// ---- Weekly Recap helpers ----

function buildWeekRecap(week) {
  const runs    = state.plan.filter(r => r.week === week && !r.userAdded);
  const planned = runs.reduce((s, r) => s + r.distance, 0);
  const done    = runs.filter(r => r.completed).reduce((s, r) => s + (r.actualDistance ?? r.distance), 0);
  const nDone   = runs.filter(r => r.completed).length;
  const nTotal  = runs.length;
  const adh     = planned > 0 ? Math.round(done / planned * 100) : 0;
  const paces   = runs.filter(r => r.completed && r.actualPace).map(r => r.actualPace);
  const bestPace = paces.length ? Math.min(...paces) : null;
  return { planned, done, nDone, nTotal, adh, bestPace };
}

function recapMsg(adh) {
  if (adh >= 95) return 'Excellent execution — you nailed this week.';
  if (adh >= 80) return 'Solid week. Consistency is how races are won.';
  if (adh >= 60) return 'Some bumps, but you showed up. Keep it going.';
  return 'A tough week. Tomorrow is a fresh start.';
}

function renderWeeklyRecapCard(prevWeek) {
  const { planned, done, nDone, nTotal, adh, bestPace } = buildWeekRecap(prevWeek);
  if (!nTotal) return '';
  const adhColor = adh >= 80 ? 'var(--green)' : adh >= 60 ? 'var(--orange)' : 'var(--red)';
  return `
    <div class="stats-card recap-card">
      <div class="recap-title">Week ${prevWeek} Recap</div>
      <div class="recap-sub">Here's how last week went</div>
      <div class="recap-stats">
        <div>
          <div class="recap-stat-val" style="color:${adhColor}">${adh}%</div>
          <div class="recap-stat-lbl">adherence</div>
        </div>
        <div>
          <div class="recap-stat-val">${nDone}/${nTotal}</div>
          <div class="recap-stat-lbl">runs done</div>
        </div>
        <div>
          <div class="recap-stat-val">${done.toFixed(1)}</div>
          <div class="recap-stat-lbl">mi run</div>
        </div>
        ${bestPace ? `<div>
          <div class="recap-stat-val">${fmtPace(bestPace)}</div>
          <div class="recap-stat-lbl">best pace</div>
        </div>` : '<div></div>'}
      </div>
      <div class="recap-msg">${recapMsg(adh)}</div>
      <button class="btn btn-ghost btn-sm" onclick="dismissWeeklyRecap(${prevWeek})">Dismiss</button>
    </div>`;
}

// ---- Mid-Plan Check-In helpers ----

function renderMidCheckInCard() {
  const totalWeeks  = getPlanTotalWeeks();
  const curWeek     = getCurrentWeek();
  const plannedRuns = state.plan.filter(r => !r.userAdded);
  const planned     = plannedRuns.reduce((s, r) => s + r.distance, 0);
  const done        = plannedRuns.filter(r => r.completed).reduce((s, r) => s + (r.actualDistance ?? r.distance), 0);
  const adh         = planned > 0 ? Math.round(done / planned * 100) : 0;
  const goalSecs    = estimateHalf(
    parseTimeSecs(state.profile?.fiveKTime),
    parseTimeSecs(state.profile?.tenKTime)
  );
  const projSecs    = getTrainingProjection();
  const adhColor    = adh >= 80 ? 'var(--green)' : adh >= 60 ? 'var(--orange)' : 'var(--red)';

  const goalRow = goalSecs
    ? `<div class="checkin-stat"><div class="checkin-stat-val">${fmtSecs(goalSecs)}</div><div class="checkin-stat-lbl">goal time</div></div>`
    : '';
  const projRow = projSecs
    ? `<div class="checkin-stat"><div class="checkin-stat-val">${fmtSecs(projSecs)}</div><div class="checkin-stat-lbl">training projection</div></div>`
    : '';

  return `
    <div class="stats-card checkin-card">
      <div class="checkin-title">Halfway Check-In</div>
      <div class="checkin-sub">Week ${curWeek} of ${totalWeeks} — time to assess your training</div>
      <div class="checkin-stats">
        <div class="checkin-stat">
          <div class="checkin-stat-val" style="color:${adhColor}">${adh}%</div>
          <div class="checkin-stat-lbl">adherence</div>
        </div>
        ${goalRow}${projRow}
      </div>
      <div style="font-size:0.8rem;color:var(--t2);margin-bottom:12px">How do you feel about your current training load?</div>
      <div class="checkin-actions">
        <button class="btn btn-ghost btn-sm" onclick="midCheckInAction('push')" title="Reduce future paces by ~5%">Push Harder</button>
        <button class="btn btn-primary btn-sm" onclick="midCheckInAction('stay')">Stay the Course</button>
        <button class="btn btn-ghost btn-sm" onclick="midCheckInAction('ease')" title="Increase future paces by ~5%">Ease Off</button>
      </div>
    </div>`;
}

// ---- Race Day helpers ----

const RACE_QUOTES = [
  { text: 'The miracle isn\'t that I finished. The miracle is that I had the courage to start.', author: 'John Bingham' },
  { text: 'Run when you can, walk if you have to, crawl if you must — just never give up.', author: 'Dean Karnazes' },
  { text: 'Pain is temporary. Quitting lasts forever.', author: 'Lance Armstrong' },
  { text: 'Champions are made from something deep inside — a desire, a dream, a vision.', author: 'Muhammad Ali' },
  { text: 'You\'ve done the training. Trust your body. Today is your day.', author: '' },
  { text: 'The race always hurts. Expect it to hurt. You don\'t train to make it not hurt. You train to make it hurt less.', author: 'Unknown' },
];

function pickQuote(raceDate) {
  const hash = raceDate.replace(/-/g, '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return RACE_QUOTES[hash % RACE_QUOTES.length];
}

function renderRaceDayHTML() {
  const profile  = state.profile;
  const raceDate = profile?.raceDate;
  const result   = state.raceResult;

  const goalSecs = estimateHalf(
    parseTimeSecs(profile?.fiveKTime),
    parseTimeSecs(profile?.tenKTime)
  );
  const projSecs = getTrainingProjection();

  // Post-result view
  if (result?.timeSecs) {
    const delta = result.timeSecs - (goalSecs || result.timeSecs);
    const faster = delta <= 0;
    const absDelta = Math.abs(delta);
    const deltaLabel = goalSecs
      ? `${faster ? '' : '+'}${faster ? '-' : ''}${fmtSecs(absDelta)} ${faster ? 'faster' : 'slower'} than goal`
      : '';
    return `
      <div class="today-layout fade-in">
        <div class="today-date-header">
          <div class="today-weekday">Race Day</div>
          <div class="today-dateline">${raceDate || ''}</div>
        </div>
        <div class="stats-card">
          <div class="raceday-layout">
            <div class="rd-result-banner">You did it!</div>
            <div class="rd-result-time">${fmtSecs(result.timeSecs)}</div>
            ${deltaLabel ? `<div class="rd-result-delta ${faster ? 'rd-delta-faster' : 'rd-delta-slower'}">${deltaLabel}</div>` : ''}
            ${result.notes ? `<div class="rd-result-notes">"${esc(result.notes)}"</div>` : ''}
            <div class="rd-result-actions">
              <button class="btn btn-ghost full" onclick="openRaceResultModal(true)">Edit Result</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Pre-race view
  const quote = pickQuote(raceDate || 'default');
  const now   = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Pacing strategy
  let pacingHTML = '';
  const racePaceSecs = goalSecs ? goalSecs / 13.1 : (projSecs ? projSecs / 13.1 : null);
  if (racePaceSecs) {
    const early  = fmtPace(Math.round(racePaceSecs * 1.03));
    const mid    = fmtPace(Math.round(racePaceSecs));
    const finish = fmtPace(Math.round(racePaceSecs * 0.97));
    pacingHTML = `
      <div class="rd-pacing">
        <div class="rd-pacing-title">Pacing Strategy</div>
        <div class="rd-pace-row"><span class="rd-pace-range">Miles 1–3</span><span class="rd-pace-val">${early}/mi</span></div>
        <div class="rd-pace-row"><span class="rd-pace-range">Miles 4–10</span><span class="rd-pace-val">${mid}/mi</span></div>
        <div class="rd-pace-row"><span class="rd-pace-range">Miles 11–13</span><span class="rd-pace-val">${finish}/mi</span></div>
      </div>`;
  }

  const timesHTML = (goalSecs || projSecs) ? `
    <div class="rd-times-grid">
      ${goalSecs ? `<div class="rd-time-card"><div class="rd-time-val">${fmtSecs(goalSecs)}</div><div class="rd-time-lbl">Goal Time</div></div>` : ''}
      ${projSecs ? `<div class="rd-time-card"><div class="rd-time-val">${fmtSecs(projSecs)}</div><div class="rd-time-lbl">Training Projection</div></div>` : ''}
    </div>` : '';

  return `
    <div class="today-layout fade-in">
      <div class="today-date-header">
        <div class="today-weekday">${dateLabel}</div>
      </div>
      <div class="stats-card">
        <div class="raceday-layout">
          <div class="rd-banner">RACE DAY</div>
          ${timesHTML}
          ${pacingHTML}
          <div class="rd-quote">
            "${quote.text}"
            ${quote.author ? `<div class="rd-quote-author">— ${quote.author}</div>` : ''}
          </div>
          <button class="btn btn-primary rd-log-btn" onclick="openRaceResultModal(false)">Log My Finish Time</button>
        </div>
      </div>
    </div>`;
}

function renderTodayHTML() {
  const today = dStr(new Date());
  const now   = new Date();

  // Race day check — replace entire Today tab
  if (state.profile?.raceDate === today) return renderRaceDayHTML();

  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const curWeek    = getCurrentWeek();
  const totalWeeks = getPlanTotalWeeks();

  // Weekly recap: show when entering a new week (curWeek > 1) and not yet dismissed
  const showRecap = curWeek > 1 && state.weeklyRecapDismissed !== curWeek - 1;

  // Mid-plan check-in: show once when past the plan midpoint and not dismissed
  const showMidCheckIn = curWeek >= Math.ceil(totalWeeks / 2) && !state.midCheckInDismissed;

  // Today's run(s) from plan
  const todayRuns = state.plan.filter(r => r.date === today);

  const runSection = todayRuns.length
    ? todayRuns.map(r => {
        const statusLabel = r.completed ? 'Completed' : r.skipped ? 'Skipped' : 'Scheduled';
        const statusColor = r.completed ? 'var(--green)' : r.skipped ? 'var(--red)' : 'var(--orange)';
        return `
          <div class="today-run-card" onclick="openModal('${r.id}')">
            <div class="today-run-type ct-${r.type}">${esc(r.label)}</div>
            <div class="today-run-meta">${r.distance} mi &nbsp;·&nbsp; ${fmtPace(r.actualPace ?? r.estimatedPace)}</div>
            <div class="today-run-status" style="color:${statusColor}">${statusLabel}</div>
          </div>`;
      }).join('')
    : `<div class="today-rest">Rest day — no run scheduled today.</div>`;

  // CT activities today
  const ctToday = (state.crossTraining || []).filter(ct => ct.date === today);
  const ctItems = ctToday.map(ct => `
    <div class="today-ct-item" onclick="openCTModal(null,'${ct.id}')">
      <span class="today-ct-type">${esc(ct.type)}</span>
      ${ct.duration ? `<span class="today-ct-dur">${ct.duration} min</span>` : ''}
      ${ct.notes   ? `<span class="today-ct-notes">${esc(ct.notes)}</span>` : ''}
    </div>`).join('');

  // This week summary
  const weekRuns = state.plan.filter(r => r.week === curWeek);
  const miAll    = weekRuns.reduce((s,r) => s + r.distance, 0);
  const miComp   = weekRuns.filter(r => r.completed).reduce((s,r) => s + (r.actualDistance ?? r.distance), 0);
  const ctWeek   = (state.crossTraining || []).filter(ct => {
    const weekRun = weekRuns[0];
    if (!weekRun) return false;
    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay());
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const d = new Date(ct.date + 'T00:00:00');
    return d >= mon && d <= sun;
  });

  // Determine run type for warm-up (only show if a run is scheduled today)
  const activeRun    = todayRuns.find(r => !r.completed && !r.skipped) || todayRuns[0];
  const todayRunType = activeRun?.type || null;

  return `
    <div class="today-layout fade-in">

      <div class="today-date-header">
        <div class="today-weekday">${weekday}</div>
        <div class="today-dateline">${dateLabel}</div>
      </div>

      ${showRecap ? renderWeeklyRecapCard(curWeek - 1) : ''}
      ${showMidCheckIn ? renderMidCheckInCard() : ''}

      <div class="stats-card">
        <div class="sc-title">Today's Run</div>
        ${runSection}
        <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="openDayCellPicker('${today}')">+ Add Activity</button>
      </div>

      ${todayRunType ? renderWarmupHTML(todayRunType) : ''}
      ${todayRunType ? renderCooldownHTML(todayRunType) : ''}
      ${renderInjuriesHTML()}

      <div class="stats-card">
        <div class="sc-title" style="margin-bottom:${ctToday.length ? '10px' : '0'}">Cross Training Today</div>
        ${ctItems || '<div style="color:var(--t3);font-size:0.82rem;margin-bottom:10px">Nothing logged yet.</div>'}
        <button class="btn btn-ghost btn-sm" style="margin-top:${ctToday.length ? '8px' : '0'}" onclick="openCTModal('${today}')">+ Log Cross Training</button>
      </div>

      <div class="stats-card">
        <div class="sc-title">This Week — Week ${curWeek} of ${totalWeeks}</div>
        <div class="today-week-row">
          <div class="today-week-stat">
            <div class="today-week-val" style="color:var(--green)">${miComp.toFixed(1)}</div>
            <div class="today-week-lbl">mi run</div>
          </div>
          <div class="today-week-stat">
            <div class="today-week-val" style="color:var(--orange)">${miAll.toFixed(1)}</div>
            <div class="today-week-lbl">mi planned</div>
          </div>
          <div class="today-week-stat">
            <div class="today-week-val" style="color:var(--blue)">${weekRuns.filter(r=>r.completed).length}/${weekRuns.length}</div>
            <div class="today-week-lbl">runs done</div>
          </div>
          <div class="today-week-stat">
            <div class="today-week-val" style="color:#38bdf8">${ctWeek.length}</div>
            <div class="today-week-lbl">cross train</div>
          </div>
        </div>
      </div>

    </div>
  `;
}

export function shareReadOnlyUrl() {
  const { name, planType, raceDate, startDate, daysPerWeek, longRunDay } = state.profile || {};
  const data = {
    profile: { name, planType, raceDate, startDate, daysPerWeek, longRunDay },
    plan: (state.plan || []).map(({ id, date, type, distance, estimatedPace,
      completed, skipped, week, label, actualDistance, actualPace }) =>
      ({ id, date, type, distance, estimatedPace, completed, skipped, week, label, actualDistance, actualPace }))
  };
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)));
  const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`;
  navigator.clipboard.writeText(url).then(() => {
    import('./feedback.js').then(m => m.showToast('Share link copied!', 'ok'));
  });
}

export function renderMainContent() {
  const main = document.getElementById('main-content');
  if (!main) return;
  if (state.view === 'plan') {
    main.innerHTML = renderPlanHTML();
    if (state.readOnly) main.firstElementChild?.classList.add('readonly-plan');
    else setupDragListeners();
  } else if (state.view === 'today') {
    main.innerHTML = renderTodayHTML();
  } else {
    main.innerHTML = renderStatsHTML();
  }
}

export function switchView(v) {
  state.view = v;
  saveState();
  renderApp();
}

export function renderApp() {
  if (!state.profile) {
    document.getElementById('app-nav').style.display = 'none';
    // Lazy import to break circular dependency at module init time
    import('./render-setup.js').then(m => m.renderSetupWizard());
    return;
  }

  const nav = document.getElementById('app-nav');
  nav.style.display = 'flex';

  // Read-only mode: single tab, no edit controls, banner above content
  if (state.readOnly) {
    document.getElementById('nav-tabs').innerHTML = `
      <button class="nav-tab active">Plan</button>
    `;
    document.getElementById('nav-right').innerHTML = `<span class="ro-badge">Read Only</span>`;
    if (!document.querySelector('.ro-banner')) {
      const p = state.profile;
      const planLabel = { training: 'Training', punishment: 'Punishment' }[p.planType] || (p.planType ? p.planType.charAt(0).toUpperCase() + p.planType.slice(1) : 'Training');
      const raceLine = p.raceDate
        ? new Date(p.raceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;
      const banner = document.createElement('div');
      banner.className = 'ro-banner';
      banner.innerHTML = `
        <div class="ro-banner-eyebrow">Shared Training Plan</div>
        <div class="ro-banner-name">${esc(p.name || 'Training Plan')}</div>
        <div class="ro-banner-meta">${esc(planLabel)} Plan${raceLine ? ` &nbsp;·&nbsp; Race: ${raceLine}` : ''}</div>
      `;
      document.getElementById('main-content').before(banner);
    }
    renderMainContent();
    return;
  }

  document.getElementById('nav-tabs').innerHTML = `
    <button class="nav-tab ${state.view==='today'?'active':''}" onclick="switchView('today')">Today</button>
    <button class="nav-tab ${state.view==='plan'?'active':''}" onclick="switchView('plan')"><span class="tab-full">Training Plan</span><span class="tab-abbr">Plan</span></button>
    <button class="nav-tab ${state.view==='stats'?'active':''}" onclick="switchView('stats')"><span class="tab-full">Stats &amp; Progress</span><span class="tab-abbr">Stats</span></button>
  `;
  const _planType = state.profile.planType || 'training';
  const _planDisplay = { training: 'Training', punishment: 'Punishment' }[_planType] || (_planType.charAt(0).toUpperCase() + _planType.slice(1));
  document.getElementById('nav-right').innerHTML = `
    <span class="nav-plan-type${_planType === 'punishment' ? ' nav-plan-type--punishment' : ''}">${_planDisplay}</span>
    <button class="btn btn-ghost nav-share-btn" onclick="shareReadOnlyUrl()">↑<span class="btn-txt"> Share</span></button>
    <button class="btn btn-ghost" onclick="openEditProfile()">⚙<span class="btn-txt"> Settings</span></button>
    <button class="btn btn-ghost" onclick="resetConfirm()">↺<span class="btn-txt"> Reset</span></button>
  `;

  renderMainContent();
}
