import { state } from './state.js';
import { parseTimeSecs, dStr, fmtSecs, fmtPace, parseDate, esc } from './utils.js';
import { estimateHalf, getTrainingProjection, getPaceTrend,
         getCurrentWeek, getPlanTotalWeeks } from './plan-generator.js';
import { CT_TYPES } from './constants.js';

export function getStats() {
  const plan = state.plan;
  const today = dStr(new Date());
  const total     = plan.length;
  const completed = plan.filter(r => r.completed).length;
  const skipped   = plan.filter(r => r.skipped).length;
  const upcoming  = plan.filter(r => !r.completed && !r.skipped).length;
  const milesComp = plan.filter(r => r.completed).reduce((s,r) => s + (r.actualDistance ?? r.distance), 0);
  const milesAll  = plan.reduce((s,r) => s + r.distance, 0);

  // Run streak
  const compDates = new Set(plan.filter(r => r.completed).map(r => r.date));
  let streak = 0;
  const cur = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = dStr(cur);
    if (compDates.has(ds)) { streak++; }
    else if (ds <= today) break;
    cur.setDate(cur.getDate() - 1);
  }

  // Strava verification
  const stravaVerified = plan.filter(r => r.stravaVerified).length;
  const pastCompleted  = plan
    .filter(r => r.completed && r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  let stravaStreak = 0;
  for (const r of pastCompleted) {
    if (r.stravaVerified) stravaStreak++;
    else break;
  }

  // HR aggregates (from Strava-verified runs with HR data)
  const hrRuns   = plan.filter(r => r.stravaVerified && r.avgHR > 0);
  const avgHR    = hrRuns.length ? Math.round(hrRuns.reduce((s,r) => s + r.avgHR, 0) / hrRuns.length) : null;
  const highHR   = hrRuns.length ? Math.max(...hrRuns.map(r => r.maxHR || r.avgHR)) : null;
  const lowAvgHR = hrRuns.length ? Math.min(...hrRuns.map(r => r.avgHR)) : null;

  // Weekly data
  const weeks = {};
  plan.forEach(r => {
    if (!weeks[r.week]) weeks[r.week] = { planned:0, comp:0, skip:0 };
    weeks[r.week].planned += r.distance;
    if (r.completed) weeks[r.week].comp += r.distance;
    if (r.skipped)   weeks[r.week].skip += r.distance;
  });

  const fiveKSecs = parseTimeSecs(state.profile?.fiveKTime);
  const tenKSecs  = parseTimeSecs(state.profile?.tenKTime);
  const halfSecs  = estimateHalf(fiveKSecs, tenKSecs);

  return { total, completed, skipped, upcoming, milesComp, milesAll, streak, weeks, halfSecs, stravaVerified, stravaStreak, avgHR, highHR, lowAvgHR };
}


