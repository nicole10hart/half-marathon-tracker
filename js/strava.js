import { state, saveState } from './state.js';
import { parseDate, fmtPace, friendlyDate, esc, dStr, uid } from './utils.js';
import { showToast } from './feedback.js';

// Strava sport_type → CT_TYPES mapping
const STRAVA_TO_CT = {
  Ride: 'biking',           VirtualRide: 'biking',        EBikeRide: 'biking',
  Swim: 'swimming',
  Yoga: 'yoga',
  WeightTraining: 'weightlifting',
  Workout: 'hiit',          CrossFit: 'crossfit',
  Hike: 'hiking',           Walk: 'hiking',
  Elliptical: 'elliptical',
  RockClimbing: 'climbing',
  Rowing: 'rowing',         VirtualRow: 'rowing',
  Kayaking: 'kayaking',     StandUpPaddling: 'kayaking',
  Surfing: 'surfing',
  Skateboard: 'skateboarding',
  Soccer: 'soccer',         Football: 'soccer',
  Tennis: 'tennis',         Pickleball: 'tennis',          Badminton: 'tennis',
  Basketball: 'basketball',
  AlpineSki: 'skiing',      BackcountrySki: 'skiing',       NordicSki: 'skiing',
  Golf: 'golf',
  Dance: 'dance',
  MartialArts: 'martial arts',
  Pilates: 'pilates',
  Volleyball: 'volleyball',
  Spinning: 'spinning',
};

function stravaActivityCTType(a) {
  return STRAVA_TO_CT[a.sport_type] || STRAVA_TO_CT[a.type] || null;
}

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

let _bulkActivities   = []; // run activities for current bulk sync session
let _bulkCTActivities = []; // CT activities for current bulk sync session

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
    return data; // all activity types — callers filter as needed
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

  const allActivities = await fetchStravaActivitiesRange(startDate, endDate);
  if (btn) { btn.disabled = false; btn.textContent = 'Sync Strava'; }
  if (allActivities === null) return;

  const alreadyLinkedRuns = new Set(state.plan.map(r => r.stravaActivityId).filter(Boolean));
  const alreadyLinkedCT   = new Set((state.crossTraining || []).map(c => c.stravaActivityId).filter(Boolean));

  _bulkActivities = allActivities
    .filter(a => a.type === 'Run' || a.sport_type === 'Run')
    .filter(a => !alreadyLinkedRuns.has(String(a.id)));

  _bulkCTActivities = allActivities
    .filter(a => stravaActivityCTType(a) !== null && a.type !== 'Run' && a.sport_type !== 'Run')
    .filter(a => !alreadyLinkedCT.has(String(a.id)));

  const rejectedIds = new Set((state.strava?.rejectedActivities || []).map(r => String(r.id)));
  const hasActive   = _bulkActivities.some(a => !rejectedIds.has(String(a.id))) || _bulkCTActivities.length > 0;
  const hasRejected = (state.strava?.rejectedActivities || []).length > 0;

  if (!hasActive && !hasRejected) { showToast('All Strava activities already linked!', 'ok'); return; }
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

  // CT section
  const alreadyLinkedCT = new Set((state.crossTraining || []).map(c => c.stravaActivityId).filter(Boolean));
  const availableCT = _bulkCTActivities.filter(a => !alreadyLinkedCT.has(String(a.id)));
  let ctHTML = '';
  if (availableCT.length) {
    const ctDateMap = new Map();
    for (const a of availableCT) {
      const date = a.start_date_local.substring(0, 10);
      if (!ctDateMap.has(date)) ctDateMap.set(date, []);
      ctDateMap.get(date).push(a);
    }
    const ctCards = [...ctDateMap.keys()].sort().map(date => {
      const acts      = ctDateMap.get(date);
      const d         = parseDate(date);
      const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const actsHTML  = acts.map(a => {
        const ctType = stravaActivityCTType(a);
        const dur    = Math.round(a.moving_time / 60);
        return `
          <div class="bulk-strava-act" style="border-color:rgba(56,189,248,0.25)">
            <div class="bulk-act-name">${esc(a.name)}</div>
            <div class="bulk-act-meta" style="color:#38bdf8">${ctType} &nbsp;·&nbsp; ${dur} min</div>
            <div class="bulk-act-btns">
              <button class="btn btn-sm" style="border-color:rgba(56,189,248,0.4);color:#38bdf8" onclick="linkCTFromBulk('${a.id}')">Log CT</button>
              <button class="btn btn-ghost btn-sm" onclick="rejectBulkCT('${a.id}')">Reject</button>
            </div>
          </div>`;
      }).join('');
      return `
        <div class="bulk-date-card">
          <div class="bulk-date-hdr">${dateLabel}</div>
          ${actsHTML}
        </div>`;
    }).join('');
    ctHTML = `
      <div class="bulk-section-hdr" style="color:#38bdf8;border-top:1px solid var(--border);padding-top:14px;margin-top:4px">
        Cross Training (${availableCT.length})
      </div>
      ${ctCards}`;
  }

  if (!dateCards && !rejectedHTML && !ctHTML) {
    return '<div class="rl-empty">All Strava activities already linked — nothing to sync.</div>';
  }
  return (dateCards || '') + rejectedHTML + ctHTML;
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
          <div class="modal-meta">${fmt(startDate)} – ${fmt(endDate)} &nbsp;·&nbsp; ${_bulkActivities.length} run${_bulkActivities.length !== 1 ? 's' : ''}, ${_bulkCTActivities.length} cross-training found</div>
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
  _bulkActivities   = [];
  _bulkCTActivities = [];
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

