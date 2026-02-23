import { state } from './state.js';
import { fmtPace, fmtSecs, parseTimeSecs, friendlyDate, esc } from './utils.js';
import { calcPaces } from './plan-generator.js';
import { isFuture } from './feedback.js';
import { CT_TYPES } from './constants.js';

function tempoWorkoutHTML(run) {
  const paces = calcPaces(
    parseTimeSecs(state.profile.fiveKTime),
    parseTimeSecs(state.profile.tenKTime)
  );
  const total = run.distance;
  const wu  = Math.max(1,   Math.round(total * 0.20 * 2) / 2);
  const cd  = Math.max(0.5, Math.round(total * 0.15 * 2) / 2);
  const tm  = Math.round((total - wu - cd) * 10) / 10;
  return `
    <div class="modal-section">
      <span class="modal-section-label">Workout Structure</span>
      <div class="tempo-guide">
        <div class="tg-row">
          <span class="tg-phase wu">Warm-Up</span>
          <span class="tg-dist">${wu} mi &nbsp;·&nbsp; ${fmtPace(paces.easy)}</span>
        </div>
        <div class="tg-row">
          <span class="tg-phase tm">Tempo</span>
          <span class="tg-dist">${tm} mi &nbsp;·&nbsp; ${fmtPace(paces.tempo)}</span>
        </div>
        <div class="tg-row">
          <span class="tg-phase cd">Cool-Down</span>
          <span class="tg-dist">${cd} mi &nbsp;·&nbsp; ${fmtPace(paces.easy)}</span>
        </div>
      </div>
      <div class="tempo-tip">🎯 Tempo = comfortably hard. Short phrases OK; full conversation = too easy. Target ~80–90% max HR (zone 4).</div>
    </div>`;
}