function renderSummaryCard() {
  const stats = getStats();
  const ct    = state.crossTraining;

  const runningCol = `
    <div class="summary-col summary-running">
      <div class="summary-section-lbl">Running</div>
      <div class="stat-bubbles-2">
        <div class="stat-bubble">
          <div class="sb-val" style="color:var(--green)">${stats.milesComp.toFixed(1)}</div>
          <div class="sb-lbl">mi run</div>
        </div>
        <div class="stat-bubble">
          <div class="sb-val" style="color:var(--orange)">${stats.milesAll.toFixed(1)}</div>
          <div class="sb-lbl">mi planned</div>
        </div>
        <div class="stat-bubble">
          <div class="sb-val" style="color:var(--blue)">${stats.total}</div>
          <div class="sb-lbl">total runs</div>
        </div>
        <div class="stat-bubble">
          <div class="sb-val" style="color:var(--red)">${stats.skipped}</div>
          <div class="sb-lbl">skipped</div>
        </div>
      </div>
    </div>`;

  let ctInner;
  if (ct?.length) {
    const totalSessions = ct.length;
    const totalMins = ct.reduce((s, x) => s + (x.duration || 0), 0);
    const breakdown = CT_TYPES.map(t => {
      const entries = ct.filter(x => x.type === t);
      if (!entries.length) return '';
      const mins = entries.reduce((s, x) => s + (x.duration || 0), 0);
      return `
        <div class="tb-item">
          <div class="tb-type" style="color:#38bdf8">${t}</div>
          <div class="tb-count">${entries.length}</div>
          <div class="tb-mi">${mins ? `${mins} min` : '—'}</div>
        </div>`;
    }).join('');
    ctInner = `
      <div class="stat-bubbles" style="margin-bottom:12px">
        <div class="stat-bubble" style="border-color:rgba(56,189,248,0.2)">
          <div class="sb-val" style="color:#38bdf8">${totalSessions}</div>
          <div class="sb-lbl">sessions</div>
        </div>
        <div class="stat-bubble" style="border-color:rgba(56,189,248,0.2)">
          <div class="sb-val" style="color:#38bdf8">${totalMins}</div>
          <div class="sb-lbl">total min</div>
        </div>
        ${totalMins && totalSessions ? `
        <div class="stat-bubble" style="border-color:rgba(56,189,248,0.2)">
          <div class="sb-val" style="color:#38bdf8">${Math.round(totalMins / totalSessions)}</div>
          <div class="sb-lbl">avg min</div>
        </div>` : ''}
      </div>
      <div class="type-breakdown">${breakdown}</div>`;
  } else {
    ctInner = `<div class="ct-empty">Log a cross training session on the Today page to see your totals here</div>`;
  }

  const ctCol = `
    <div class="summary-divider"></div>
    <div class="summary-col summary-ct">
      <div class="summary-section-lbl" style="color:#38bdf8">Cross Training</div>
      ${ctInner}
    </div>`;

  return `
    <div class="stats-card">
      <div class="sc-title">Totals</div>
      <div class="summary-inner">
        ${runningCol}
        ${ctCol}
      </div>
    </div>`;
}

function renderRaceForecastCard() {
  const p = state.profile;
  if (!p) return '';

  const fiveKSecs = parseTimeSecs(p.fiveKTime);
  const tenKSecs  = parseTimeSecs(p.tenKTime);
  const goalSecs  = estimateHalf(fiveKSecs, tenKSecs);
  const projSecs  = getTrainingProjection();

  if (!goalSecs && !projSecs) return '';

  let raceDateLine = '';
  if (p.raceDate) {
    const race     = parseDate(p.raceDate);
    const today    = new Date(); today.setHours(0,0,0,0);
    const diffDays = Math.round((race - today) / 86400000);
    const label    = race.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const cdStr    = diffDays < 0  ? 'Race complete'
      : diffDays === 0 ? 'Today!'
      : diffDays < 7   ? `${diffDays} day${diffDays===1?'':'s'} away`
      : `${Math.ceil(diffDays / 7)} weeks away`;
    raceDateLine = `<div class="fc-race-date">${label} &nbsp;·&nbsp; <span style="color:var(--orange)">${cdStr}</span></div>`;
  }

  const goalRow = goalSecs
    ? `<div class="fc-row"><div class="fc-label">Goal (from race times)</div><div class="fc-val">${fmtSecs(Math.round(goalSecs))}</div></div>`
    : '';

  const projRow = projSecs
    ? `<div class="fc-row"><div class="fc-label">Training projection</div><div class="fc-val fc-proj">${fmtSecs(projSecs)}</div></div>`
    : goalSecs
    ? `<div class="fc-row"><div class="fc-label">Training projection</div><div class="fc-val fc-proj-empty">Available after 5 completed runs with logged pace</div></div>`
    : '';

  let deltaHTML = '';
  if (goalSecs && projSecs) {
    const deltaSecs = Math.round(projSecs - goalSecs);
    const abs   = Math.abs(deltaSecs);
    const mins  = Math.floor(abs / 60), secs = abs % 60;
    const fmt   = `${mins}:${String(secs).padStart(2,'0')}`;
    const color = deltaSecs <= 0 ? 'var(--green)' : 'var(--red)';
    const label = deltaSecs <= 0 ? `↑ ${fmt} ahead of goal` : `↓ ${fmt} behind goal`;
    deltaHTML = `<div class="fc-delta" style="color:${color}">${label}</div>`;
  }

  return `
    <div class="stats-card forecast-card">
      <div class="sc-title">Race Forecast</div>
      ${raceDateLine}
      <div class="fc-rows">${goalRow}${projRow}${deltaHTML}</div>
    </div>`;
}

