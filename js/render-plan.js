import { state } from './state.js';
import { dStr, parseDate, fmtPace } from './utils.js';
import {
  isCutbackWFE, getPlanTotalWeeks, getCurrentWeek, raceCountdown,
} from './plan-generator.js';
import { getStats } from './render-stats.js';

export function runCardHTML(run) {
  const cls = [
    'run-card',
    `rc-${run.type}`,
    run.completed      ? 'completed'      : '',
    run.skipped        ? 'skipped'        : '',
    run.stravaVerified ? 'strava-verified' : '',
    run.stravaDeclined ? 'strava-declined' : '',
  ].filter(Boolean).join(' ');

  const typeIcon  = run.type === 'race' ? '🏅' : '';
  const stravaTag = run.stravaVerified ? `<span class="rc-strava-s">S</span>` : '';

  const hasActual = run.completed && run.actualDistance != null && run.actualDistance !== run.distance;
  const distHTML  = hasActual
    ? `<div class="rc-actual">${run.actualDistance} mi</div><div class="rc-planned">${run.distance} planned</div>`
    : `<div class="rc-dist">${run.distance} mi</div>`;

  return `
    <div class="${cls}"
         draggable="true"
         data-run-id="${run.id}"
         ondragstart="onDragStart(event,'${run.id}')"
         onclick="openModal('${run.id}')">
      <div class="rc-type ct-${run.type}">${typeIcon}${run.label}${stravaTag}</div>
      ${distHTML}
      <div class="rc-pace">${fmtPace(run.actualPace ?? run.estimatedPace)}</div>
    </div>`;
}

