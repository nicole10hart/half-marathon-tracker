import { state, saveState } from './state.js';
import { renderPlanHTML, setupDragListeners } from './render-plan.js';
import { renderStatsHTML, animateRing } from './render-stats.js';
// render-setup imported lazily to avoid circular dependency at module init time
// (render-setup.js calls renderApp via dynamic import)

export function renderMainContent() {
  const main = document.getElementById('main-content');
  if (!main) return;
  if (state.view === 'plan') {
    main.innerHTML = renderPlanHTML();
    setupDragListeners();
  } else {
    main.innerHTML = renderStatsHTML();
    animateRing();
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
    <button class="nav-tab ${state.view==='plan'?'active':''}" onclick="switchView('plan')">Training Plan</button>
    <button class="nav-tab ${state.view==='stats'?'active':''}" onclick="switchView('stats')">Stats &amp; Progress</button>
  `;
  document.getElementById('nav-right').innerHTML = `
    <button class="btn btn-ghost" onclick="openEditProfile()">⚙<span class="btn-txt"> Settings</span></button>
    <button class="btn btn-ghost" onclick="resetConfirm()">↺<span class="btn-txt"> Reset</span></button>
  `;

  renderMainContent();
}
