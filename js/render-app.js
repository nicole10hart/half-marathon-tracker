import { state, saveState } from './state.js';
import { dStr, fmtPace, esc } from './utils.js';
import { getCurrentWeek, getPlanTotalWeeks } from './plan-generator.js';
import { renderPlanHTML, setupDragListeners } from './render-plan.js';
import { renderStatsHTML } from './render-stats.js';
import { WARMUP_EXERCISES } from './constants.js';
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
      <span class="wg-counter">${_warmupIdx + 1} of ${total}</span>
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

function renderTodayHTML() {
  const today = dStr(new Date());
  const now   = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateLabel = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

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
  const curWeek    = getCurrentWeek();
  const totalWeeks = getPlanTotalWeeks();
  const weekRuns   = state.plan.filter(r => r.week === curWeek);
  const miAll      = weekRuns.reduce((s,r) => s + r.distance, 0);
  const miComp     = weekRuns.filter(r => r.completed).reduce((s,r) => s + (r.actualDistance ?? r.distance), 0);
  const ctWeek     = (state.crossTraining || []).filter(ct => {
    const weekRun = weekRuns[0];
    if (!weekRun) return false;
    // Include CT entries within the same calendar week
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

      <div class="stats-card">
        <div class="sc-title">Today's Run</div>
        ${runSection}
        <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="openDayCellPicker('${today}')">+ Add Activity</button>
      </div>

      ${todayRunType ? renderWarmupHTML(todayRunType) : ''}

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

export function renderMainContent() {
  const main = document.getElementById('main-content');
  if (!main) return;
  if (state.view === 'plan') {
    main.innerHTML = renderPlanHTML();
    setupDragListeners();
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

  document.getElementById('nav-tabs').innerHTML = `
    <button class="nav-tab ${state.view==='today'?'active':''}" onclick="switchView('today')">Today</button>
    <button class="nav-tab ${state.view==='plan'?'active':''}" onclick="switchView('plan')"><span class="tab-full">Training Plan</span><span class="tab-abbr">Plan</span></button>
    <button class="nav-tab ${state.view==='stats'?'active':''}" onclick="switchView('stats')"><span class="tab-full">Stats &amp; Progress</span><span class="tab-abbr">Stats</span></button>
  `;
  document.getElementById('nav-right').innerHTML = `
    <button class="btn btn-ghost" onclick="openEditProfile()">⚙<span class="btn-txt"> Settings</span></button>
    <button class="btn btn-ghost" onclick="resetConfirm()">↺<span class="btn-txt"> Reset</span></button>
  `;

  renderMainContent();
}
