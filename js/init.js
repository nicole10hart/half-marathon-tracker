import { state, loadState } from './state.js';
import { renderApp, renderMainContent, switchView } from './render-app.js';
import { filterRunLog } from './render-stats.js';
import { handleSetup, cancelEdit, openEditProfile,
         resetConfirm, onRaceDateChange, onStartDateChange } from './render-setup.js';
import { openModal, closeModal, openNewRunModal, updateNewRunTempoBreakdown,
         openDayCellPicker, openCTModal } from './render-modal.js';
import { handleComplete, handleUncomplete, handleUpdateRun, handleSkip, handleUnskip,
         handleMove, handleSaveNotes, handleAddRun, handleDeleteRun, dayCellClick,
         onDragStart, onDragOver, onDragLeave, onDrop, stravaUnlink,
         handleAddCT, handleUpdateCT, handleDeleteCT } from './handlers.js';
import { stravaExchangeCode, saveStravaSettings, stravaDisconnect,
         linkStravaActivity, confirmStravaLink, declineStravaLink,
         stravaBulkSync, closeBulkSyncModal,
         linkFromBulk, linkFromBulkSelect,
         quickLinkFromBulk, quickLinkFromBulkSelect, acceptAllBulk,
         rejectBulkActivity, restoreBulkActivity, addNewFromBulk,
         linkCTFromBulk, rejectBulkCT,
         openStravaCTPicker, confirmStravaCTLink } from './strava.js';

// Bridge all onclick-callable functions to window
Object.assign(window, {
  switchView,
  openEditProfile, handleSetup, cancelEdit, resetConfirm,
  onRaceDateChange, onStartDateChange,
  openModal, closeModal, openNewRunModal, updateNewRunTempoBreakdown,
  openDayCellPicker, openCTModal, handleAddCT, handleUpdateCT, handleDeleteCT,
  handleComplete, handleUncomplete, handleUpdateRun, handleSkip, handleUnskip,
  handleMove, handleSaveNotes, handleAddRun, handleDeleteRun, dayCellClick,
  onDragStart, onDragOver, onDragLeave, onDrop, stravaUnlink,
  saveStravaSettings, stravaDisconnect, linkStravaActivity, confirmStravaLink, declineStravaLink,
  stravaBulkSync, closeBulkSyncModal,
  linkFromBulk, linkFromBulkSelect, quickLinkFromBulk, quickLinkFromBulkSelect, acceptAllBulk,
  rejectBulkActivity, restoreBulkActivity, addNewFromBulk,
  linkCTFromBulk, rejectBulkCT, openStravaCTPicker, confirmStravaCTLink,
  filterRunLog,
});

// Boot
loadState();
(async function init() {
  // Handle Strava OAuth redirect — Strava appends ?code=... after authorization
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code && state.strava?.clientId && state.strava?.clientSecret) {
    await stravaExchangeCode(code);
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }
  renderApp();
  // Re-render plan on resize so mobile↔desktop layout switches
  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      if (state.profile && state.view === 'plan') renderMainContent();
    }, 180);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      // Close settings overlay (edit mode only — don't close initial setup)
      if (state.profile) document.getElementById('setup-overlay')?.remove();
    }
  });
})();
