import { state, saveState } from './state.js';
import { parseDate, fmtPace, friendlyDate, esc, dStr } from './utils.js';
import { showToast } from './feedback.js';

export function stravaIsConnected() { return !!(state.strava?.accessToken); }
export function stravaRedirectUri()  { return window.location.origin + window.location.pathname; }

export function stravaConnect() {
  if (!state.strava?.clientId) return;
  const q = new URLSearchParams({
    client_id:        state.strava.clientId,
    redirect_uri:     stravaRedirectUri(),
    response_type:    'code',
    scope:            'activity:read_all',
    approval_prompt:  'auto',
  });
  window.location.href = 'https://www.strava.com/oauth/authorize?' + q;
}

export async function stravaExchangeCode(code) {
  try {
    const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     state.strava.clientId,
        client_secret: state.strava.clientSecret,
        code,          grant_type: 'authorization_code'
      }),
    });
    const d = await res.json();
    if (d.access_token) {
      if (!state.strava) state.strava = {};
      state.strava.accessToken  = d.access_token;
      state.strava.refreshToken = d.refresh_token;
      state.strava.expiresAt    = d.expires_at;
      state.strava.athleteName  = d.athlete?.firstname || '';
      saveState();
    }
  } catch(e) {}
}

export async function stravaRefreshIfNeeded() {
  if (!state.strava?.refreshToken) return false;
  if (Date.now() / 1000 < (state.strava.expiresAt || 0) - 300) return true;
  try {
    const res = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     state.strava.clientId,
        client_secret: state.strava.clientSecret,
        refresh_token: state.strava.refreshToken,
        grant_type:    'refresh_token',
      }),
    });
    const d = await res.json();
    if (d.access_token) {
      state.strava.accessToken  = d.access_token;
      state.strava.refreshToken = d.refresh_token;
      state.strava.expiresAt    = d.expires_at;
      saveState(); return true;
    }
    // Refresh token revoked or invalid — clear tokens and prompt reconnect
    showToast('Strava session expired — reconnect in Settings', 'warn');
    state.strava = { clientId: state.strava.clientId, clientSecret: state.strava.clientSecret };
    saveState();
    return false;
  } catch(e) {
    showToast('Strava connection error — check your network', 'warn');
    return false;
  }
}

export function saveStravaSettings() {
  const cid = document.getElementById('s-strava-cid')?.value.trim();
  const cs  = document.getElementById('s-strava-cs')?.value.trim();
  if (!cid || !cs) { showToast('Enter both Client ID and Client Secret', 'warn'); return; }
  if (!state.strava) state.strava = {};
  state.strava.clientId     = cid;
  state.strava.clientSecret = cs;
  saveState();
  stravaConnect();
}

export function stravaDisconnect() {
  if (!state.strava) return;
  state.strava = { clientId: state.strava.clientId, clientSecret: state.strava.clientSecret };
  saveState();
  import('./render-setup.js').then(m => m.openEditProfile());
  showToast('Strava disconnected', 'warn');
}

