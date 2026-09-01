/**
 * AI-usage – ClientFlowAdmin-vy över OpenAI-anrop per användare.
 */
(function () {
  function getAuthOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
  }

  function getBaseUrl() {
    return (window.apiConfig && window.apiConfig.baseUrl) || '';
  }

  function fmt(n) {
    return Number(n || 0).toLocaleString('sv-SE');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tableFromBuckets(buckets, keyLabel) {
    if (!buckets || !buckets.length) {
      return '<p class="ai-usage-meta">Ingen data ännu.</p>';
    }
    var rows = buckets.map(function (b) {
      return (
        '<tr>' +
          '<td>' + escapeHtml(b.key) + '</td>' +
          '<td class="num">' + fmt(b.requests) + '</td>' +
          '<td class="num">' + fmt(b.inputTokens) + '</td>' +
          '<td class="num">' + fmt(b.outputTokens) + '</td>' +
          '<td class="num">' + fmt(b.totalTokens) + '</td>' +
          '<td class="num">' + fmt(b.errors) + '</td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<table class="ai-usage-table">' +
        '<thead><tr>' +
          '<th>' + escapeHtml(keyLabel) + '</th>' +
          '<th class="num">Anrop</th>' +
          '<th class="num">In</th>' +
          '<th class="num">Ut</th>' +
          '<th class="num">Totalt</th>' +
          '<th class="num">Fel</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>'
    );
  }

  function recentTable(items) {
    if (!items || !items.length) {
      return '<p class="ai-usage-meta">Inga anrop loggade på den här instansen ännu.</p>';
    }
    var rows = items.map(function (e) {
      return (
        '<tr>' +
          '<td class="ai-usage-mono">' + escapeHtml(String(e.ts || '').replace('T', ' ').slice(0, 19)) + '</td>' +
          '<td>' + escapeHtml(e.user || '(system)') + '</td>' +
          '<td class="ai-usage-mono">' + escapeHtml(e.route || '') + '</td>' +
          '<td class="ai-usage-mono">' + escapeHtml(e.model || '') + '</td>' +
          '<td class="num">' + fmt(e.inputTokens) + '</td>' +
          '<td class="num">' + fmt(e.outputTokens) + '</td>' +
          '<td>' + escapeHtml(e.status || '') + '</td>' +
        '</tr>'
      );
    }).join('');
    return (
      '<table class="ai-usage-table">' +
        '<thead><tr>' +
          '<th>Tid</th><th>Användare</th><th>Route</th><th>Modell</th>' +
          '<th class="num">In</th><th class="num">Ut</th><th>Status</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>'
    );
  }

  async function load() {
    var status = document.getElementById('ai-usage-status');
    var daysEl = document.getElementById('ai-usage-days');
    var days = daysEl ? daysEl.value : '30';
    try {
      var res = await fetch(getBaseUrl() + '/api/ai/usage?days=' + encodeURIComponent(days), getAuthOpts());
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 403) {
        if (status) status.textContent = 'Endast ClientFlowAdmin kan se AI-användning.';
        return;
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Kunde inte hämta usage');
      }
      if (status) {
        status.textContent =
          fmt(data.totalRequests) + ' anrop · ' +
          fmt(data.totalTokens) + ' tokens totalt · sedan ' +
          String(data.since || '').slice(0, 10);
      }
      var byUser = document.getElementById('ai-usage-by-user');
      var byRoute = document.getElementById('ai-usage-by-route');
      var recent = document.getElementById('ai-usage-recent');
      if (byUser) byUser.innerHTML = tableFromBuckets(data.byUser, 'Användare');
      if (byRoute) byRoute.innerHTML = tableFromBuckets(data.byRoute, 'Route');
      if (recent) recent.innerHTML = recentTable(data.recent);
    } catch (err) {
      console.error('AI-usage:', err);
      if (status) status.textContent = err.message || 'Fel vid hämtning';
    }
  }

  function start() {
    var user = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
    if (user && user.role && user.role !== 'ClientFlowAdmin') {
      var status = document.getElementById('ai-usage-status');
      if (status) status.textContent = 'Endast ClientFlowAdmin kan se AI-användning.';
      return;
    }
    var daysEl = document.getElementById('ai-usage-days');
    if (daysEl) daysEl.addEventListener('change', load);
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) start();
      window.addEventListener('clientflow:authReady', start);
    });
  } else {
    if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) start();
    window.addEventListener('clientflow:authReady', start);
  }
})();
