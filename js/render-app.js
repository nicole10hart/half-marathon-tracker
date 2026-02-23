import { state, saveState } from './state.js';
import { dStr, fmtPace } from './utils.js';
import { getCurrentWeek, getPlanTotalWeeks } from './plan-generator.js';
import { renderPlanHTML, setupDragListeners } from './render-plan.js';
import { renderStatsHTML } from './render-stats.js';
// render-setup imported lazily to avoid circular dependency at module init time
// (render-setup.js calls renderApp via dynamic import)

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
            <div class="today-run-type ct-${r.type}">${r.label}</div>
            <div class="today-run-meta">${r.distance} mi &nbsp;·&nbsp; ${fmtPace(r.actualPace ?? r.estimatedPace)}</div>
            <div class="today-run-status" style="color:${statusColor}">${statusLabel}</div>
          </div>`;
      }).join('')
    : `<div class="today-rest">Rest day — no run scheduled today.</div>`;

  // CT activities today
  const ctToday = (state.crossTraining || []).filter(ct => ct.date === today);
  const ctItems = ctToday.map(ct => `
    <div class="today-ct-item" onclick="openCTModal(null,'${ct.id}')">
      <span class="today-ct-type">${ct.type}</span>
      ${ct.duration ? `<span class="today-ct-dur">${ct.duration} min</span>` : ''}
      ${ct.notes   ? `<span class="today-ct-notes">${ct.notes}</span>` : ''}
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