export async function fetchStravaActivities(dateStr) {
  const ok = await stravaRefreshIfNeeded();
  if (!ok || !state.strava?.accessToken) return null; // null = auth failure, [] = no results
  try {
    const d  = parseDate(dateStr);
    // Match exact calendar day (midnight to midnight local time)
    const af = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime() / 1000);
    const bf = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime() / 1000);
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?before=${bf}&after=${af}&per_page=30`,
      { headers: { Authorization: `Bearer ${state.strava.accessToken}` } }
    );
    const data = await res.json();
    if (res.status === 401 || res.status === 403) {
      // Token invalid/revoked — clear it and prompt reconnect
      showToast('Strava session expired — reconnect in Settings', 'warn');
      state.strava = { clientId: state.strava.clientId, clientSecret: state.strava.clientSecret };
      saveState();
      return null;
    }
    if (!Array.isArray(data)) {
      const msg = data?.message || 'Strava API error';
      showToast(`Strava: ${msg}`, 'warn');
      return null;
    }
    return data.filter(a => a.type === 'Run' || a.sport_type === 'Run');
  } catch(e) {
    showToast('Could not reach Strava — check your network', 'warn');
    return null;
  }
}

export async function linkStravaActivity(runId) {
  const run = state.plan.find(r => r.id === runId);
  if (!run) return;
  const btn = document.querySelector('.strava-link-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
  const activities = await fetchStravaActivities(run.date);
  if (activities === null) {
    // Auth failure — toast already shown by fetchStravaActivities; just reopen modal
    import('./render-modal.js').then(m => m.openModal(runId));
    return;
  }
  if (!activities.length) {
    showToast('No Strava runs found near this date', 'warn');
    import('./render-modal.js').then(m => m.openModal(runId));
    return;
  }
  showStravaPickerModal(run, activities);
}

export function showStravaPickerModal(run, activities) {
  import('./render-modal.js').then(m => {
    m.closeModal(true); // replacing modal — don't consume pending flash
    // Filter out activities already linked to any run
    const alreadyLinked = new Set(state.plan.map(r => r.stravaActivityId).filter(Boolean));
    const available = activities.filter(a => !alreadyLinked.has(String(a.id)));
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay'; overlay.id = 'run-modal';
    overlay.addEventListener('click', e => { if (e.target === overlay) m.openModal(run.id); });
    if (!available.length) {
      m.openModal(run.id);
      showToast('No unlinked Strava activities found for this date', 'warn');
      return;
    }
    const items = available.map(a => {
      const mi   = (a.distance / 1609.34).toFixed(2);
      const pace = Math.round(a.moving_time / (a.distance / 1609.34));
      const t    = new Date(a.start_date_local);
      const dt   = t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const tm   = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const hrTag = a.average_heartrate ? ` &nbsp;·&nbsp; ${Math.round(a.average_heartrate)} bpm` : '';
      return `<div class="strava-pick-item" onclick="confirmStravaLink('${run.id}','${a.id}',${a.distance},${a.moving_time},${a.average_heartrate||0},${a.max_heartrate||0})">
        <div class="spi-name">${esc(a.name)}</div>
        <div class="spi-meta">${dt} &nbsp;·&nbsp; ${tm} &nbsp;·&nbsp; ${mi} mi &nbsp;·&nbsp; ${fmtPace(pace)}${hrTag}</div>
      </div>`;
    }).join('');
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <div class="modal-badge" style="background:rgba(252,76,2,0.15);color:#fc4c02">STRAVA</div>
            <div class="modal-title">Select Activity</div>
            <div class="modal-meta">Activities on ${friendlyDate(run.date)}</div>
          </div>
          <button class="modal-close" onclick="openModal('${run.id}')">✕</button>
        </div>
        <div class="strava-pick-list">${items}</div>
        <div style="margin-top:14px;display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="openModal('${run.id}')">Cancel</button>
          <button class="btn btn-danger" onclick="declineStravaLink('${run.id}')">None of these</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  });
}

export function declineStravaLink(runId) {
  const run = state.plan.find(r => r.id === runId);
  if (!run) return;
  run.stravaDeclined       = true;
  saveState();
  import('./render-modal.js').then(m => m.closeModal());
  import('./render-app.js').then(m => m.renderMainContent());
  showToast('No Strava activity linked for this run', 'skip');
}

export function confirmStravaLink(runId, activityId, distanceM, movingTimeSecs, avgHR, maxHR) {
  const run = state.plan.find(r => r.id === runId);
  if (!run) return;
  const distMi = Math.round(distanceM / 1609.34 * 100) / 100;
  const pace   = distanceM > 0 ? Math.round(movingTimeSecs / (distanceM / 1609.34)) : run.estimatedPace;
  run.stravaActivityId = String(activityId);
  run.stravaVerified   = true;
  run.completed        = true;
  run.skipped              = false;
  run.actualDistance   = (distMi !== run.distance) ? distMi : null;
  run.actualPace       = (pace   !== run.estimatedPace) ? pace : null;
  run.avgHR            = avgHR > 0 ? Math.round(avgHR) : null;
  run.maxHR            = maxHR > 0 ? Math.round(maxHR) : null;
  saveState();
  import('./render-modal.js').then(m => m.closeModal());
  import('./render-app.js').then(m => m.renderMainContent());
  showToast('✓ Strava activity linked!', 'ok');
  // Fetch HR time-series stream in background
  if (run.avgHR) fetchAndStoreHRStream(run, activityId);
}

// ─── Bulk Sync ────────────────────────────────────────────────────────────────

let _bulkActivities = []; // activities loaded for the current bulk sync session

async function fetchStravaActivitiesRange(startDateStr, endDateStr) {
  const ok = await stravaRefreshIfNeeded();
  if (!ok || !state.strava?.accessToken) return null;
  try {
    const s = parseDate(startDateStr);
    const e = parseDate(endDateStr);
    const after  = Math.floor(new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0).getTime() / 1000);
    const before = Math.floor(new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59).getTime() / 1000);
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=200`,
      { headers: { Authorization: `Bearer ${state.strava.accessToken}` } }
    );
    const data = await res.json();
    if (res.status === 401 || res.status === 403) {
      showToast('Strava session expired — reconnect in Settings', 'warn');
      state.strava = { clientId: state.strava.clientId, clientSecret: state.strava.clientSecret };
      saveState();
      return null;
    }
    if (!Array.isArray(data)) {
      showToast(`Strava: ${data?.message || 'API error'}`, 'warn');
      return null;
    }
    return data.filter(a => a.type === 'Run' || a.sport_type === 'Run');
  } catch(e) {
    showToast('Could not reach Strava — check your network', 'warn');
    return null;
  }
}

