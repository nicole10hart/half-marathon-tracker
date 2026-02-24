import { DAYS_FULL } from './constants.js';
import { state, saveState } from './state.js';
import { parseDate, esc } from './utils.js';
import {
  calcTotalWeeks, calcStartFromRace, raceHint,
  weeksHint, generatePlan,
} from './plan-generator.js';
// renderApp imported lazily to avoid circular dependency at module init time
// (render-app.js → render-setup.js → render-app.js)

export function renderSetupWizard(prefill) {
  const p = prefill || {};
  // Inline Strava connected check to avoid importing strava.js here
  const isStravaConnected = !!(state.strava?.accessToken);

  // Append to body so the overlay sits above the nav bar (escapes #main-content stacking context)
  document.getElementById('setup-overlay')?.remove();
  const _overlay = document.createElement('div');
  _overlay.id = 'setup-overlay';
  _overlay.className = 'setup-overlay';
  if (prefill) _overlay.addEventListener('click', e => { if (e.target === _overlay) cancelEdit(); });
  _overlay.innerHTML = `
      <div class="setup-card">
        ${prefill ? `<button class="modal-close" onclick="cancelEdit()" style="position:absolute;top:18px;right:18px">✕</button>` : ''}
        <div class="setup-logo">
          <div class="setup-logo-icon">
            <svg viewBox="0 0 100 100" width="26" height="26" xmlns="http://www.w3.org/2000/svg">
              <circle cx="60" cy="17" r="7" fill="white"/>
              <path d="M66 12 Q80 5 77 17" stroke="white" stroke-width="5" fill="none" stroke-linecap="round"/>
              <line x1="60" y1="24" x2="54" y2="44" stroke="white" stroke-width="6" stroke-linecap="round"/>
              <line x1="58" y1="32" x2="41" y2="26" stroke="white" stroke-width="5" stroke-linecap="round"/>
              <line x1="58" y1="32" x2="67" y2="42" stroke="white" stroke-width="5" stroke-linecap="round"/>
              <polyline points="54,44 42,62 36,77" stroke="white" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="54" y1="44" x2="64" y2="66" stroke="white" stroke-width="6" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="setup-logo-text">Half<em>Track</em></div>
        </div>
        <div class="setup-h">${prefill ? 'Edit your profile' : 'Build your training plan'}</div>
        <div class="setup-sub">${prefill
          ? 'Saving will regenerate the plan and reset all completion data.'
          : 'Enter your details and we\'ll generate a personalized half marathon training plan.'
        }</div>

        <form id="sf" onsubmit="handleSetup(event)">
          <div class="form-grid">
            <div class="form-group fg-full">
              <label for="s-name">Your Name</label>
              <input id="s-name" type="text" placeholder="e.g. Alex" value="${esc(p.name||'')}" required autocomplete="given-name">
            </div>

            <div class="form-group">
              <label for="s-5k">5K Personal Best <span style="color:var(--t3);font-weight:500;text-transform:none;letter-spacing:0">(optional)</span></label>
              <input id="s-5k" type="text" placeholder="28:30" value="${esc(p.fiveKTime||'')}">
              <span class="form-hint">Format: MM:SS</span>
            </div>
            <div class="form-group">
              <label for="s-10k">10K Personal Best <span style="color:var(--t3);font-weight:500;text-transform:none;letter-spacing:0">(optional)</span></label>
              <input id="s-10k" type="text" placeholder="58:45" value="${esc(p.tenKTime||'')}">
              <span class="form-hint">Format: MM:SS or H:MM:SS</span>
            </div>

            <div class="form-group">
              <label for="s-dpw">Days Per Week</label>
              <select id="s-dpw">
                ${[3,4,5,6].map(n =>
                  `<option value="${n}" ${(p.daysPerWeek==n||(!p.daysPerWeek&&n===4))?'selected':''}>${n} days / week</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="s-lrd">Long Run Day</label>
              <select id="s-lrd">
                ${DAYS_FULL.map(d =>
                  `<option value="${d}" ${(p.longRunDay===d||(!p.longRunDay&&d==='Saturday'))?'selected':''}>${d}</option>`
                ).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="s-race">Race Date</label>
              <input id="s-race" type="date" value="${p.raceDate||''}" required onchange="onRaceDateChange()">
              <span class="form-hint" id="s-start-hint">${p.raceDate ? raceHint(p.raceDate) : 'Sets race day and auto-fills start date.'}</span>
            </div>
            <div class="form-group">
              <label for="s-start">Plan Start Date</label>
              <input id="s-start" type="date" value="${p.startDate || (p.raceDate ? calcStartFromRace(p.raceDate) : '')}" onchange="onStartDateChange()">
              <span class="form-hint" id="s-weeks-hint">${p.startDate && p.raceDate ? weeksHint(p.startDate, p.raceDate) : 'Auto-filled from race date. Override to change plan length.'}</span>
            </div>
          </div>

          <div class="setup-actions">
            ${prefill ? `<button type="button" class="btn btn-ghost" onclick="cancelEdit()">Cancel</button>` : ''}
            <button type="submit" class="btn btn-primary btn-lg">
              ${prefill ? 'Regenerate Plan →' : 'Generate My Plan →'}
            </button>
          </div>
        </form>

        ${prefill ? `
        <div class="divider"></div>
        <div class="strava-section">
          <div class="strava-section-hdr">
            <div class="strava-section-title">
              <div class="strava-s-logo">S</div> Strava Integration
            </div>
            ${isStravaConnected ? `<span class="strava-connected-pill">✓ Connected</span>` : ''}
          </div>
          ${isStravaConnected
            ? `<div class="strava-athlete">Connected as <strong>${esc(state.strava.athleteName) || 'Athlete'}</strong></div>
               <button class="btn btn-ghost btn-sm" onclick="stravaDisconnect()">Disconnect</button>`
            : `<p class="strava-hint">Connect Strava to verify completed runs against real activity data. First <a href="https://www.strava.com/settings/api" target="_blank">create a Strava API app</a> and set the Authorization Callback Domain to <code>${window.location.hostname}</code>. Works locally — run via <code>python3 -m http.server</code> or Live Server, then set the domain to <code>localhost</code>. Enter your credentials below.</p>
               <div class="form-grid">
                 <div class="form-group">
                   <label>Client ID</label>
                   <input id="s-strava-cid" type="text" placeholder="123456" value="${state.strava?.clientId||''}">
                 </div>
                 <div class="form-group">
                   <label>Client Secret</label>
                   <input id="s-strava-cs" type="password" placeholder="••••••••••" value="${state.strava?.clientSecret||''}">
                 </div>
               </div>
               <div style="margin-top:10px">
                 <button class="btn btn-primary btn-sm" onclick="saveStravaSettings()">Connect with Strava →</button>
               </div>`
          }
        </div>` : ''}
      </div>
  `;
  document.body.appendChild(_overlay);
}

export function handleSetup(e) {
  e.preventDefault();
  const name        = document.getElementById('s-name').value.trim();
  const fiveKTime   = document.getElementById('s-5k').value.trim();
  const tenKTime    = document.getElementById('s-10k').value.trim();
  const daysPerWeek = parseInt(document.getElementById('s-dpw').value, 10);
  const longRunDay  = document.getElementById('s-lrd').value;
  const raceDate    = document.getElementById('s-race').value;

  if (!name || !raceDate) return;

  const startDate  = document.getElementById('s-start').value || calcStartFromRace(raceDate);
  const totalWeeks = calcTotalWeeks(startDate, raceDate);

  // Warn before overwriting existing progress
  if (state.profile && state.plan.length > 0) {
    const done = state.plan.filter(r => r.completed || r.stravaVerified || r.notes).length;
    if (done > 0 && !confirm(`Regenerating will erase all logged data — ${done} run${done !== 1 ? 's' : ''} with progress (completions, Strava links, notes). This cannot be undone. Continue?`)) return;
  }

  if (!fiveKTime && !tenKTime) {
    if (!confirm('No race times entered — training paces will be based on a 9:00/mile default. Continue?')) return;
  }

  state.profile = { name, fiveKTime, tenKTime, daysPerWeek, longRunDay, startDate, raceDate, totalWeeks };
  state.plan = generatePlan(state.profile);
  state.view = 'plan';
  saveState();
  document.getElementById('setup-overlay')?.remove();
  import('./render-app.js').then(m => m.renderApp());
}

export function openEditProfile() {
  renderSetupWizard(state.profile);
}

export function cancelEdit() {
  document.getElementById('setup-overlay')?.remove();
  import('./render-app.js').then(m => m.renderApp());
}

export function resetConfirm() {
  if (confirm('Reset your entire plan and all data?')) {
    Object.assign(state, { profile: null, plan: [], view: 'today', strava: null, crossTraining: [], injuries: [] });
    saveState();
    document.getElementById('setup-overlay')?.remove();
    import('./render-app.js').then(m => m.renderApp());
  }
}

export function onRaceDateChange() {
  const raceVal  = document.getElementById('s-race')?.value;
  const hint     = document.getElementById('s-start-hint');
  const lrdSel   = document.getElementById('s-lrd');
  const startEl  = document.getElementById('s-start');
  const wkHint   = document.getElementById('s-weeks-hint');
  if (!raceVal) return;
  const rd = parseDate(raceVal);
  if (lrdSel) lrdSel.value = DAYS_FULL[rd.getDay()];
  if (hint)   hint.textContent = raceHint(raceVal);
  if (startEl && !startEl.dataset.manual) {
    const autoStart = calcStartFromRace(raceVal);
    startEl.value = autoStart;
    if (wkHint) wkHint.textContent = weeksHint(autoStart, raceVal);
  } else if (startEl?.value && wkHint) {
    wkHint.textContent = weeksHint(startEl.value, raceVal);
  }
}

export function onStartDateChange() {
  const startEl = document.getElementById('s-start');
  const raceEl  = document.getElementById('s-race');
  const wkHint  = document.getElementById('s-weeks-hint');
  if (startEl) startEl.dataset.manual = '1';
  if (startEl?.value && raceEl?.value && wkHint) {
    wkHint.textContent = weeksHint(startEl.value, raceEl.value);
  }
}
