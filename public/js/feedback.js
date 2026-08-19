/**
 * Feedbackformulär på dashboarden. Skickas till hej@clientflow.se.
 */
(function () {
  var modal;
  var form;
  var statusEl;
  var submitBtn;
  var lastFocus = null;

  function apiBase() {
    return (window.apiConfig && window.apiConfig.baseUrl) || '';
  }

  function authOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
  }

  function currentUser() {
    return (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())
      || window.__clientFlowUser
      || null;
  }

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('is-error', kind === 'error');
    statusEl.classList.toggle('is-ok', kind === 'ok');
  }

  function fillFromUser() {
    var user = currentUser() || {};
    var nameEl = document.getElementById('feedback-from-name');
    var emailEl = document.getElementById('feedback-from-email');
    var emailWrap = document.getElementById('feedback-from-email-wrap');
    if (nameEl) nameEl.textContent = user.name || 'Inloggad användare';
    if (emailEl) emailEl.textContent = user.email || '';
    if (emailWrap) emailWrap.hidden = !user.email;
  }

  function openModal(e) {
    if (e) e.preventDefault();
    if (!modal) return;
    lastFocus = document.activeElement;
    fillFromUser();
    setStatus('', '');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    var message = document.getElementById('feedback-message');
    if (message) message.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (form) form.reset();
    setStatus('', '');
    if (submitBtn) submitBtn.disabled = false;
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form) return;
    var message = (document.getElementById('feedback-message') || {}).value || '';
    var type = (document.getElementById('feedback-type') || {}).value || 'forslag';
    setStatus('', '');
    if (submitBtn) submitBtn.disabled = true;
    try {
      var res = await fetch(apiBase() + '/api/feedback', {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({ type: type, message: message })
      });
      var data = {};
      try { data = await res.json(); } catch (_) {}
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Kunde inte skicka feedback just nu.');
      }
      setStatus('Tack! Vi har tagit emot din feedback.', 'ok');
      form.reset();
      fillFromUser();
      setTimeout(closeModal, 1400);
    } catch (err) {
      setStatus(err.message || 'Kunde inte skicka feedback just nu.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function init() {
    modal = document.getElementById('feedback-modal');
    form = document.getElementById('feedback-form');
    statusEl = document.getElementById('feedback-status');
    submitBtn = document.getElementById('feedback-submit');
    if (!modal || !form) return;

    document.querySelectorAll('[data-open-feedback]').forEach(function (el) {
      el.addEventListener('click', openModal);
    });

    var closeBtn = document.getElementById('feedback-modal-close');
    var cancelBtn = document.getElementById('feedback-cancel');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });
    form.addEventListener('submit', onSubmit);
    window.addEventListener('clientflow:authReady', fillFromUser);
    fillFromUser();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