export async function stravaBulkSync() {
  if (!state.plan?.length || !state.profile) return;
  if (!state.strava?.accessToken) { showToast('Connect Strava in Settings first', 'warn'); return; }

  const today     = dStr(new Date());
  const planDates = state.plan.map(r => r.date).sort();
  const startDate = planDates[0];
  const endDate   = planDates[planDates.length - 1] < today ? planDates[planDates.length - 1] : today;

  const btn = document.getElementById('strava-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

  const activities = await fetchStravaActivitiesRange(startDate, endDate);
  if (btn) { btn.disabled = false; btn.textContent = 'Sync Strava'; }
  if (activities === null) return;

  const alreadyLinked = new Set(state.plan.map(r => r.stravaActivityId).filter(Boolean));
  _bulkActivities = activities.filter(a => !alreadyLinked.has(String(a.id)));

  const rejectedIds = new Set((state.strava?.rejectedActivities || []).map(r => String(r.id)));
  const hasActive   = _bulkActivities.some(a => !rejectedIds.has(String(a.id)));
  const hasRejected = (state.strava?.rejectedActivities || []).length > 0;

  if (!hasActive && !hasRejected) { showToast('All Strava runs already linked!', 'ok'); return; }
  showStravaBulkModal(startDate, endDate);
}

function buildBulkModalBody() {
  const rejectedIds = new Set((state.strava?.rejectedActivities || []).map(r => String(r.id)));
  const activeActs  = _bulkActivities.filter(a => !rejectedIds.has(String(a.id)));

  // Group by date
  const dateMap = new Map();
  for (const a of activeActs) {
    const date = a.start_date_local.substring(0, 10);
    if (!dateMap.has(date)) dateMap.set(date, []);
    dateMap.get(date).push(a);
  }
  const sortedDates = [...dateMap.keys()].sort();

  const dateCards = sortedDates.map(date => {
    const acts     = dateMap.get(date);
    const planRuns = state.plan.filter(r => r.date === date && !r.stravaVerified);
    const d        = parseDate(date);
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const planRunsHTML = planRuns.length
      ? planRuns.map(r =>
          `<div class="bulk-plan-run"><span class="ct-${r.type}" style="font-weight:700">${r.label}</span> &nbsp;·&nbsp; ${r.distance} mi planned</div>`
        ).join('')
      : `<div class="bulk-plan-run bulk-no-plan">No plan run on this date</div>`;

    const actsHTML = acts.map(a => {
      const mi    = (a.distance / 1609.34).toFixed(2);
      const pace  = a.distance > 0 ? Math.round(a.moving_time / (a.distance / 1609.34)) : 0;
      const hrStr = a.average_heartrate ? ` &nbsp;·&nbsp; ${Math.round(a.average_heartrate)} bpm` : '';

      let linkBtns = '';
      if (planRuns.length === 1) {
        const r = planRuns[0];
        linkBtns = `<button class="btn btn-success btn-sm" onclick="linkFromBulk('${r.id}','${a.id}',${a.distance},${a.moving_time},${a.average_heartrate||0},${a.max_heartrate||0})">Link</button>`;
      } else if (planRuns.length > 1) {
        const opts = planRuns.map(r => `<option value="${r.id}">${r.label} (${r.distance} mi)</option>`).join('');
        linkBtns = `<select id="bulk-sel-${a.id}" class="bulk-run-select">${opts}</select>
          <button class="btn btn-success btn-sm" onclick="linkFromBulkSelect('${a.id}',${a.distance},${a.moving_time},${a.average_heartrate||0},${a.max_heartrate||0})">Link</button>`;
      }

      return `
        <div class="bulk-strava-act">
          <div class="bulk-act-name">${esc(a.name)}</div>
          <div class="bulk-act-meta">${mi} mi &nbsp;·&nbsp; ${fmtPace(pace)}${hrStr}</div>
          <div class="bulk-act-btns">
            ${linkBtns}
            <button class="btn btn-ghost btn-sm" onclick="rejectBulkActivity('${a.id}')">Reject</button>
            <button class="btn btn-ghost btn-sm" onclick="addNewFromBulk('${date}','${a.id}',${a.distance},${a.moving_time},${a.average_heartrate||0},${a.max_heartrate||0})">Add New</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="bulk-date-card">
        <div class="bulk-date-hdr">${dateLabel}</div>
        ${planRunsHTML}
        ${actsHTML}
      </div>`;
  }).join('');

  // Rejected section
  const rejected    = state.strava?.rejectedActivities || [];
  const rejectedHTML = rejected.length ? `
    <div class="bulk-rejected-section">
      <div class="bulk-section-hdr">Rejected (${rejected.length})</div>
      ${rejected.map(a => {
        const d  = parseDate(a.date);
        const dt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const mi = (a.distanceM / 1609.34).toFixed(2);
        return `
          <div class="bulk-rejected-item">
            <div>
              <div class="bulk-rej-name">${esc(a.name)}</div>
              <div class="bulk-act-meta">${dt} &nbsp;·&nbsp; ${mi} mi</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="restoreBulkActivity('${a.id}')">Restore</button>
          </div>`;
      }).join('')}
    </div>` : '';

  if (!dateCards && !rejectedHTML) {
    return '<div class="rl-empty">All Strava runs already linked — nothing to sync.</div>';
  }
  return dateCards + rejectedHTML;
}

function showStravaBulkModal(startDate, endDate) {
  const existing = document.getElementById('bulk-sync-modal');
  if (existing) existing.remove();

  const fmt     = d => parseDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'bulk-sync-modal';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeBulkSyncModal(); });
  overlay.innerHTML = `
    <div class="modal-card bulk-modal">
      <div class="modal-header">
        <div>
          <div class="modal-badge" style="background:rgba(252,76,2,0.15);color:#fc4c02">STRAVA SYNC</div>
          <div class="modal-title">Sync Activities</div>
          <div class="modal-meta">${fmt(startDate)} – ${fmt(endDate)} &nbsp;·&nbsp; ${_bulkActivities.length} run${_bulkActivities.length !== 1 ? 's' : ''} found</div>
        </div>
        <button class="modal-close" onclick="closeBulkSyncModal()">✕</button>
      </div>
      <div class="bulk-body" id="bulk-sync-body">
        ${buildBulkModalBody()}
      </div>
      <div style="margin-top:14px">
        <button class="btn btn-ghost" onclick="closeBulkSyncModal()">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

export function closeBulkSyncModal() {
  const modal = document.getElementById('bulk-sync-modal');
  if (modal) modal.remove();
  _bulkActivities = [];
  import('./render-app.js').then(m => m.renderMainContent());
}

export function rejectBulkActivity(activityId) {
  const act = _bulkActivities.find(a => String(a.id) === String(activityId));
  if (!act) return;
  if (!state.strava) state.strava = {};
  if (!state.strava.rejectedActivities) state.strava.rejectedActivities = [];
  if (!state.strava.rejectedActivities.find(r => String(r.id) === String(activityId))) {
    state.strava.rejectedActivities.push({
      id:             String(activityId),
      name:           act.name,
      date:           act.start_date_local.substring(0, 10),
      distanceM:      act.distance,
      movingTimeSecs: act.moving_time,
      avgHR:          act.average_heartrate || 0,
      maxHR:          act.max_heartrate || 0,
    });
    saveState();
  }
  const body = document.getElementById('bulk-sync-body');
  if (body) body.innerHTML = buildBulkModalBody();
}

export function restoreBulkActivity(activityId) {
  if (!state.strava?.rejectedActivities) return;
  state.strava.rejectedActivities = state.strava.rejectedActivities.filter(a => String(a.id) !== String(activityId));
  saveState();
  const body = document.getElementById('bulk-sync-body');
  if (body) body.innerHTML = buildBulkModalBody();
}

export function linkFromBulk(planRunId, activityId, distanceM, movingTimeSecs, avgHR, maxHR) {
  const run = state.plan.find(r => r.id === planRunId);
  if (!run) return;
  const distMi = Math.round(distanceM / 1609.34 * 100) / 100;
  const pace   = distanceM > 0 ? Math.round(movingTimeSecs / (distanceM / 1609.34)) : run.estimatedPace;
  run.stravaActivityId = String(activityId);
  run.stravaVerified   = true;
  run.actualDistance   = (distMi !== run.distance) ? distMi : null;
  run.actualPace           = (pace !== run.estimatedPace) ? pace : null;
  run.avgHR                = avgHR > 0 ? Math.round(avgHR) : null;
  run.maxHR                = maxHR > 0 ? Math.round(maxHR) : null;
  run.completed            = true;
  run.skipped              = false;
  saveState();
  // Close bulk modal and open the run's completion modal for review
  const modal = document.getElementById('bulk-sync-modal');
  if (modal) modal.remove();
  _bulkActivities = [];
  state._pendingFlashDate = run.date; // closeModal() will flash this cell when modal closes
  import('./render-app.js').then(m => m.renderMainContent());
  import('./render-modal.js').then(m => m.openModal(planRunId));
  if (run.avgHR) fetchAndStoreHRStream(run, activityId);
}

export function linkFromBulkSelect(activityId, distanceM, movingTimeSecs, avgHR, maxHR) {
  const sel = document.getElementById(`bulk-sel-${activityId}`);
  if (!sel?.value) return;
  linkFromBulk(sel.value, activityId, distanceM, movingTimeSecs, avgHR, maxHR);
}

export function addNewFromBulk(dateStr, activityId, distanceM, movingTimeSecs, avgHR, maxHR) {
  // Store pending link + flash date in state so handlers.js can pick them up
  if (!state.strava) state.strava = {};
  state.strava.pendingLink = {
    id: String(activityId), distanceM, movingTimeSecs,
    avgHR: avgHR || 0, maxHR: maxHR || 0,
  };
  state._pendingFlashDate = dateStr;
  const modal = document.getElementById('bulk-sync-modal');
  if (modal) modal.remove();
  _bulkActivities = [];
  import('./render-modal.js').then(m => m.openNewRunModal(dateStr));
}

async function fetchAndStoreHRStream(run, activityId) {
  try {
    const ok = await stravaRefreshIfNeeded();
    if (!ok || !state.strava?.accessToken) return;
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=heartrate&key_by_type=true`,
      { headers: { Authorization: `Bearer ${state.strava.accessToken}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    const stream = data?.heartrate?.data;
    if (!Array.isArray(stream) || !stream.length) return;
    // Downsample to ~40 points for storage
    const step = Math.max(1, Math.floor(stream.length / 40));
    run.hrStream = stream.filter((_, i) => i % step === 0).slice(0, 40);
    saveState();
  } catch(e) {}
}