export function linkCTFromBulk(activityId) {
  const act = _bulkCTActivities.find(a => String(a.id) === String(activityId));
  if (!act) return;
  const ctType = stravaActivityCTType(act);
  const dateStr = act.start_date_local.substring(0, 10);
  if (!state.crossTraining) state.crossTraining = [];
  state.crossTraining.push({
    id: uid(), date: dateStr, type: ctType,
    duration: Math.round(act.moving_time / 60),
    notes: act.name, stravaActivityId: String(act.id),
  });
  _bulkCTActivities = _bulkCTActivities.filter(a => String(a.id) !== String(activityId));
  saveState();
  const body = document.getElementById('bulk-sync-body');
  if (body) body.innerHTML = buildBulkModalBody();
  showToast(`${ctType} logged from Strava`, 'ok');
}

export function rejectBulkCT(activityId) {
  _bulkCTActivities = _bulkCTActivities.filter(a => String(a.id) !== String(activityId));
  const body = document.getElementById('bulk-sync-body');
  if (body) body.innerHTML = buildBulkModalBody();
}

export async function openStravaCTPicker(dateStr) {
  const ok = await stravaRefreshIfNeeded();
  if (!ok || !state.strava?.accessToken) {
    showToast('Strava not connected', 'warn');
    return;
  }
  try {
    const d  = parseDate(dateStr);
    const af = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(),  0,  0,  0).getTime() / 1000);
    const bf = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime() / 1000);
    const res  = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?before=${bf}&after=${af}&per_page=30`,
      { headers: { Authorization: `Bearer ${state.strava.accessToken}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) {
      showToast('Strava: could not fetch activities', 'warn');
      return;
    }
    const alreadyLinked = new Set((state.crossTraining || []).map(c => c.stravaActivityId).filter(Boolean));
    const ctActs = data.filter(a =>
      stravaActivityCTType(a) !== null &&
      a.type !== 'Run' && a.sport_type !== 'Run' &&
      !alreadyLinked.has(String(a.id))
    );
    if (!ctActs.length) {
      showToast('No cross-training activities on Strava for this date', 'warn');
      return;
    }
    showStravaCTPickerModal(dateStr, ctActs);
  } catch(e) {
    showToast('Could not reach Strava — check your network', 'warn');
  }
}

function showStravaCTPickerModal(dateStr, acts) {
  import('./render-modal.js').then(m => {
    m.closeModal(true);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'run-modal';
    overlay.addEventListener('click', e => { if (e.target === overlay) m.closeModal(); });

    const items = acts.map(a => {
      const ctType = stravaActivityCTType(a);
      const dur    = Math.round(a.moving_time / 60);
      const t      = new Date(a.start_date_local);
      const tm     = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const st     = a.sport_type || a.type;
      return `
        <div class="strava-pick-item" onclick="confirmStravaCTLink('${dateStr}','${a.id}',${a.moving_time},'${st}')">
          <div class="spi-name">${esc(a.name)}</div>
          <div class="spi-meta">${ctType} &nbsp;·&nbsp; ${tm} &nbsp;·&nbsp; ${dur} min</div>
        </div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <div class="modal-badge" style="background:rgba(252,76,2,0.15);color:#fc4c02">STRAVA</div>
            <div class="modal-title">Import Cross Training</div>
            <div class="modal-meta">Activities on ${friendlyDate(dateStr)}</div>
          </div>
          <button class="modal-close" onclick="openCTModal('${dateStr}')">✕</button>
        </div>
        <div class="strava-pick-list">${items}</div>
        <div style="margin-top:14px">
          <button class="btn btn-ghost" onclick="openCTModal('${dateStr}')">Back</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  });
}

export function confirmStravaCTLink(dateStr, activityId, movingTime, sportType) {
  const ctType = STRAVA_TO_CT[sportType] || sportType;
  if (!state.crossTraining) state.crossTraining = [];
  if (state.crossTraining.some(c => c.stravaActivityId === String(activityId))) {
    showToast('Already linked', 'warn');
    return;
  }
  state.crossTraining.push({
    id: uid(), date: dateStr, type: ctType,
    duration: Math.round(movingTime / 60),
    notes: '', stravaActivityId: String(activityId),
  });
  saveState();
  import('./render-modal.js').then(m => m.closeModal());
  import('./render-app.js').then(m => m.renderMainContent());
  showToast(`${ctType} logged from Strava`, 'ok');
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
