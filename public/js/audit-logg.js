(function () {
  function getEl(id) { return document.getElementById(id); }
  function getBaseUrl() { return (window.apiConfig && window.apiConfig.baseUrl) || ''; }
  function getAuthOpts() {
    return (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions())
      || { credentials: 'include', headers: {} };
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatTs(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_) { return String(iso); }
  }
  function editUrl(item) {
    if (!item) return '#';
    if (item.entityType === 'kund') return 'kundkort.html?id=' + encodeURIComponent(item.entityId);
    if (item.entityType === 'tjanst') return 'riskbedomning-byra.html';
    if (item.entityType === 'riskfaktor') return 'ovriga-riskfaktorer.html';
    if (item.entityType === 'ar_dokument') return 'allman-riskbedomning-byra.html';
    if (item.entityType === 'avvikelse') return 'avvikelser.html';
    return 'kundkort.html?id=' + encodeURIComponent(item.entityId);
  }
  function previewValue(value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'object') {
      try { return escapeHtml(JSON.stringify(value)); } catch (_) { return '—'; }
    }
    const text = String(value);
    return escapeHtml(text.length > 240 ? text.slice(0, 240) + '…' : text);
  }

  function currentRole() {
    const user = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
    return String((user && user.role) || '').toLowerCase();
  }

  function isLedare() {
    const role = currentRole();
    return role === 'ledare' || role === 'clientflowadmin' || role === 'admin';
  }

  function queryFromForm() {
    return {
      q: (getEl('audit-q') && getEl('audit-q').value) || '',
      actionType: (getEl('audit-action') && getEl('audit-action').value) || '',
      entityType: (getEl('audit-entity') && getEl('audit-entity').value) || '',
      from: (getEl('audit-from') && getEl('audit-from').value) || '',
      to: (getEl('audit-to') && getEl('audit-to').value) || '',
      requiresReview: getEl('audit-review-only') && getEl('audit-review-only').checked ? '1' : ''
    };
  }

  async function fetchLog(extra) {
    const q = Object.assign(queryFromForm(), extra || {});
    const params = new URLSearchParams();
    Object.keys(q).forEach((key) => { if (q[key]) params.set(key, q[key]); });
    const res = await fetch(getBaseUrl() + '/api/audit-log?' + params.toString(), getAuthOpts());
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Kunde inte hämta revisionsloggen');
    return data;
  }

  function renderItems(items) {
    const list = getEl('audit-log-list');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p class="section-desc">Inga loggrader matchar filtret.</p>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      const flag = item.overdue
        ? '<span class="audit-flag audit-flag--warn">Risknivå saknas &gt; 48 h</span>'
        : (item.requiresReview ? '<span class="audit-flag">Kräver granskning</span>' : '');
      return '<article class="audit-log-item">'
        + '<header class="audit-log-item-head">'
        + '<strong>' + escapeHtml(item.actionLabel || item.actionType) + '</strong>'
        + '<span class="audit-log-meta">' + escapeHtml(formatTs(item.timestamp)) + ' · ' + escapeHtml(item.actorName || 'System') + '</span>'
        + flag
        + '</header>'
        + '<p class="audit-log-line">' + escapeHtml(item.entityType) + ' <code>' + escapeHtml(item.entityId) + '</code>'
        + (item.fieldChanged ? ' · ' + escapeHtml(item.fieldChanged) : '') + '</p>'
        + (item.motivering ? '<p class="audit-log-motivering">' + escapeHtml(item.motivering) + '</p>' : '')
        + '<p class="audit-log-values"><span>Före: ' + previewValue(item.valueBefore) + '</span>'
        + '<span>Efter: ' + previewValue(item.valueAfter) + '</span></p>'
        + renderScreeningAssess(item)
        + '</article>';
    }).join('');
    list.querySelectorAll('[data-screen-assess]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        assessHit(btn.getAttribute('data-customer'), btn.getAttribute('data-person'), btn.getAttribute('data-log'));
      });
    });
  }

  function renderScreeningAssess(item) {
    if (item.actionType !== 'screening_utförd') return '';
    const hits = (item.metadata && item.metadata.perTraff) || [];
    if (!hits.length) return '<p class="audit-log-line">Inga namngivna träffar att bedöma.</p>';
    return '<ul class="audit-traff-list">' + hits.map(function (hit) {
      const name = hit.matchadPerson || 'Okänd träff';
      return '<li>' + escapeHtml(name) + ' · ' + escapeHtml(hit.kalla || '')
        + ' <button type="button" class="btn btn-ghost btn-sm" data-screen-assess data-customer="'
        + escapeHtml(item.entityId) + '" data-person="' + escapeHtml(name) + '" data-log="'
        + escapeHtml(item.id) + '">Bedöm</button></li>';
    }).join('') + '</ul>';
  }

  function renderReview(items) {
    const box = getEl('audit-review-list');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<p class="section-desc">Inget AI-innehåll väntar på granskning.</p>';
      return;
    }
    const groups = {};
    items.forEach(function (item) {
      const key = item.entityType + ':' + item.entityId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    box.innerHTML = Object.keys(groups).map(function (key) {
      const rows = groups[key];
      const first = rows[0];
      return '<section class="audit-review-group">'
        + '<h4>' + escapeHtml(first.entityType) + ' <code>' + escapeHtml(first.entityId) + '</code></h4>'
        + rows.map(function (item) {
          const pct = item.metadata && item.metadata.diffProcent;
          return '<div class="audit-review-row">'
            + '<span>' + escapeHtml(item.fieldChanged || 'fält') + ' · diff ' + escapeHtml(pct == null ? '—' : pct + '%') + '</span>'
            + '<a class="btn btn-secondary btn-sm" href="' + escapeHtml(editUrl(item)) + '">Öppna</a>'
            + '<button type="button" class="btn btn-primary btn-sm" data-approve="' + escapeHtml(item.id) + '">Godkänn som korrekt</button>'
            + '</div>';
        }).join('')
        + '</section>';
    }).join('');
    box.querySelectorAll('[data-approve]').forEach(function (btn) {
      btn.addEventListener('click', function () { approveItem(btn.getAttribute('data-approve')); });
    });
  }

  async function assessHit(customerId, person, logId) {
    const bedömning = window.prompt('Bedömning för ' + person + ' (falsk_positiv, relevant eller eskalerad):', 'falsk_positiv');
    if (!bedömning) return;
    const motivering = window.prompt('Motivering (obligatorisk):', '');
    if (!motivering) return;
    const res = await fetch(getBaseUrl() + '/api/audit-log/screening-bedomning', {
      method: 'POST',
      credentials: 'include',
      headers: Object.assign({ 'Content-Type': 'application/json' }, (getAuthOpts().headers || {})),
      body: JSON.stringify({ customerId, matchadPerson: person, bedömning: bedömning.trim(), motivering, screeningLogId: logId })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      alert(data.error || 'Kunde inte spara bedömningen');
      return;
    }
    loadAuditLog();
  }

  async function approveItem(id) {
    const motivering = window.prompt('Bekräfta att den låga redigeringsgraden är avsiktlig och sakligt korrekt. Motivering:');
    if (!motivering) return;
    const res = await fetch(getBaseUrl() + '/api/audit-log/' + encodeURIComponent(id) + '/godkann', {
      method: 'POST',
      credentials: 'include',
      headers: Object.assign({ 'Content-Type': 'application/json' }, (getAuthOpts().headers || {})),
      body: JSON.stringify({ motivering })
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      alert(data.error || 'Kunde inte godkänna');
      return;
    }
    loadAuditLog();
  }

  async function loadAuditLog() {
    const list = getEl('audit-log-list');
    const review = getEl('audit-review-list');
    const banner = getEl('audit-overdue-banner');
    if (list) list.innerHTML = '<p class="section-desc"><i class="fas fa-spinner fa-spin"></i> Hämtar logg…</p>';
    try {
      const data = await fetchLog();
      if (banner) {
        banner.hidden = !data.overdueRiskCount;
        banner.textContent = data.overdueRiskCount
          ? data.overdueRiskCount + ' kunder saknar fortfarande risknivå mer än 48 timmar efter skapande.'
          : '';
      }
      const action = getEl('audit-action');
      if (action && action.options.length <= 1 && data.actionLabels) {
        Object.keys(data.actionLabels).forEach(function (key) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = data.actionLabels[key];
          action.appendChild(opt);
        });
      }
      renderReview(data.reviewItems || []);
      renderItems(data.items || []);
    } catch (err) {
      if (list) list.innerHTML = '<p class="section-desc">' + escapeHtml(err.message) + '</p>';
      if (review) review.innerHTML = '';
    }
  }

  function revealTab() {
    const tab = document.querySelector('[data-dok-tab="audit"]');
    const pane = getEl('dok-pane-audit');
    if (!isLedare()) {
      if (tab) tab.hidden = true;
      if (pane) pane.hidden = true;
      return false;
    }
    if (tab) tab.hidden = false;
    return true;
  }

  function init() {
    if (!revealTab()) return;
    const form = getEl('audit-filter-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        loadAuditLog();
      });
    }
    if (String(window.location.hash || '').replace('#', '') === 'revisionslogg') {
      if (typeof window.showDokumentationTab === 'function') window.showDokumentationTab('audit');
      loadAuditLog();
    }
  }

  window.clientflowAuditLog = {
    load: loadAuditLog,
    revealTab: revealTab,
    isLedare: isLedare
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