function renderPaceTrendCard() {
  const trend          = getPaceTrend();
  const completedAny   = state.plan.filter(r => r.completed);
  const withActualPace = completedAny.filter(r => r.actualPace);

  // Empty states — always render the card, show unlock hint
  if (trend.length < 3) {
    let hint, sub;
    if (!completedAny.length) {
      hint = 'Complete your first run to start tracking pace';
      sub  = 'Log actual pace when marking a run complete';
    } else if (!withActualPace.length) {
      hint = 'Log your actual pace to unlock this chart';
      sub  = 'Open any completed run and enter your actual pace';
    } else {
      const needed = 3 - trend.length;
      hint = `${needed} more week${needed > 1 ? 's' : ''} of pace data needed`;
      sub  = 'Keep logging actual paces — your trend will appear here';
    }
    return `
      <div class="stats-card pace-trend-card">
        <div class="sc-title">Pace Trend</div>
        <div class="pt-empty">
          <div class="pt-empty-icon">↗</div>
          <div class="pt-empty-hint">${hint}</div>
          <div class="pt-empty-sub">${sub}</div>
        </div>
      </div>`;
  }

  const paces = trend.map(t => t.refPace);
  const minP  = Math.min(...paces);
  const maxP  = Math.max(...paces);
  const rng   = maxP - minP || 10;

  const W = 300, H = 80, LPAD = 42, PT = 8, PB = 18;
  const plotW = W - LPAD - 8;
  const plotH = H - PT - PB;

  const xi = i => LPAD + (trend.length < 2 ? plotW / 2 : (i / (trend.length - 1)) * plotW);
  // lower refPace = faster = higher on chart (invert Y)
  const yi = p => PT + ((p - minP) / rng) * plotH;

  const pts  = trend.map((t, i) => `${xi(i).toFixed(1)},${yi(t.refPace).toFixed(1)}`).join(' ');

  const first = paces[0], last = paces[paces.length - 1];
  const diff  = Math.round(last - first);
  const absDiff = Math.abs(diff);
  const lineColor = diff < -3 ? 'var(--green)' : diff > 3 ? 'var(--red)' : 'var(--orange)';
  const trendBadge = diff < -3
    ? `<span style="color:var(--green)">↑ ${absDiff}s/mi faster</span>`
    : diff > 3
    ? `<span style="color:var(--red)">↓ ${absDiff}s/mi slower</span>`
    : `<span style="color:var(--t3)">→ Steady</span>`;

  const dots = trend.map((t, i) =>
    `<circle cx="${xi(i).toFixed(1)}" cy="${yi(t.refPace).toFixed(1)}" r="3" fill="${lineColor}"/>`
  ).join('');
  const labels = trend.map((t, i) =>
    `<text x="${xi(i).toFixed(1)}" y="${H}" text-anchor="middle" fill="#475569" font-size="7" font-family="system-ui">W${t.week}</text>`
  ).join('');

  return `
    <div class="stats-card pace-trend-card">
      <div class="sc-title">Pace Trend <span class="sc-sub-inline">${trendBadge}</span></div>
      <div class="pt-chart-fill">
        <svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="display:block;overflow:visible">
          <text x="${LPAD - 4}" y="${(PT + 5).toFixed(1)}" text-anchor="end" fill="#475569" font-size="7.5" font-family="system-ui">${fmtPace(minP)} ↑</text>
          <text x="${LPAD - 4}" y="${(PT + plotH).toFixed(1)}" text-anchor="end" fill="#475569" font-size="7.5" font-family="system-ui">${fmtPace(maxP)} ↓</text>
          <polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" opacity="0.85"/>
          ${dots}
          ${labels}
        </svg>
      </div>
    </div>`;
}