export function renderPlanMobileHTML() {
  const curWeek    = getCurrentWeek();
  const totalWeeks = getPlanTotalWeeks();
  const stats      = getStats();
  const pct        = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  const byWeek = {};
  state.plan.forEach(r => { (byWeek[r.week] = byWeek[r.week] || []).push(r); });
  Object.values(byWeek).forEach(arr => arr.sort((a,b) => a.date.localeCompare(b.date)));

  let weeksHtml = '';
  for (let week = 1; week <= totalWeeks; week++) {
    const weekRuns = byWeek[week];
    if (!weekRuns) continue;

    const isCur   = week === curWeek;
    const isRace  = week === totalWeeks;
    const wFE     = weekRuns[0].wFE ?? (totalWeeks - week);
    const isCut   = !isRace && isCutbackWFE(wFE);
    const isTaper = !isRace && wFE <= 2;

    const miAll  = weekRuns.reduce((s,r) => s + r.distance, 0);
    const miComp = weekRuns.filter(r => r.completed).reduce((s,r) => s + r.distance, 0);

    let badge = '';
    if (isRace)       badge = `<span class="week-badge wb-race">🏅 Race</span>`;
    else if (isCut)   badge = `<span class="week-badge wb-cut">Cutback</span>`;
    else if (isTaper) badge = `<span class="week-badge wb-tap">Taper</span>`;

    // Collect ALL CT entries for this week's date range (not just run days)
    const runDatesSet = new Set(weekRuns.map(r => r.date));
    const earliest = weekRuns.reduce((a,b) => a.date < b.date ? a : b).date;
    const sun = new Date(parseDate(earliest));
    sun.setDate(sun.getDate() - sun.getDay());
    const weekDates = Array.from({length:7}, (_,i) => {
      const d = new Date(sun); d.setDate(sun.getDate() + i); return dStr(d);
    });
    const ctByDate = {};
    (state.crossTraining||[]).filter(ct => weekDates.includes(ct.date))
      .forEach(ct => { (ctByDate[ct.date] = ctByDate[ct.date] || []).push(ct); });
    // CT-only dates (rest days with cross training)
    const ctOnlyDates = weekDates.filter(d => !runDatesSet.has(d) && ctByDate[d]?.length);

    const runRows = weekRuns.map(r => {
      const rd        = parseDate(r.date);
      const dateLabel = rd.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      const stCls  = r.completed ? 'mob-st-done' : r.skipped ? 'mob-st-skip' : 'mob-st-todo';
      const stIcon = r.completed ? '✓' : r.skipped ? '—' : '›';
      const rowCls = [
        r.completed ? 'done' : r.skipped ? 'skip' : '',
        r.stravaVerified ? 'strava-verified' : '',
        r.stravaDeclined ? 'strava-declined' : '',
      ].filter(Boolean).join(' ');
      const hasActual  = r.completed && r.actualDistance != null && r.actualDistance !== r.distance;
      const distLine   = hasActual
        ? `${r.actualDistance} mi <span class="mob-run-actual">(${r.distance} planned)</span>`
        : `${r.distance} mi`;
      const stravaTag  = r.stravaVerified ? ` <span class="rc-strava-s">S</span>` : '';
      return `
        <div class="mob-run ${rowCls}" onclick="openModal('${r.id}')">
          <div class="mob-run-date">${dateLabel}</div>
          <div class="mob-run-body">
            <div class="mob-run-label ct-${r.type}">${r.label}${stravaTag}</div>
            <div class="mob-run-dist">${distLine} &nbsp;·&nbsp; ${fmtPace(r.actualPace ?? r.estimatedPace)}</div>
          </div>
          <div class="mob-run-status ${stCls}">${stIcon}</div>
        </div>
        ${(ctByDate[r.date]||[]).map(ct =>
          `<div class="ct-item mob-ct-item" onclick="openCTModal(null,'${ct.id}')">${ct.type}${ct.duration ? ` · ${ct.duration} min` : ''}</div>`
        ).join('')}`;
    }).join('');

    const ctOnlyRows = ctOnlyDates.sort().map(d => {
      const rd = parseDate(d);
      const dateLabel = rd.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      return ctByDate[d].map(ct =>
        `<div class="mob-run" onclick="openCTModal(null,'${ct.id}')">
          <div class="mob-run-date">${dateLabel}</div>
          <div class="mob-run-body">
            <div class="mob-run-label" style="color:#38bdf8">${ct.type}</div>
            ${ct.duration ? `<div class="mob-run-dist">${ct.duration} min</div>` : ''}
          </div>
          <div class="mob-run-status mob-st-todo" style="background:#38bdf8;color:#0f172a">+</div>
        </div>`
      ).join('');
    }).join('');

    weeksHtml += `
      <div class="mob-week${isCur ? ' cur' : ''}">
        <div class="mob-week-hdr">
          <div class="mob-wk-left">
            <span class="mob-wk-num${isCur ? ' cur' : ''}">${isCur ? '▶ ' : ''}Week ${week}</span>
            ${badge}
          </div>
          <div class="mob-wk-mi">${miComp.toFixed(1)} / ${miAll.toFixed(1)} mi</div>
        </div>
        ${runRows}
        ${ctOnlyRows}
      </div>`;
  }

  return `
    <div class="progress-header fade-in">
      <div class="ph-info">
        <div class="ph-title">${state.profile.name}'s Plan</div>
        <div class="ph-sub">Week ${curWeek} of ${totalWeeks} &nbsp;·&nbsp; ${raceCountdown()}</div>
      </div>
      <div class="ph-bar-wrap">
        <div class="ph-bar-top"><span>Progress</span><span>${pct}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="ph-kpis">
        <div class="kpi"><div class="kpi-val g">${stats.completed}</div><div class="kpi-label">Done</div></div>
        <div class="kpi"><div class="kpi-val r">${stats.skipped}</div><div class="kpi-label">Skipped</div></div>
        <div class="kpi"><div class="kpi-val o">${stats.upcoming}</div><div class="kpi-label">Left</div></div>
      </div>
      ${!!(state.strava?.accessToken) ? `<button id="strava-sync-btn" class="btn strava-sync-btn" onclick="stravaBulkSync()">Sync Strava</button>` : ''}
    </div>
    <div class="mob-plan fade-in">${weeksHtml}</div>
  `;
}

