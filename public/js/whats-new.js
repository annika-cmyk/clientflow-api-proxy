/**
 * Välkomsttext + senaste ändringar överst på dashboarden.
 */
(function () {
  function firstName(name) {
    var n = String(name || '').trim();
    if (!n) return '';
    return n.split(/\s+/)[0];
  }

  function currentUserName() {
    var user = (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())
      || window.__clientFlowUser
      || null;
    return firstName(user && user.name);
  }

  function setHello(root) {
    var nameEl = root.querySelector('#whats-new-name');
    var wrap = root.querySelector('.whats-new-name-wrap');
    if (!nameEl) return;
    var name = currentUserName();
    nameEl.textContent = name;
    if (wrap) wrap.hidden = !name;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderItems(listEl, items) {
    if (!listEl) return;
    if (!items || !items.length) {
      listEl.innerHTML = '';
      listEl.hidden = true;
      return;
    }
    listEl.hidden = false;
    listEl.innerHTML = items.map(function (item) {
      return '<li>'
        + '<span class="whats-new-date">' + escapeHtml(item.dateLabel || item.date) + '</span>'
        + '<span class="whats-new-item-title">' + escapeHtml(item.title) + '</span>'
        + '<span class="whats-new-item-summary">' + escapeHtml(item.summary) + '</span>'
        + '</li>';
    }).join('');
  }

  function apiBase() {
    return (window.apiConfig && window.apiConfig.baseUrl) || '';
  }

  function authOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
  }

  async function loadList(root) {
    var listEl = root.querySelector('#whats-new-list');
    var feedbackEl = root.querySelector('#whats-new-feedback-link');
    try {
      var res = await fetch(apiBase() + '/api/whats-new', authOpts());
      if (!res.ok) throw new Error('Kunde inte hämta ändringslistan');
      var data = await res.json();
      renderItems(listEl, data.items || []);
      if (feedbackEl && data.feedbackEmail && !feedbackEl.hasAttribute('data-open-feedback')) {
        feedbackEl.href = 'mailto:' + data.feedbackEmail + '?subject=' + encodeURIComponent('Feedback ClientFlow');
      }
    } catch (err) {
      if (listEl && !listEl.children.length) {
        listEl.hidden = true;
      }
    }
  }

  function init() {
    var root = document.getElementById('dashboard-whats-new');
    if (!root) return;
    setHello(root);
    loadList(root);
    window.addEventListener('clientflow:authReady', function () {
      setHello(root);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
