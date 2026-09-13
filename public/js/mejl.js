/**
 * Mejl-sida – Gmail under etiketten KUNDER + skicka som inloggad användare.
 */
(function () {
  if (!document.getElementById('mejl-connect')) return;

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || '';

  function authOpts(extra) {
    const base = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
    return {
      ...base,
      ...extra,
      headers: { ...(base.headers || {}), ...((extra && extra.headers) || {}) }
    };
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(msOrStr) {
    if (!msOrStr) return '';
    try {
      const d = typeof msOrStr === 'number' ? new Date(msOrStr) : new Date(msOrStr);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return '';
    }
  }

  function showToast(message, type) {
    const existing = document.getElementById('mejl-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'mejl-toast';
    el.className = `notification notification-${type === 'error' ? 'error' : 'success'}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i><span>${esc(message)}</span><button type="button" class="notification-close" aria-label="Stäng"><i class="fas fa-times"></i></button>`;
    el.querySelector('.notification-close').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  function missingEnvMessage(data) {
    const missing = (data && Array.isArray(data.missingEnv) && data.missingEnv.length)
      ? data.missingEnv
      : ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_GMAIL_REDIRECT_URI'];
    const present = data && data.envPresent && typeof data.envPresent === 'object'
      ? Object.entries(data.envPresent).filter(([, set]) => set).map(([k]) => k)
      : [];
    const lengths = data && data.envLengths && typeof data.envLengths === 'object'
      ? Object.entries(data.envLengths).map(([k, n]) => `${k}=${n}`).join(', ')
      : '';
    const setPart = present.length ? ` Satta: ${present.join(', ')}.` : '';
    const lenPart = lengths ? ` Längder: ${lengths}.` : '';
    const hostPart = data && data.requestHost ? ` API-host: ${data.requestHost}.` : '';
    const svc = (data && data.expectedService) || 'clientflow-api-proxy-1';
    return `Gmail är inte konfigurerad på servern. Saknas i Render (${svc}): ${missing.join(', ')}.${setPart}${lenPart}${hostPart} Se docs/GMAIL_SETUP.md.`;
  }

  const els = {
    connectText: document.getElementById('mejl-connect-text'),
    statusPill: document.getElementById('mejl-status-pill'),
    connectBtn: document.getElementById('mejl-connect-btn'),
    disconnectBtn: document.getElementById('mejl-disconnect-btn'),
    refreshBtn: document.getElementById('mejl-refresh-btn'),
    composeToggle: document.getElementById('mejl-compose-toggle'),
    toolbar: document.getElementById('mejl-toolbar'),
    main: document.getElementById('mejl-main'),
    list: document.getElementById('mejl-list'),
    detail: document.getElementById('mejl-detail'),
    filter: document.getElementById('mejl-customer-filter'),
    compose: document.getElementById('mejl-compose'),
    composeCancel: document.getElementById('mejl-compose-cancel'),
    to: document.getElementById('mejl-to'),
    subject: document.getElementById('mejl-subject'),
    body: document.getElementById('mejl-body'),
    customer: document.getElementById('mejl-customer'),
    sendBtn: document.getElementById('mejl-send-btn'),
    sendStatus: document.getElementById('mejl-send-status')
  };

  let status = null;
  let customers = [];
  let messages = [];
  let activeId = null;

  async function loadStatus() {
    const res = await fetch(`${baseUrl}/api/gmail/status`, authOpts());
    const data = await res.json();
    status = data;
    return data;
  }

  async function loadCustomers() {
    try {
      const res = await fetch(`${baseUrl}/api/kunddata`, {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({})
      });
      const data = await res.json();
      const records = (data.success && data.data) ? data.data : [];
      customers = records.map((r) => ({
        id: r.id,
        namn: (r.fields && (r.fields.Namn || r.fields.Företagsnamn)) || 'Namn saknas',
        email: (r.fields && (r.fields['e-post'] || r.fields.Email || r.fields['E-post'])) || ''
      })).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
    } catch (_) {
      customers = [];
    }
  }

  function fillCustomerSelects() {
    const opts = customers.map((c) => `<option value="${esc(c.id)}">${esc(c.namn)}</option>`).join('');
    els.filter.innerHTML = `<option value="">Alla matchade kunder</option>${opts}`;
    els.customer.innerHTML = `<option value="">Ingen</option>${opts}`;
  }

  function setConnectEnabled(enabled, title) {
    // Använd inte native disabled när ej konfigurerad – då dör klick tyst.
    // Visa disabled-stil + aria, och låt click-handlern visa toast.
    els.connectBtn.disabled = false;
    els.connectBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    els.connectBtn.title = title || (enabled ? 'Koppla din Gmail' : 'Gmail OAuth saknas på servern');
    els.connectBtn.classList.toggle('is-disabled', !enabled);
    els.connectBtn.dataset.connectReady = enabled ? '1' : '0';
  }

  function renderStatus() {
    if (!status || !status.success) {
      els.connectText.textContent = 'Kunde inte hämta Gmail-status.';
      setConnectEnabled(false, 'Kunde inte hämta Gmail-status');
      return;
    }
    if (!status.configured) {
      els.statusPill.textContent = 'Ej konfigurerad';
      els.statusPill.classList.add('is-off');
      els.connectText.textContent = status.redirectHint || missingEnvMessage(status);
      els.connectBtn.hidden = false;
      // Knappen förblir klickbar så användaren får tydlig toast – men ser disabled ut.
      setConnectEnabled(false, missingEnvMessage(status));
      els.disconnectBtn.hidden = true;
      els.refreshBtn.hidden = true;
      els.composeToggle.hidden = true;
      els.toolbar.hidden = true;
      els.main.hidden = true;
      return;
    }
    if (status.connected) {
      els.statusPill.textContent = status.email ? `Kopplad: ${status.email}` : 'Kopplad';
      els.statusPill.classList.remove('is-off');
      els.connectText.textContent =
        'Din Gmail är kopplad. Mejl under etiketten KUNDER visas här och utgående mejl skickas från ditt konto.';
      els.connectBtn.hidden = true;
      els.disconnectBtn.hidden = false;
      els.refreshBtn.hidden = false;
      els.composeToggle.hidden = false;
      els.toolbar.hidden = false;
      els.main.hidden = false;
    } else {
      els.statusPill.textContent = 'Ej kopplad';
      els.statusPill.classList.add('is-off');
      els.connectText.textContent =
        'Koppla din Gmail för att läsa kundmejl (etiketter under KUNDER) och skicka mejl som dig själv från ClientFlow.';
      els.connectBtn.hidden = false;
      setConnectEnabled(true);
      els.disconnectBtn.hidden = true;
      els.refreshBtn.hidden = true;
      els.composeToggle.hidden = true;
      els.toolbar.hidden = true;
      els.main.hidden = true;
    }
  }

  function renderUnmatchedHint(unmatchedLabels) {
    const list = Array.isArray(unmatchedLabels) ? unmatchedLabels : [];
    if (!list.length) return '';
    const names = list
      .slice(0, 6)
      .map((u) => u.labelLeaf || u.labelName)
      .filter(Boolean);
    if (!names.length) return '';
    const more = list.length > names.length ? ` (+${list.length - names.length} till)` : '';
    return `<p class="mejl-hint mejl-unmatched">Etiketter under KUNDER utan kundmatch: <strong>${esc(names.join(', '))}</strong>${esc(more)}. Namnet behöver likna kundnamnet i ClientFlow.</p>`;
  }

  function renderList(extraHtml) {
    if (!messages.length) {
      els.list.innerHTML =
        `<p class="mejl-hint">Inga mejl hittades under matchade KUNDER-etiketter.</p>${extraHtml || ''}`;
      return;
    }
    els.list.innerHTML =
      messages
        .map(
          (m) => `
      <button type="button" class="mejl-item${m.id === activeId ? ' is-active' : ''}" data-id="${esc(m.id)}">
        <div class="mejl-item-top">
          <span class="mejl-item-from">${esc(m.from || 'Okänd avsändare')}</span>
          <span class="mejl-item-date">${esc(fmtDate(m.internalDate || m.date))}</span>
        </div>
        <div class="mejl-item-subject">${esc(m.subject)}</div>
        <div class="mejl-item-meta">${esc(m.customerName || '')}${m.labelLeaf || m.labelName ? ' · ' + esc(m.labelLeaf || m.labelName) : ''}</div>
        <div class="mejl-item-snippet">${esc(m.snippet || '')}</div>
      </button>
    `
        )
        .join('') + (extraHtml || '');
  }

  async function loadInbox() {
    els.list.innerHTML = '<p class="mejl-hint"><i class="fas fa-spinner fa-spin"></i> Hämtar mejl från Gmail…</p>';
    const customerId = els.filter.value || '';
    const qs = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
    const res = await fetch(`${baseUrl}/api/gmail/inbox${qs}`, authOpts());
    const data = await res.json();
    if (!res.ok || !data.success) {
      els.list.innerHTML = `<p class="mejl-hint">${esc(data.error || 'Kunde inte hämta inkorg')}</p>`;
      messages = [];
      return;
    }
    messages = data.messages || [];
    const unmatchedHtml = renderUnmatchedHint(data.unmatchedLabels);
    if (data.note && !messages.length) {
      els.list.innerHTML = `<p class="mejl-hint">${esc(data.note)}</p>${unmatchedHtml}`;
      return;
    }
    renderList(unmatchedHtml);
  }

  async function openMessage(id) {
    activeId = id;
    renderList();
    els.detail.innerHTML = '<p class="mejl-detail-empty"><i class="fas fa-spinner fa-spin"></i> Laddar…</p>';
    const res = await fetch(`${baseUrl}/api/gmail/messages/${encodeURIComponent(id)}`, authOpts());
    const data = await res.json();
    if (!res.ok || !data.success) {
      els.detail.innerHTML = `<p class="mejl-detail-empty">${esc(data.error || 'Kunde inte öppna mejlet')}</p>`;
      return;
    }
    const m = data.message;
    const bodyHtml = m.html
      ? `<div class="mejl-detail-body html-body">${m.html}</div>`
      : `<div class="mejl-detail-body">${esc(m.text || m.snippet || '')}</div>`;
    els.detail.innerHTML = `
      <div class="mejl-item-top">
        <strong>${esc(m.subject)}</strong>
        <span class="mejl-item-date">${esc(fmtDate(m.internalDate || m.date))}</span>
      </div>
      <div class="mejl-item-meta">Från: ${esc(m.from)}</div>
      <div class="mejl-item-meta">Till: ${esc(m.to)}</div>
      <div class="mejl-connect-actions" style="margin-top:0.75rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="mejl-reply-btn">
          <i class="fas fa-reply"></i> Svara
        </button>
      </div>
      ${bodyHtml}
    `;
    const replyBtn = document.getElementById('mejl-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        const fromEmail = String(m.from || '').match(/<([^>]+)>/)?.[1] || m.from;
        els.compose.hidden = false;
        els.to.value = fromEmail || '';
        els.subject.value = /^re:/i.test(m.subject || '') ? m.subject : `Re: ${m.subject || ''}`;
        els.body.value = `\n\n---\n${m.text || m.snippet || ''}`;
        els.compose.dataset.threadId = m.threadId || '';
        els.compose.dataset.inReplyTo = m.messageIdHeader || '';
        const match = messages.find((x) => x.id === id);
        if (match && match.customerId) els.customer.value = match.customerId;
        els.body.focus();
      });
    }
  }

  async function sendMail() {
    els.sendStatus.textContent = 'Skickar…';
    const payload = {
      to: els.to.value.trim(),
      subject: els.subject.value.trim(),
      text: els.body.value,
      customerId: els.customer.value || undefined,
      threadId: els.compose.dataset.threadId || undefined,
      inReplyTo: els.compose.dataset.inReplyTo || undefined
    };
    const res = await fetch(`${baseUrl}/api/gmail/send`, {
      method: 'POST',
      ...authOpts(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      els.sendStatus.textContent = data.error || 'Kunde inte skicka';
      return;
    }
    els.sendStatus.textContent = `Skickat från ${data.from || 'Gmail'}`;
    els.compose.hidden = true;
    els.to.value = '';
    els.subject.value = '';
    els.body.value = '';
    delete els.compose.dataset.threadId;
    delete els.compose.dataset.inReplyTo;
    await loadInbox();
  }

  els.connectBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const ready = els.connectBtn.dataset.connectReady === '1' && status && status.configured;
    if (!ready) {
      const msg = missingEnvMessage(status);
      showToast(msg, 'error');
      els.connectText.textContent = msg;
      return;
    }
    const prevHtml = els.connectBtn.innerHTML;
    els.connectBtn.dataset.connectReady = '0';
    els.connectBtn.classList.add('is-disabled');
    els.connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Öppnar Google…';
    try {
      const res = await fetch(`${baseUrl}/api/gmail/connect?redirect=0`, {
        ...authOpts(),
        headers: { ...(authOpts().headers || {}), Accept: 'application/json' }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.url) {
        const msg = data.error || missingEnvMessage(data);
        showToast(msg, 'error');
        els.connectText.textContent = msg;
        els.connectBtn.innerHTML = prevHtml;
        setConnectEnabled(!!(status && status.configured), msg);
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      showToast(err.message || 'Kunde inte starta Gmail-koppling', 'error');
      els.connectBtn.innerHTML = prevHtml;
      setConnectEnabled(true);
    }
  });

  els.disconnectBtn.addEventListener('click', async () => {
    if (!confirm('Koppla från Gmail?')) return;
    await fetch(`${baseUrl}/api/gmail/disconnect`, { method: 'POST', ...authOpts(), body: '{}' });
    await boot();
  });

  els.refreshBtn.addEventListener('click', () => loadInbox());
  els.filter.addEventListener('change', () => loadInbox());
  els.composeToggle.addEventListener('click', () => {
    els.compose.hidden = false;
    els.sendStatus.textContent = '';
  });
  els.composeCancel.addEventListener('click', () => {
    els.compose.hidden = true;
  });
  els.sendBtn.addEventListener('click', () => sendMail());
  els.customer.addEventListener('change', () => {
    const c = customers.find((x) => x.id === els.customer.value);
    if (c && c.email && !els.to.value) els.to.value = c.email;
  });
  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('.mejl-item');
    if (!btn) return;
    openMessage(btn.getAttribute('data-id'));
  });

  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const presetCustomer = params.get('customerId') || '';
    if (params.get('gmail') === 'connected') {
      showToast('Gmail är kopplad.', 'success');
      history.replaceState({}, '', 'mejl.html' + (presetCustomer ? `?customerId=${encodeURIComponent(presetCustomer)}` : ''));
    }
    if (params.get('gmail') === 'error') {
      const reason = params.get('reason') || 'okänt fel';
      els.connectText.textContent = `Kunde inte koppla Gmail: ${reason}`;
      showToast(`Kunde inte koppla Gmail: ${reason}`, 'error');
      history.replaceState({}, '', 'mejl.html');
    }
    await loadCustomers();
    fillCustomerSelects();
    if (presetCustomer) {
      els.filter.value = presetCustomer;
      els.customer.value = presetCustomer;
    }
    await loadStatus();
    renderStatus();
    if (status && status.connected) await loadInbox();
  }

  if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) {
    boot();
  } else {
    window.addEventListener('clientflow:authReady', () => boot(), { once: true });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) boot();
      });
    }
  }
})();