export function openModal(runId) {
  const run = state.plan.find(r => r.id === runId);
  if (!run) return;
  closeModal(true); // replacing modal — don't consume pending flash

  const future = isFuture(run.date);

  const statusHTML = run.completed
    ? `<div class="modal-status ms-completed">✓ Completed</div>`
    : run.skipped
    ? `<div class="modal-status ms-skipped">— Marked as skipped</div>`
    : future
    ? `<div class="modal-status" style="background:rgba(245,158,11,0.1);color:#f59e0b;border-color:rgba(245,158,11,0.25)">🔒 This run is in the future</div>`
    : '';

  const estTime = Math.round(run.distance * run.estimatedPace);

  // Actual results display (shown when completed with recorded actuals)
  const hasTempoSegs = run.type === 'tempo' && run.actualWarmup != null && run.actualTempo != null && run.actualCooldown != null;
  const actualResultsHTML = (run.completed && (run.actualDistance != null || run.actualPace != null || hasTempoSegs)) ? `
    <div class="actual-results">
      ${run.actualDistance != null ? `<div class="ar-item"><div class="ar-lbl">Actual Miles</div><div>${run.actualDistance}</div></div>` : ''}
      ${run.actualPace     != null ? `<div class="ar-item"><div class="ar-lbl">Actual Pace</div><div>${fmtPace(run.actualPace)}</div></div>` : ''}
      ${hasTempoSegs ? `
      <div class="ar-item"><div class="ar-lbl">Warm-Up</div><div>${run.actualWarmup} mi</div></div>
      <div class="ar-item"><div class="ar-lbl">Tempo</div><div>${run.actualTempo} mi</div></div>
      <div class="ar-item"><div class="ar-lbl">Cool-Down</div><div>${run.actualCooldown} mi</div></div>` : ''}
    </div>` : '';

  // Tempo workout structure
  const tempoSection = (run.type === 'tempo') ? tempoWorkoutHTML(run) : '';

  // Tempo segment fields (for tempo runs: warm-up / tempo / cool-down)
  const expectedWu = Math.max(0.5, Math.round(run.distance * 0.20 * 2) / 2);
  const expectedCd = Math.max(0.5, Math.round(run.distance * 0.15 * 2) / 2);
  const expectedTm = Math.round((run.distance - expectedWu - expectedCd) * 10) / 10;
  const tempoSegmentFields = (run.type === 'tempo' && !run.skipped && !future) ? `
    <div class="modal-section" style="margin-top:8px">
      <span class="modal-section-label">Actual Segment Breakdown <span style="color:var(--t3);font-weight:400;font-size:0.78rem">(optional)</span></span>
      <div class="actual-fields">
        <div class="form-group">
          <label>Warm-Up (mi)</label>
          <input type="number" id="modal-seg-wu" step="0.1" min="0" max="20"
            placeholder="${expectedWu}"
            value="${run.actualWarmup ?? ''}">
        </div>
        <div class="form-group">
          <label>Tempo (mi)</label>
          <input type="number" id="modal-seg-tm" step="0.1" min="0" max="20"
            placeholder="${expectedTm}"
            value="${run.actualTempo ?? ''}">
        </div>
        <div class="form-group">
          <label>Cool-Down (mi)</label>
          <input type="number" id="modal-seg-cd" step="0.1" min="0" max="20"
            placeholder="${expectedCd}"
            value="${run.actualCooldown ?? ''}">
        </div>
      </div>
      <div style="font-size:0.72rem;color:var(--t3);margin-top:6px">Total will update the distance used for Strava verification.</div>
    </div>` : '';

  // Log/edit actual fields — shown for all non-skipped, non-future runs (including completed)
  const actualLogSection = (!run.skipped && !future) ? `
    <div class="modal-section">
      <span class="modal-section-label">${run.completed ? 'Edit Run Data' : 'Log Actual Run'} <span style="color:var(--t3);font-weight:400;font-size:0.78rem">(optional)</span></span>
      <div class="actual-fields">
        <div class="form-group">
          <label>Total Distance (mi)</label>
          <input type="number" id="modal-actual-dist" step="0.1" min="0.1" max="50"
            value="${run.actualDistance ?? run.distance}">
        </div>
        <div class="form-group">
          <label>Pace (MM:SS)</label>
          <input type="text" id="modal-actual-pace"
            placeholder="${fmtPace(run.estimatedPace).replace('/mi','')}"
            value="${run.actualPace ? fmtPace(run.actualPace).replace('/mi','') : ''}"
            maxlength="5">
        </div>
      </div>
      ${tempoSegmentFields}
    </div>` : '';

  // Inline Strava check to avoid importing strava.js here
  const isStravaConnected = !!(state.strava?.accessToken);
  const stravaSection = (isStravaConnected && !future) ? `
    <div class="modal-section">
      <span class="modal-section-label">Strava</span>
      ${run.stravaVerified
        ? `<div class="strava-verified-row">
             <span class="strava-verified-badge">✓ Verified</span>
             <a class="strava-view-link" href="https://www.strava.com/activities/${run.stravaActivityId}" target="_blank">View on Strava ↗</a>
             <button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:0.68rem;color:var(--t3)" onclick="stravaUnlink('${run.id}')">Unlink</button>
           </div>`
        : `<button class="btn btn-ghost btn-sm strava-link-btn" onclick="linkStravaActivity('${run.id}')">
             <span style="color:#fc4c02;font-weight:900;margin-right:2px">S</span> Link Strava Activity
           </button>`
      }
    </div>` : '';

  // Action buttons
  const completeBtn = run.completed
    ? `<button class="btn btn-ghost" onclick="handleUncomplete('${run.id}')">Undo Complete</button>`
    : future
    ? `<button class="btn btn-success btn-locked" title="Can't log a future run">🔒 Future Run</button>`
    : `<button class="btn btn-success" onclick="handleComplete('${run.id}')">✓ Mark Complete</button>`;

  const updateBtn = run.completed
    ? `<button class="btn btn-primary full" onclick="handleUpdateRun('${run.id}')">Update Run Data</button>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'run-modal';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <select id="modal-run-type" class="modal-type-select mb-${run.type}">
            <option value="easy"     ${run.type==='easy'     ?'selected':''}>Easy</option>
            <option value="tempo"    ${run.type==='tempo'    ?'selected':''}>Tempo</option>
            <option value="long"     ${run.type==='long'     ?'selected':''}>Long Run</option>
            <option value="recovery" ${run.type==='recovery' ?'selected':''}>Recovery</option>
            <option value="race"     ${run.type==='race'     ?'selected':''}>Race Day</option>
          </select>
          <div class="modal-title">${esc(run.label)}</div>
          <div class="modal-meta">${friendlyDate(run.date)} &nbsp;·&nbsp; Week ${run.week}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>

      ${statusHTML}
      ${actualResultsHTML}

      <div class="modal-stats">
        <div class="modal-stat">
          <div class="mstat-val">${run.distance}</div>
          <div class="mstat-lbl">Planned Miles</div>
        </div>
        <div class="modal-stat">
          <div class="mstat-val">${fmtPace(run.estimatedPace)}</div>
          <div class="mstat-lbl">Target Pace</div>
        </div>
        <div class="modal-stat">
          <div class="mstat-val">${fmtSecs(estTime)}</div>
          <div class="mstat-lbl">Est. Time</div>
        </div>
      </div>

      ${tempoSection}
      ${actualLogSection}
      ${stravaSection}

      <div class="modal-section">
        <span class="modal-section-label">Move to a different date</span>
        <div class="modal-move">
          <input type="date" id="modal-date" value="${run.date}">
          <button class="btn btn-ghost btn-sm" onclick="handleMove('${run.id}')">Move</button>
        </div>
      </div>

      <div class="modal-section">
        <span class="modal-section-label">Notes</span>
        <textarea id="modal-notes" placeholder="How'd it feel? Any details to log..."></textarea>
      </div>

      <div class="modal-actions">
        ${completeBtn}
        ${run.skipped
          ? `<button class="btn btn-ghost" onclick="handleUnskip('${run.id}')">Undo Skip</button>`
          : `<button class="btn btn-danger" onclick="handleSkip('${run.id}')">— Skip This Run</button>`
        }
        ${updateBtn}
        <button class="btn btn-ghost full" onclick="handleSaveNotes('${run.id}')">Save Notes</button>
        <button class="btn btn-danger full" onclick="handleDeleteRun('${run.id}')">Delete Run</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  // Set notes value via DOM (not innerHTML) to prevent </textarea> injection
  const ta = document.getElementById('modal-notes');
  if (ta && run.notes) ta.value = run.notes;
}

export function openNewRunModal(dateStr) {
  const pending   = state.strava?.pendingLink; // read BEFORE closeModal() clears it
  closeModal(true); // replacing modal — don't consume pending flash
  const prefillMi = pending ? Math.round(pending.distanceM / 1609.34 * 10) / 10 : null;
  const stravaBanner = pending ? `
    <div style="background:rgba(252,76,2,0.08);border:1px solid rgba(252,76,2,0.25);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:0.78rem;color:#fc4c02">
      <strong>S</strong> &nbsp;Strava activity will be linked automatically when you save.
    </div>` : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'run-modal';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="modal-title">Add Run</div>
          <div class="modal-meta">${friendlyDate(dateStr)}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      ${stravaBanner}
      <div class="modal-section">
        <span class="modal-section-label">Run Type</span>
        <select id="new-run-type" class="modal-type-select mb-easy"
          onchange="this.className='modal-type-select mb-'+this.value; updateNewRunTempoBreakdown()">
          <option value="easy" selected>Easy</option>
          <option value="tempo">Tempo</option>
          <option value="long">Long Run</option>
          <option value="recovery">Recovery</option>
        </select>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Distance (mi)</span>
        <input type="number" id="new-run-dist" step="0.1" min="0.1" max="30"
          placeholder="e.g. 4" value="${prefillMi ?? ''}"
          style="width:100%" oninput="updateNewRunTempoBreakdown()">
      </div>
      <div id="new-run-tempo-section" style="display:none" class="modal-section">
        <span class="modal-section-label">Tempo Breakdown</span>
        <div id="new-run-tempo-guide" class="tempo-guide"></div>
        <div class="tempo-tip">Based on total distance. Warm-up 20%, tempo 65%, cool-down 15%.</div>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Notes <span style="color:var(--t3);font-weight:400">(optional)</span></span>
        <textarea id="new-run-notes" placeholder="Any details..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary full" onclick="handleAddRun('${dateStr}')">Add Run</button>
        <button class="btn btn-ghost full" onclick="closeModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

export function updateNewRunTempoBreakdown() {
  const typeEl  = document.getElementById('new-run-type');
  const distEl  = document.getElementById('new-run-dist');
  const section = document.getElementById('new-run-tempo-section');
  const guide   = document.getElementById('new-run-tempo-guide');
  if (!typeEl || !section || !guide) return;

  const isTempo = typeEl.value === 'tempo';
  section.style.display = isTempo ? '' : 'none';
  if (!isTempo) return;

  const total = parseFloat(distEl?.value) || 0;
  if (total <= 0) { guide.innerHTML = '<div style="color:var(--t3);font-size:0.8rem">Enter a distance to see breakdown.</div>'; return; }

  const wu = Math.max(0.5, Math.round(total * 0.20 * 2) / 2);
  const cd = Math.max(0.5, Math.round(total * 0.15 * 2) / 2);
  const tm = Math.round((total - wu - cd) * 10) / 10;

  const paces = calcPaces(
    parseTimeSecs(state.profile?.fiveKTime),
    parseTimeSecs(state.profile?.tenKTime)
  );

  guide.innerHTML = `
    <div class="tg-row">
      <span class="tg-phase wu">Warm-Up</span>
      <span class="tg-dist">${wu} mi &nbsp;·&nbsp; ${fmtPace(paces.easy)}</span>
    </div>
    <div class="tg-row">
      <span class="tg-phase tm">Tempo</span>
      <span class="tg-dist">${tm > 0 ? tm : '—'} mi &nbsp;·&nbsp; ${fmtPace(paces.tempo)}</span>
    </div>
    <div class="tg-row">
      <span class="tg-phase cd">Cool-Down</span>
      <span class="tg-dist">${cd} mi &nbsp;·&nbsp; ${fmtPace(paces.easy)}</span>
    </div>`;
}

export function openDayCellPicker(dateStr) {
  closeModal(true);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'run-modal';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="modal-title">Add Activity</div>
          <div class="modal-meta">${friendlyDate(dateStr)}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0 8px">
        <button class="picker-btn run" onclick="openNewRunModal('${dateStr}')">+ Add Run</button>
        <button class="picker-btn ct"  onclick="openCTModal('${dateStr}')">+ Add Cross Training</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

export function openCTModal(dateStr, ctId = null) {
  closeModal(true);
  const ct = ctId ? (state.crossTraining || []).find(x => x.id === ctId) : null;
  const isEdit = !!ct;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'run-modal';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  // Sort by most frequently logged, then alphabetically
  const counts = {};
  (state.crossTraining || []).forEach(x => { counts[x.type] = (counts[x.type] || 0) + 1; });
  const sortedTypes = [...CT_TYPES].sort((a, b) => {
    const diff = (counts[b] || 0) - (counts[a] || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
  const typeOptions = sortedTypes.map(t =>
    `<option value="${t}" ${ct?.type === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <div class="modal-title">${isEdit ? 'Edit' : 'Log'} Cross Training</div>
          ${dateStr ? `<div class="modal-meta">${friendlyDate(dateStr)}</div>` : ''}
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Activity Type</span>
        <select id="ct-type" style="width:100%;text-transform:capitalize">${typeOptions}</select>
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Duration (minutes)</span>
        <input type="number" id="ct-duration" min="1" max="600" placeholder="e.g. 45"
          value="${ct?.duration || ''}" style="width:100%">
      </div>
      <div class="modal-section">
        <span class="modal-section-label">Notes <span style="color:var(--t3);font-weight:400">(optional)</span></span>
        <textarea id="ct-notes" placeholder="How'd it go?">${ct?.notes || ''}</textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary full" onclick="${isEdit ? `handleUpdateCT('${ctId}')` : `handleAddCT('${dateStr}')`}">
          ${isEdit ? 'Update' : 'Save'}
        </button>
        ${isEdit ? `<button class="btn btn-danger full" onclick="handleDeleteCT('${ctId}')">Delete</button>` : ''}
        <button class="btn btn-ghost full" onclick="closeModal()">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

export function closeModal(suppressFlash = false) {
  const m = document.getElementById('run-modal');
  if (m) m.remove();
  // Clear pending state only on genuine close, not when replacing with another modal
  if (!suppressFlash && state.strava?.pendingLink) state.strava.pendingLink = null;
  // Flash the day cell that was just linked from bulk sync (only on genuine close)
  if (!suppressFlash) {
    const flashDate = state._pendingFlashDate;
    if (flashDate) {
      delete state._pendingFlashDate;
      requestAnimationFrame(() => {
        const cell = document.querySelector(`.day-cell[data-date="${flashDate}"]`);
        if (cell) {
          cell.classList.remove('linked-flash');
          void cell.offsetWidth; // force reflow to restart animation
          cell.classList.add('linked-flash');
        }
      });
    }
  }
}