function renderAdherenceCard() {
  if (!state.plan.length) return '';
  const curWeek = getCurrentWeek();
  const stats   = getStats();

  const weekNums = [...new Set(state.plan.map(r => r.week))]
    .filter(w => w <= curWeek)
    .sort((a, b) => a - b);
  if (!weekNums.length) return '';

  const rows = weekNums.map(week => {
    const weekRuns = state.plan.filter(r => r.week === week);
    const planned  = weekRuns.reduce((s, r) => s + r.distance, 0);
    const done     = weekRuns.filter(r => r.completed).reduce((s, r) => s + (r.actualDistance ?? r.distance), 0);
    const pct      = planned ? Math.min(100, Math.round((done / planned) * 100)) : 0;
    const barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? '#f59e0b' : 'var(--red)';
    const isCur    = week === curWeek;
    return `
      <div class="adh-row${isCur ? ' adh-cur' : ''}">
        <div class="adh-week">W${week}${isCur ? '◀' : ''}</div>
        <div class="adh-bar-wrap"><div class="adh-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div class="adh-mi">${done.toFixed(1)}/${planned.toFixed(1)}</div>
        <div class="adh-pct" style="color:${barColor}">${pct}%</div>
      </div>`;
  }).join('');

  const overallPct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  return `
    <div class="stats-card">
      <div class="sc-title">Training Adherence</div>
      <div class="adh-rows">${rows}</div>
      <div class="adh-kpis">
        <div class="adh-kpi"><div class="adh-kpi-val" style="color:var(--orange)">${overallPct}%</div><div class="adh-kpi-lbl">adherence</div></div>
        <div class="adh-kpi"><div class="adh-kpi-val" style="color:var(--green)">${stats.completed}</div><div class="adh-kpi-lbl">done</div></div>
        <div class="adh-kpi"><div class="adh-kpi-val" style="color:var(--red)">${stats.skipped}</div><div class="adh-kpi-lbl">skipped</div></div>
        <div class="adh-kpi"><div class="adh-kpi-val" style="color:var(--t2)">${stats.upcoming}</div><div class="adh-kpi-lbl">remaining</div></div>
      </div>
    </div>`;
}

