import { state } from './state.js';
import { parseTimeSecs, dStr, fmtSecs, fmtPace, parseDate } from './utils.js';
import { estimateHalf, getPlanTotalWeeks } from './plan-generator.js';

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

export function renderStatsHTML() {
  // Ensure filterRunLog is on window — belt-and-suspenders in case of module load ordering
  window.filterRunLog = filterRunLog;
  const stats = getStats();
  const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  const weeks  = Object.keys(stats.weeks).map(Number).sort((a,b)=>a-b);
  const maxMi  = Math.max(...weeks.map(w => stats.weeks[w].planned), 1);
  const BW = 26, BG = 5, CH = 32, CP = 6;
  const totalW = weeks.length * (BW + BG) - BG;
  const raceWk = getPlanTotalWeeks();

  const bars = weeks.map((w, i) => {
    const wd = stats.weeks[w];
    const x  = i * (BW + BG);
    const ph = ((wd.planned  / maxMi) * (CH - CP));
    const ch = ((wd.comp     / maxMi) * (CH - CP));
    const sh = ((wd.skip     / maxMi) * (CH - CP));
    return `
      <rect x="${x}" y="${CH-ph}" width="${BW}" height="${ph}" rx="3" fill="rgba(255,255,255,0.06)"/>
      <rect x="${x}" y="${CH-ch}" width="${BW}" height="${ch}" rx="3" fill="#22c55e" opacity="0.85"/>
      ${sh ? `<rect x="${x}" y="${CH-sh}" width="${BW}" height="${sh}" rx="3" fill="#ef4444" opacity="0.75"/>` : ''}
      <text x="${x+BW/2}" y="${CH+13}" text-anchor="middle" fill="#475569" font-size="8.5" font-family="system-ui">${w===raceWk?'R':w}</text>
    `;
  }).join('');

  const types = ['easy','tempo','long','recovery','race'];
  const typeColors = { easy:'var(--green)', tempo:'var(--orange)', long:'var(--blue)', recovery:'var(--purple)', race:'var(--gold)' };
  const typeBreakdown = types.map(t => {
    const tr = state.plan.filter(r => r.type === t);
    if (!tr.length) return '';
    const done = tr.filter(r=>r.completed).length;
    const mi   = tr.filter(r=>r.completed).reduce((s,r)=>s+r.distance,0);
    return `
      <div class="tb-item">
        <div class="tb-type" style="color:${typeColors[t]}">${t}</div>
        <div class="tb-count">${done}/${tr.length}</div>
        <div class="tb-mi">${mi.toFixed(1)} mi done</div>
      </div>`;
  }).join('');

  const hrSeries = state.plan
    .filter(r => r.stravaVerified && r.avgHR > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  return `
    <div class="stats-layout fade-in">

      <div class="stats-card combo-card">
        <div class="combo-inner">
          <div class="combo-left">
            ${stats.halfSecs ? `
            <div class="est-card">
              <div class="sc-title" style="margin-bottom:6px">Estimated Finish</div>
              <div class="est-val">${fmtSecs(Math.round(stats.halfSecs))}</div>
              <div class="est-lbl">Half Marathon · 13.1 miles</div>
            </div>` : ''}
          </div>
          <div style="min-width:0;display:flex;flex-direction:column">
            <div class="sc-title">Weekly Mileage</div>
            <div style="flex:1;min-height:${CH+22}px">
              <svg width="100%" height="100%"
                   viewBox="0 0 ${Math.max(totalW, 280)} ${CH+22}"
                   preserveAspectRatio="none"
                   style="display:block;min-height:${CH+22}px">
                ${bars}
              </svg>
            </div>
          </div>
          <div style="display:flex;flex-direction:column">
            <div class="sc-title">Completion</div>
            <div class="stat-bubbles-2" style="flex:1;align-content:stretch;grid-auto-rows:1fr">
              <div class="stat-bubble">
                <div class="sb-val" style="color:var(--orange)">${pct}%</div>
                <div class="sb-lbl">complete</div>
              </div>
              <div class="stat-bubble">
                <div class="sb-val" style="color:var(--green)">${stats.completed}</div>
                <div class="sb-lbl">done</div>
              </div>
              <div class="stat-bubble">
                <div class="sb-val" style="color:var(--red)">${stats.skipped}</div>
                <div class="sb-lbl">skipped</div>
              </div>
              <div class="stat-bubble">
                <div class="sb-val" style="color:var(--t2)">${stats.upcoming}</div>
                <div class="sb-lbl">remaining</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="stats-pair-13">
        <div class="stats-card" style="display:flex;flex-direction:column">
          <div class="sc-title">Total Mileage</div>
          <div class="stat-bubbles" style="flex:1;align-content:stretch;flex-wrap:wrap;align-items:stretch">
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
              <div class="sb-val" style="color:var(--t2)">${stats.upcoming}</div>
              <div class="sb-lbl">remaining</div>
            </div>
          </div>
        </div>
        <div class="stats-card">
          <div class="sc-title">Run Type Breakdown</div>
          <div class="type-breakdown">${typeBreakdown}</div>
        </div>
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
    const hrCell   = hrSparklineSVG(r.hrStream, r.avgHR);
    const stravaBadge = r.stravaVerified ? `<span class="rl-strava">S</span>` : '';

    return `
      <div class="rl-row" data-type="${r.type}">
        <div class="rl-date">${dateStr}</div>
        <div class="rl-type ct-${r.type}">${r.label}</div>
        <div></div>
        <div class="rl-hr">${hrCell}</div>
        <div class="rl-actual"><span class="rl-dist-val">${actualMi} mi</span></div>
        <div class="rl-planned"><span class="rl-plan-val">${r.distance} mi</span></div>
        <div class="rl-pace"><span class="rl-pace-val">${fmtPace(paceVal)}</span></div>
        <div class="rl-badges">${stravaBadge}<span class="rl-status rl-st-done">✓</span></div>
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

export function animateRing() {
  requestAnimationFrame(() => setTimeout(() => {
    const ring = document.getElementById('ring-circle');
    if (!ring) return;
    const stats = getStats();
    const pct   = stats.total ? stats.completed / stats.total : 0;
    const R     = 54;
    const circ  = 2 * Math.PI * R;
    ring.style.strokeDashoffset = (circ * (1 - pct)).toFixed(2);
  }, 80));
}
