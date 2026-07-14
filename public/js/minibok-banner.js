/**
 * Notisbanner för nya kunder från Minibok (visas högst upp i appen).
 */
(function () {
  const BANNER_ID = 'minibok-pending-banner';

  function getBaseUrl() {
    return (window.apiConfig && window.apiConfig.baseUrl) || 'http://localhost:3001';
  }

  function getAuthOpts() {
    if (window.AuthManager && typeof AuthManager.getAuthFetchOptions === 'function') {
      return AuthManager.getAuthFetchOptions();
    }
    return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  function removeBanner() {
    const el = document.getElementById(BANNER_ID);
    if (el) el.remove();
  }

  function renderBanner(notifications) {
    removeBanner();
    if (!notifications || !notifications.length) return;

    const container = document.createElement('div');
    container.id = BANNER_ID;
    container.className = 'minibok-banner-stack';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Minibok-notiser');

    notifications.forEach((n) => {
      const item = document.createElement('div');
      item.className = 'minibok-banner uppdrag-banner uppdrag-banner--ny';
      item.innerHTML = `
        <div class="minibok-banner-content">
          <i class="fas fa-bell" aria-hidden="true"></i>
          <span><strong>${escapeHtml(n.name || 'Ny kund')}</strong> (${escapeHtml(n.orgNr || '')}) – ${escapeHtml(n.message || 'Ny kund från Minibok som bör hanteras')}</span>
        </div>
        <div class="minibok-banner-actions">
          <a href="kundkort.html?id=${encodeURIComponent(n.companyId)}" class="minibok-banner-btn minibok-banner-btn--primary">Öppna kund</a>
          <button type="button" class="minibok-banner-btn" data-dismiss-id="${escapeHtml(n.id)}">Markera som hanterad</button>
        </div>`;
      container.appendChild(item);
    });

    const main = document.querySelector('.main-content') || document.querySelector('.app-container') || document.body;
    main.insertBefore(container, main.firstChild);

    container.querySelectorAll('[data-dismiss-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-dismiss-id');
        btn.disabled = true;
        try {
          const res = await fetch(`${getBaseUrl()}/api/minibok/notifications/${encodeURIComponent(id)}/dismiss`, {
            method: 'POST',
            ...getAuthOpts()
          });
          if (res.ok) {
            await loadMinibokNotifications();
          }
        } catch (e) {
          console.warn('Minibok dismiss:', e);
          btn.disabled = false;
        }
      });
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadMinibokNotifications() {
    if (!window.AuthManager || typeof AuthManager.isAuthenticated !== 'function') return;
    const authed = await AuthManager.isAuthenticated().catch(() => false);
    if (!authed) {
      removeBanner();
      return;
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/minibok/notifications`, getAuthOpts());
      if (!res.ok) return;
      const data = await res.json();
      renderBanner(data.notifications || []);
    } catch (e) {
      console.warn('Minibok notifications:', e);
    }
  }

  window.loadMinibokNotifications = loadMinibokNotifications;

  document.addEventListener('DOMContentLoaded', () => {
    loadMinibokNotifications();
  });
})();