export function renderPlanHTML() {
  if (window.innerWidth < 640) return renderPlanMobileHTML();
  const today      = dStr(new Date());
  const curWeek    = getCurrentWeek();
  const totalWeeks = getPlanTotalWeeks();
  const stats      = getStats();
  const pct        = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  const byDate = {};
  state.plan.forEach(r => {
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });

  let lastSeenMonth = -1;
  let weeksHtml = '';

  for (let week = 1; week <= totalWeeks; week++) {
    const weekRuns = state.plan.filter(r => r.week === week);
    if (!weekRuns.length) continue;

    const isCur  = week === curWeek;
    const isRace = week === totalWeeks;
    const wFE    = weekRuns[0].wFE ?? (totalWeeks - week);
    const isCut  = !isRace && isCutbackWFE(wFE);
    const isTaper = !isRace && wFE <= 2;

    const miAll  = weekRuns.reduce((s,r) => s+r.distance, 0);
    const miComp = weekRuns.filter(r=>r.completed).reduce((s,r) => s+r.distance, 0);

    const runDates = weekRuns.map(r => parseDate(r.date));
    const earliest = runDates.reduce((a,b) => a<b?a:b);
    const sun = new Date(earliest);
    sun.setDate(earliest.getDate() - earliest.getDay());

    let badge = '';
    if (isRace)        badge = `<span class="week-badge wb-race">🏅 Race</span>`;
    else if (isCut)    badge = `<span class="week-badge wb-cut">Cutback</span>`;
    else if (isTaper)  badge = `<span class="week-badge wb-tap">Taper</span>`;

    const weekLabel = `
      <div class="week-label ${isCur?'cur':''}">
        <div class="wl-num ${isCur?'cur':''}">${isCur?'▶ ':''}Wk ${week}</div>
        <div class="wl-mi">${miComp.toFixed(1)}/${miAll.toFixed(1)} mi</div>
        ${badge}
      </div>`;

    let dayCols = '';
    for (let col = 0; col < 7; col++) {
      const cellDate = new Date(sun);
      cellDate.setDate(sun.getDate() + col);
      const ds       = dStr(cellDate);
      const isToday  = ds === today;
      const cellRuns = (byDate[ds]||[]).filter(r => r.week === week);
      const cards    = cellRuns.map(r => runCardHTML(r)).join('');
      const ctCards  = (state.crossTraining||[]).filter(ct => ct.date === ds)
        .map(ct => `<div class="ct-item" onclick="openCTModal(null,'${ct.id}')">${ct.type}${ct.duration ? ` · ${ct.duration} min` : ''}</div>`).join('');

      const curMonth = cellDate.getMonth();
      const showMonth = curMonth !== lastSeenMonth;
      if (showMonth) lastSeenMonth = curMonth;
      const dayLabel = showMonth
        ? cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : cellDate.getDate();

      dayCols += `
        <div class="day-cell${isToday?' today':''}"
             data-date="${ds}"
             onclick="dayCellClick(event,'${ds}')"
             ondragover="onDragOver(event)"
             ondragleave="onDragLeave(event)"
             ondrop="onDrop(event,'${ds}')">
          <span class="day-date${isToday?' today-label':''}">${dayLabel}</span>
          ${cards}
          ${ctCards}
        </div>`;
    }

    weeksHtml += `
      <div class="week-row${isCur?' cur-row':''}">
        ${weekLabel}
        ${dayCols}
      </div>`;
  }

  return `
    <div class="progress-header fade-in">
      <div class="ph-info">
        <div class="ph-title">${state.profile.name}'s Half Marathon Plan</div>
        <div class="ph-sub">Week ${curWeek} of ${totalWeeks} &nbsp;·&nbsp; ${raceCountdown()}</div>
      </div>
      <div class="ph-bar-wrap">
        <div class="ph-bar-top">
          <span>Overall Progress</span>
          <span>${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="ph-kpis">
        <div class="kpi"><div class="kpi-val g">${stats.completed}</div><div class="kpi-label">Done</div></div>
        <div class="kpi"><div class="kpi-val r">${stats.skipped}</div><div class="kpi-label">Skipped</div></div>
        <div class="kpi"><div class="kpi-val o">${stats.upcoming}</div><div class="kpi-label">Left</div></div>
      </div>
    </div>

    <div class="legend">
      <div class="legend-item"><div class="legend-dot ld-easy"></div>Easy</div>
      <div class="legend-item"><div class="legend-dot ld-tempo"></div>Tempo</div>
      <div class="legend-item"><div class="legend-dot ld-long"></div>Long Run</div>
      <div class="legend-item"><div class="legend-dot ld-recovery"></div>Recovery</div>
      <div class="legend-item"><div class="legend-dot ld-race"></div>Race Day</div>
      <div class="legend-item" style="margin-left:auto;font-size:0.72rem;color:var(--t3)">Drag to reschedule &nbsp;·&nbsp; Click for details</div>
      ${!!(state.strava?.accessToken) ? `<button id="strava-sync-btn" class="btn strava-sync-btn" onclick="stravaBulkSync()">Sync Strava</button>` : ''}
    </div>

    <div class="cal-header">
      <div class="cal-h-cell"></div>
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="cal-h-cell">${d}</div>`).join('')}
    </div>

    ${weeksHtml}
  `;
}

export function setupDragListeners() { /* inline ondrag* handlers used in HTML */ }