export function renderStatsHTML() {
  const stats = getStats();

  const hrSeries = state.plan
    .filter(r => r.stravaVerified && r.avgHR > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return `
    <div class="stats-layout fade-in">

      ${renderRaceForecastCard()}

      <div class="stats-pair">
        ${renderPaceTrendCard()}
        ${renderAdherenceCard()}
      </div>

      ${stats.stravaVerified > 0 ? `
      <div class="stats-card strava-card">
        <div class="sc-title strava-sc-title">Strava Verification</div>
        <div class="stat-bubbles" style="margin-bottom:14px">
          <div class="stat-bubble stat-bubble-s">
            <div class="sb-val" style="color:#fc4c02">${stats.stravaVerified}</div>
            <div class="sb-lbl">verified</div>
          </div>
          <div class="stat-bubble stat-bubble-s">
            <div class="sb-val" style="color:#fc4c02">${stats.completed > 0 ? Math.round(stats.stravaVerified / stats.completed * 100) : 0}%</div>
            <div class="sb-lbl">rate verified</div>
          </div>
          <div class="stat-bubble stat-bubble-s">
            <div class="sb-val" style="color:#fc4c02">${stats.stravaStreak}</div>
            <div class="sb-lbl">streak</div>
          </div>
          ${stats.avgHR ? `
          <div class="stat-bubble stat-bubble-s">
            <div class="sb-val" style="color:#fc4c02">${stats.avgHR}</div>
            <div class="sb-lbl">avg bpm</div>
          </div>
          <div class="stat-bubble stat-bubble-s">
            <div class="sb-val" style="color:#fc4c02">${stats.highHR}</div>
            <div class="sb-lbl">high hr</div>
          </div>
          <div class="stat-bubble stat-bubble-s">
            <div class="sb-val" style="color:#fc4c02">${stats.lowAvgHR}</div>
            <div class="sb-lbl">low avg</div>
          </div>
          ` : ''}
        </div>
        ${stats.avgHR ? `
        <div class="sc-title" style="margin-bottom:8px">Avg Heart Rate Over Time</div>
        ${hrTimeSeriesSVG(hrSeries)}` : ''}
      </div>` : ''}

      ${renderSummaryCard()}

      <div class="stats-card">
        <div class="run-log-header">
          <div class="sc-title" style="margin-bottom:0">Completed Runs</div>
          <div class="run-log-filters">
            <button class="rlf-btn active" data-type="all"      onclick="filterRunLog('all')">All</button>
            <button class="rlf-btn"        data-type="easy"     onclick="filterRunLog('easy')">Easy</button>
            <button class="rlf-btn"        data-type="tempo"    onclick="filterRunLog('tempo')">Tempo</button>
            <button class="rlf-btn"        data-type="long"     onclick="filterRunLog('long')">Long</button>
            <button class="rlf-btn"        data-type="recovery" onclick="filterRunLog('recovery')">Recovery</button>
            <button class="rlf-btn"        data-type="race"     onclick="filterRunLog('race')">Race</button>
          </div>
        </div>
        <div class="run-log" id="run-log">
          ${buildRunLogRows(state.plan)}
        </div>
      </div>

    </div>
  `;
}

function hrTimeSeriesSVG(series) {
  if (!series.length) return '';
  const TYPE_COLORS = { easy:'#22c55e', tempo:'#f97316', long:'#3b82f6', recovery:'#a78bfa', race:'#f59e0b' };

  // Continuous date axis spanning full plan
  const planDates = state.plan.map(r => r.date).sort();
  const startDate = parseDate(planDates[0]);
  const endDate   = parseDate(planDates[planDates.length - 1]);
  const totalDays = Math.max(Math.round((endDate - startDate) / 86400000), 1);

  // Logical viewport — width="100%" with no height lets SVG auto-size proportionally
  const LW = 600, PAD = 20;
  const H = 65, PT = 12, PB = 14;
  const plotH = H - PT - PB;

  const dateToX = dateStr => {
    const days = Math.round((parseDate(dateStr) - startDate) / 86400000);
    return PAD + (days / totalDays) * (LW - PAD * 2);
  };

  const hrVals = series.map(r => r.avgHR);
  const minHR  = Math.min(...hrVals);
  const maxHR  = Math.max(...hrVals);
  const rng    = maxHR - minHR || 10;
  const py = v => PT + plotH - ((v - minHR) / rng) * plotH;

  // Weekly tick marks + labels
  const ticks = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    const x   = dateToX(dStr(cur)).toFixed(1);
    const lbl = cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ticks.push(`
      <line x1="${x}" y1="${PT}" x2="${x}" y2="${PT + plotH}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      <text x="${x}" y="${H - 2}" text-anchor="middle" fill="#475569" font-size="6" font-family="system-ui">${lbl}</text>`);
    cur.setDate(cur.getDate() + 7);
  }

  // Line + dots for Strava-verified HR runs
  const linePts = series.map(r => `${dateToX(r.date).toFixed(1)},${py(r.avgHR).toFixed(1)}`).join(' ');
  const dots = series.map(r => {
    const cx    = dateToX(r.date).toFixed(1);
    const cy    = py(r.avgHR).toFixed(1);
    const color = TYPE_COLORS[r.type] || '#94a3b8';
    return `
      <circle cx="${cx}" cy="${cy}" r="1.5" fill="${color}" opacity="0.9"/>
      <text x="${cx}" y="${(parseFloat(cy) - 4).toFixed(1)}" text-anchor="middle" fill="${color}" font-size="5.5" font-weight="700" font-family="system-ui">${r.avgHR}</text>`;
  }).join('');

  return `<svg width="100%" viewBox="0 0 ${LW} ${H}" style="display:block;overflow:visible">
    ${ticks.join('')}
    <polyline points="${linePts}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

function hrSparklineSVG(stream, avgHR) {
  if (!stream?.length) return '';
  const H = 18, VW = 100;
  const min = Math.min(...stream);
  const max = Math.max(...stream);
  const range = max - min || 1;
  const pts = stream.map((v, i) => {
    const x = stream.length === 1 ? 50 : (i / (stream.length - 1)) * VW;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `
    <svg width="100%" height="${H}" viewBox="0 0 ${VW} ${H}" preserveAspectRatio="none" class="hr-spark">
      <polyline points="${pts}" fill="none" stroke="#fc4c02" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
    ${avgHR ? `<div class="rl-hr-val">${avgHR}</div>` : ''}`;
}

function getInjuriesOnDate(dateStr) {
  return (state.injuries || []).filter(inj => {
    if (inj.startDate > dateStr) return false;            // hadn't started yet
    if (!inj.resolved) return true;                       // still ongoing
    if (!inj.resolvedDate) return false;                  // resolved but unknown when
    return inj.resolvedDate >= dateStr;                   // resolved on or after this run
  });
}

function buildRunLogRows(plan) {
  const sorted = plan
    .filter(r => r.completed)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return '<div class="rl-empty">No completed runs yet.</div>';

  return sorted.map(r => {
    const d        = parseDate(r.date);
    const dateStr  = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const actualMi = r.actualDistance ?? r.distance;
    const paceVal  = r.actualPace ?? r.estimatedPace;
    const hrCell      = hrSparklineSVG(r.hrStream, r.avgHR);
    const stravaBadge = r.stravaVerified ? `<span class="rl-strava">S</span>` : '';

    const activeInjuries = getInjuriesOnDate(r.date);
    const SEV_ORDER = { Mild: 1, Moderate: 2, Severe: 3 };
    const SEV_COLOR = { Mild: '#f59e0b', Moderate: '#f97316', Severe: '#ef4444' };
    let injBadge = '';
    if (activeInjuries.length) {
      const worst = activeInjuries.reduce((a, b) =>
        (SEV_ORDER[b.severity] || 0) > (SEV_ORDER[a.severity] || 0) ? b : a
      );
      const injColor = SEV_COLOR[worst.severity] || '#f59e0b';
      injBadge = `<span class="rl-inj" style="color:${injColor}" title="Active injur${activeInjuries.length > 1 ? 'ies' : 'y'}: ${activeInjuries.map(i => esc(i.bodyPart)).join(', ')}">!</span>`;
    }

    return `
      <div class="rl-row" data-type="${r.type}">
        <div class="rl-date">${dateStr}</div>
        <div class="rl-type ct-${r.type}">${esc(r.label)}</div>
        <div class="rl-spacer"></div>
        <div class="rl-hr">${hrCell}</div>
        <div class="rl-actual"><span class="rl-dist-val">${actualMi} mi</span></div>
        <div class="rl-planned"><span class="rl-plan-val">${r.distance} mi</span></div>
        <div class="rl-pace"><span class="rl-pace-val">${fmtPace(paceVal)}</span></div>
        <div class="rl-badges">${injBadge}${stravaBadge}<span class="rl-status rl-st-done">✓</span></div>
      </div>`;
  }).join('');
}

export function filterRunLog(type) {
  document.querySelectorAll('#run-log .rl-row').forEach(r => {
    r.style.display = (type === 'all' || r.dataset.type === type) ? '' : 'none';
  });
  document.querySelectorAll('.rlf-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
}

