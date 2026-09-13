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

  function fromDisplayName(m) {
    if (m && m.fromName) return String(m.fromName).trim();
    const raw = String((m && m.from) || '').trim();
    if (!raw) return 'Okänd avsändare';
    const angled = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
    if (angled) {
      const name = angled[1].replace(/^["']+|["']+$/g, '').trim();
      return name || angled[2] || 'Okänd avsändare';
    }
    return raw;
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
    sendStatus: document.getElementById('mejl-send-status'),
    folderInbox: document.getElementById('mejl-folder-inbox'),
    folderSent: document.getElementById('mejl-folder-sent')
  };

  let status = null;
  let customers = [];
  let messages = [];
  let activeId = null;
  let folder = 'inbox';
  let kunderLabelsCache = [];
  let detailContext = null;

  function labelChipHtml(label, opts) {
    const removable = opts && opts.removable;
    const cls = [
      'mejl-label-chip',
      label && label.isKunderChild ? 'is-kunder' : '',
      label && label.isSystem ? 'is-system' : '',
      label && label.isKunderRoot ? 'is-kunder-root' : ''
    ]
      .filter(Boolean)
      .join(' ');
    const text =
      (label && (label.isKunderChild ? label.leaf || label.name : label.displayName || label.name)) ||
      '';
    const title = (label && label.name) || text;
    const removeBtn =
      removable && label && label.isKunderChild
        ? `<button type="button" class="mejl-label-remove" data-remove-label="${esc(label.id)}" title="Ta bort etikett" aria-label="Ta bort ${esc(text)}"><i class="fas fa-times"></i></button>`
        : '';
    return `<span class="${cls}" title="${esc(title)}"><i class="fas fa-tag"></i> ${esc(text)}${removeBtn}</span>`;
  }

  function renderLabelChips(labels, opts) {
    const list = Array.isArray(labels) ? labels : [];
    if (!list.length) return '';
    // Visa kundetiketter tydligt; systemetiketter mer diskret (hoppa UNREAD).
    const visible = list.filter((l) => !(l && l.id === 'UNREAD'));
    if (!visible.length) return '';
    return `<div class="mejl-labels">${visible.map((l) => labelChipHtml(l, opts)).join('')}</div>`;
  }

  function kunderOptionsHtml(selectedId) {
    const opts = (kunderLabelsCache || [])
      .map((l) => {
        const sel = l.id === selectedId ? ' selected' : '';
        return `<option value="${esc(l.id)}"${sel}>${esc(l.leaf || l.name)}</option>`;
      })
      .join('');
    return `<option value="">Välj kundetikett…</option>${opts}<option value="__create__">＋ Skapa ny KUNDER/…</option>`;
  }

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

  function setFolderUi() {
    if (els.folderInbox) els.folderInbox.classList.toggle('is-active', folder === 'inbox');
    if (els.folderSent) els.folderSent.classList.toggle('is-active', folder === 'sent');
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
      els.connectText.textContent = '';
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
        'Koppla Gmail för att läsa kundmejl under KUNDER och skicka som dig själv.';
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
    return `<p class="mejl-hint mejl-unmatched">Etiketter under KUNDER utan kundmatch: <strong>${esc(names.join(', '))}</strong>${esc(more)}.</p>`;
  }

  function renderList(extraHtml) {
    if (!messages.length) {
      const empty =
        folder === 'sent'
          ? 'Inga skickade mejl under etiketten KUNDER.'
          : 'Inga mejl hittades under etiketten KUNDER.';
      els.list.innerHTML = `<p class="mejl-hint">${empty}</p>${extraHtml || ''}`;
      return;
    }
    els.list.innerHTML =
      messages
        .map((m) => {
          const customer = String(m.customerName || '').trim() || 'Okänd kund';
          const sender = fromDisplayName(m);
          const kunderOnly = (m.labels || []).filter((l) => l && l.isKunderChild);
          const labelHtml = kunderOnly.length
            ? renderLabelChips(kunderOnly)
            : m.labelLeaf
              ? renderLabelChips([
                  {
                    id: m.labelId,
                    name: m.labelName,
                    leaf: m.labelLeaf,
                    displayName: m.labelLeaf,
                    isKunderChild: true
                  }
                ])
              : '';
          return `
      <button type="button" class="mejl-item${m.id === activeId ? ' is-active' : ''}" data-id="${esc(m.id)}">
        <div class="mejl-item-top">
          <span class="mejl-item-customer">${esc(customer)}</span>
          <span class="mejl-item-date">${esc(fmtDate(m.internalDate || m.date))}</span>
        </div>
        <div class="mejl-item-from">${esc(sender)}</div>
        <div class="mejl-item-subject">${esc(m.subject)}</div>
        ${labelHtml}
        <div class="mejl-item-snippet">${esc(m.snippet || '')}</div>
      </button>
    `;
        })
        .join('') + (extraHtml || '');
  }

  async function loadInbox() {
    setFolderUi();
    els.list.innerHTML = '<p class="mejl-hint"><i class="fas fa-spinner fa-spin"></i> Hämtar mejl från Gmail…</p>';
    els.detail.innerHTML = '<p class="mejl-detail-empty">Välj ett mejl till vänster.</p>';
    activeId = null;
    const customerId = els.filter.value || '';
    const params = new URLSearchParams();
    params.set('folder', folder);
    if (customerId) params.set('customerId', customerId);
    const res = await fetch(`${baseUrl}/api/gmail/inbox?${params}`, authOpts());
    const data = await res.json();
    if (!res.ok || !data.success) {
      els.list.innerHTML = `<p class="mejl-hint">${esc(data.error || 'Kunde inte hämta mejl')}</p>`;
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

  async function trashMessage(id) {
    if (!confirm('Flytta mejlet till papperskorgen i Gmail?')) return;
    const res = await fetch(`${baseUrl}/api/gmail/messages/${encodeURIComponent(id)}/trash`, {
      method: 'POST',
      ...authOpts(),
      body: '{}'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToast(data.error || 'Kunde inte radera mejlet', 'error');
      return;
    }
    showToast('Mejlet flyttades till papperskorgen.', 'success');
    activeId = null;
    els.detail.innerHTML = '<p class="mejl-detail-empty">Välj ett mejl till vänster.</p>';
    await loadInbox();
  }

  function applyLabelResultToList(id, data) {
    const idx = messages.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const prev = messages[idx];
    messages[idx] = {
      ...prev,
      labelIds: data.labelIds || prev.labelIds,
      labels: data.labels || prev.labels,
      customerId: Object.prototype.hasOwnProperty.call(data, 'customerId')
        ? data.customerId
        : prev.customerId,
      customerName: Object.prototype.hasOwnProperty.call(data, 'customerName')
        ? data.customerName || ''
        : prev.customerName,
      labelId: Object.prototype.hasOwnProperty.call(data, 'labelId')
        ? data.labelId
        : prev.labelId,
      labelName: Object.prototype.hasOwnProperty.call(data, 'labelName')
        ? data.labelName
        : prev.labelName,
      labelLeaf: Object.prototype.hasOwnProperty.call(data, 'labelLeaf')
        ? data.labelLeaf
        : prev.labelLeaf,
      matchReason: Object.prototype.hasOwnProperty.call(data, 'matchReason')
        ? data.matchReason
        : prev.matchReason
    };
    if (Array.isArray(data.kunderLabels)) kunderLabelsCache = data.kunderLabels;
    renderList();
  }

  function customerOptionsHtml(selectedId) {
    const opts = (customers || [])
      .map((c) => {
        const sel = c.id === selectedId ? ' selected' : '';
        return `<option value="${esc(c.id)}"${sel}>${esc(c.namn)}</option>`;
      })
      .join('');
    return `<option value="">Välj kund i ClientFlow…</option>${opts}`;
  }

  function matchReasonLabel(reason) {
    const r = String(reason || '').toLowerCase();
    if (r === 'link') return { text: 'Match via sparad koppling', cls: 'is-link' };
    if (r === 'email') return { text: 'Match via e-post (auto)', cls: 'is-auto' };
    if (r === 'label+email') return { text: 'Match via etikett + e-post (auto)', cls: 'is-auto' };
    if (r === 'label') return { text: 'Match via etikettnamn (auto)', cls: 'is-auto' };
    return null;
  }

  function bindDetailLabelUi(id) {
    const select = document.getElementById('mejl-label-select');
    const applyBtn = document.getElementById('mejl-label-apply');
    const createWrap = document.getElementById('mejl-label-create-wrap');
    const createInput = document.getElementById('mejl-label-create');
    const createBtn = document.getElementById('mejl-label-create-btn');
    const linkSelect = document.getElementById('mejl-link-customer');
    const linkBtn = document.getElementById('mejl-link-apply');
    const unlinkBtn = document.getElementById('mejl-link-remove');
    const syncCheck = document.getElementById('mejl-link-sync-gmail');

    function syncCreateVisibility() {
      if (!createWrap || !select) return;
      createWrap.hidden = select.value !== '__create__';
    }

    if (select) {
      select.addEventListener('change', syncCreateVisibility);
      syncCreateVisibility();
    }
    if (applyBtn && select) {
      applyBtn.addEventListener('click', async () => {
        const val = select.value;
        if (!val) {
          showToast('Välj en kundetikett först.', 'error');
          return;
        }
        if (val === '__create__') {
          if (createWrap) createWrap.hidden = false;
          if (createInput) createInput.focus();
          return;
        }
        applyBtn.disabled = true;
        try {
          await modifyLabels(id, { setKunderLabelId: val });
        } finally {
          applyBtn.disabled = false;
        }
      });
    }
    if (createBtn && createInput) {
      createBtn.addEventListener('click', async () => {
        const leaf = createInput.value.trim();
        if (!leaf) {
          showToast('Ange kundnamn för den nya etiketten.', 'error');
          return;
        }
        createBtn.disabled = true;
        try {
          await modifyLabels(id, { createKunderLeaf: leaf });
        } finally {
          createBtn.disabled = false;
        }
      });
    }
    els.detail.querySelectorAll('[data-remove-label]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lid = btn.getAttribute('data-remove-label');
        if (!lid) return;
        if (!confirm('Ta bort kundetiketten från mejlet i Gmail?')) return;
        await modifyLabels(id, { remove: [lid] });
      });
    });

    if (linkBtn && linkSelect) {
      linkBtn.addEventListener('click', async () => {
        const kundId = linkSelect.value;
        if (!kundId) {
          showToast('Välj en kund att koppla etiketten till.', 'error');
          return;
        }
        const ctx = detailContext || {};
        const m = ctx.message || {};
        const kunderChild =
          (m.labels || []).find((l) => l && l.isKunderChild) ||
          (m.labelId ? { id: m.labelId, name: m.labelName } : null);
        if (!kunderChild || !kunderChild.id) {
          showToast('Mejlet saknar en KUNDER-etikett att koppla.', 'error');
          return;
        }
        linkBtn.disabled = true;
        try {
          const payload = {
            labelId: kunderChild.id,
            labelName: kunderChild.name || m.labelName || null,
            kundId,
            messageId: id,
            syncGmailLabel: !!(syncCheck && syncCheck.checked)
          };
          const res = await fetch(`${baseUrl}/api/gmail/label-links`, {
            method: 'PUT',
            ...authOpts(),
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            showToast(data.error || 'Kunde inte spara koppling', 'error');
            return;
          }
          showToast(
            payload.syncGmailLabel
              ? 'Koppling sparad och Gmail-etikett uppdaterad.'
              : 'Koppling sparad i ClientFlow (Gmail oförändrad).',
            'success'
          );
          applyLabelResultToList(id, {
            customerId: data.customerId,
            customerName: data.customerName,
            matchReason: 'link',
            labelId: data.link && data.link.labelId,
            labelName: data.link && data.link.labelName,
            labelLeaf:
              data.link && data.link.labelName
                ? String(data.link.labelName).split('/').pop()
                : undefined
          });
          await loadInbox();
          await openMessage(id);
        } finally {
          linkBtn.disabled = false;
        }
      });
    }

    if (unlinkBtn) {
      unlinkBtn.addEventListener('click', async () => {
        const ctx = detailContext || {};
        const m = ctx.message || {};
        const link = m.labelLink || {};
        const labelId = link.labelId || m.labelId;
        const labelName = link.labelName || m.labelName;
        if (!labelId && !labelName) {
          showToast('Ingen sparad koppling att ta bort.', 'error');
          return;
        }
        if (!confirm('Ta bort kopplingen etikett→kund i ClientFlow?')) return;
        unlinkBtn.disabled = true;
        try {
          const res = await fetch(`${baseUrl}/api/gmail/label-links`, {
            method: 'DELETE',
            ...authOpts(),
            body: JSON.stringify({ labelId, labelName })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            showToast(data.error || 'Kunde inte ta bort koppling', 'error');
            return;
          }
          showToast('Koppling borttagen.', 'success');
          await loadInbox();
          await openMessage(id);
        } finally {
          unlinkBtn.disabled = false;
        }
      });
    }
  }

  async function modifyLabels(id, payload) {
    const res = await fetch(`${baseUrl}/api/gmail/messages/${encodeURIComponent(id)}/labels`, {
      method: 'POST',
      ...authOpts(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      showToast(data.error || 'Kunde inte ändra etiketter', 'error');
      return null;
    }
    showToast('Etiketter uppdaterade i Gmail.', 'success');
    applyLabelResultToList(id, data);
    // Om mejlet förlorade KUNDER-barn kan det försvinna från listan – ladda om.
    const stillHasKunder = (data.labels || []).some((l) => l && l.isKunderChild);
    if (!stillHasKunder) {
      await loadInbox();
      els.detail.innerHTML =
        '<p class="mejl-detail-empty">Mejlet har ingen kundetikett under KUNDER längre och syns eventuellt inte i listan. Uppdatera eller märk det igen i Gmail.</p>';
      return data;
    }
    await openMessage(id);
    return data;
  }

  function renderDetail(id, m, listMeta, kunderLabels) {
    if (Array.isArray(kunderLabels)) kunderLabelsCache = kunderLabels;
    const customerName = String(
      (m && m.customerName) || (listMeta && listMeta.customerName) || ''
    ).trim();
    const sender = fromDisplayName({
      fromName: (listMeta && listMeta.fromName) || null,
      from: m.from
    });
    const title = customerName ? `${customerName} · ${sender}` : sender;
    const bodyHtml = m.html
      ? `<div class="mejl-detail-body html-body">${m.html}</div>`
      : `<div class="mejl-detail-body">${esc(m.text || m.snippet || '')}</div>`;
    const currentKunderId =
      (m.labelId && (m.labels || []).some((l) => l.id === m.labelId && l.isKunderChild) && m.labelId) ||
      ((m.labels || []).find((l) => l.isKunderChild) || {}).id ||
      '';
    const labelsHtml = renderLabelChips(m.labels || [], { removable: true });
    const reason = matchReasonLabel(m.matchReason || (listMeta && listMeta.matchReason));
    const reasonHtml = reason
      ? `<span class="mejl-match-pill ${reason.cls}"><i class="fas fa-link"></i> ${esc(reason.text)}</span>`
      : '';
    const linkedKundId =
      (m.labelLink && m.labelLink.kundId) ||
      (m.matchReason === 'link' ? m.customerId : '') ||
      '';
    const hasLink = !!(m.labelLink && m.labelLink.kundId) || m.matchReason === 'link';
    els.detail.innerHTML = `
      <div class="mejl-item-top">
        <strong class="mejl-detail-title">${esc(title)}</strong>
        <span class="mejl-item-date">${esc(fmtDate(m.internalDate || m.date))}</span>
      </div>
      <div class="mejl-item-subject">${esc(m.subject)}</div>
      <div class="mejl-item-meta">Från: ${esc(m.from)}</div>
      <div class="mejl-item-meta">Till: ${esc(m.to)}</div>
      <div class="mejl-labels-block">
        <div class="mejl-labels-heading">Etiketter</div>
        ${labelsHtml || '<p class="mejl-hint" style="margin:0;">Inga etiketter.</p>'}
        ${reasonHtml}
        <div class="mejl-label-edit">
          <label class="mejl-label-edit-label" for="mejl-label-select">Kundetikett i Gmail (KUNDER/…)</label>
          <div class="mejl-label-edit-row">
            <select id="mejl-label-select" class="form-select form-input mejl-label-select">
              ${kunderOptionsHtml(currentKunderId)}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="mejl-label-apply">
              Sätt etikett
            </button>
          </div>
          <div id="mejl-label-create-wrap" class="mejl-label-create-wrap" hidden>
            <input type="text" id="mejl-label-create" class="form-input" placeholder="Nytt kundnamn, t.ex. Linda Fiore AB">
            <button type="button" class="btn btn-primary btn-sm" id="mejl-label-create-btn">
              Skapa &amp; sätt
            </button>
          </div>
          <p class="mejl-hint">Byter kundetikett i Gmail (övriga KUNDER-barn tas bort från mejlet). Systemetiketter som Inkorg/Skickat behålls.</p>
        </div>
        <div class="mejl-label-link">
          <label class="mejl-label-edit-label" for="mejl-link-customer">Koppla etikett till kund (ClientFlow)</label>
          <p class="mejl-hint" style="margin-top:0;">Rättar fel auto-match utan att ändra Gmail. Sparad koppling väger tyngre än namnmatch.</p>
          <div class="mejl-label-link-row">
            <select id="mejl-link-customer" class="form-select form-input mejl-label-select">
              ${customerOptionsHtml(linkedKundId || m.customerId || '')}
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="mejl-link-apply">
              Koppla etikett till kund
            </button>
            ${
              hasLink
                ? `<button type="button" class="btn btn-secondary btn-sm" id="mejl-link-remove">Ta bort koppling</button>`
                : ''
            }
          </div>
          <label class="mejl-label-link-check">
            <input type="checkbox" id="mejl-link-sync-gmail">
            <span>Uppdatera även Gmail-etikett (byt till KUNDER/kundnamn)</span>
          </label>
        </div>
      </div>
      <div class="mejl-connect-actions" style="margin-top:0.75rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="mejl-reply-btn">
          <i class="fas fa-reply"></i> Svara
        </button>
        <button type="button" class="btn btn-secondary btn-sm btn-danger-outline" id="mejl-trash-btn">
          <i class="fas fa-trash"></i> Radera
        </button>
      </div>
      ${bodyHtml}
    `;
    detailContext = { id, message: m, listMeta };
    bindDetailLabelUi(id);

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
        const cid = m.customerId || (listMeta && listMeta.customerId);
        if (cid) els.customer.value = cid;
        els.body.focus();
      });
    }
    const trashBtn = document.getElementById('mejl-trash-btn');
    if (trashBtn) {
      trashBtn.addEventListener('click', () => trashMessage(id));
    }
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
    const listMeta = messages.find((x) => x.id === id) || {};
    if (Array.isArray(data.kunderLabels)) kunderLabelsCache = data.kunderLabels;
    // Synka listkort med detaljens etiketter/kund
    applyLabelResultToList(id, {
      labelIds: m.labelIds,
      labels: m.labels,
      customerId: m.customerId,
      customerName: m.customerName,
      labelId: m.labelId,
      labelName: m.labelName,
      labelLeaf: m.labelLeaf,
      matchReason: m.matchReason,
      kunderLabels: data.kunderLabels
    });
    // Behåll labelLink från API på listMeta/message för UI
    const listMetaWithLink = {
      ...(messages.find((x) => x.id === id) || {}),
      labelLink: m.labelLink || null
    };
    const idx = messages.findIndex((x) => x.id === id);
    if (idx >= 0) messages[idx] = { ...messages[idx], labelLink: m.labelLink || null };
    renderDetail(id, { ...m, labelLink: m.labelLink || null }, listMetaWithLink, data.kunderLabels);
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
    folder = 'sent';
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

  function onFolderClick(next) {
    if (folder === next) return;
    folder = next;
    loadInbox();
  }
  if (els.folderInbox) els.folderInbox.addEventListener('click', () => onFolderClick('inbox'));
  if (els.folderSent) els.folderSent.addEventListener('click', () => onFolderClick('sent'));

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
