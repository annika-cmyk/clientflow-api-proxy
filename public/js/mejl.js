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


  function kundkortUrl(customerId) {
    const id = String(customerId || '').trim();
    return id ? `kundkort.html?id=${encodeURIComponent(id)}` : '';
  }

  function kundkortLinkHtml(customerId, { compact } = {}) {
    // Bakåtkompat: knappen används inte längre i listan/detaljrubrik.
    const href = kundkortUrl(customerId);
    if (!href) return '';
    if (compact) {
      return `<a class="mejl-kundkort-link" href="${esc(href)}" title="Öppna kundkort" data-kundkort-link="1"><i class="fas fa-id-card" aria-hidden="true"></i><span>Öppna kundkort</span></a>`;
    }
    return `<a class="btn btn-secondary btn-sm mejl-kundkort-btn" href="${esc(href)}" data-kundkort-link="1"><i class="fas fa-id-card" aria-hidden="true"></i> Öppna kundkort</a>`;
  }

  function customerNameLinkHtml(customerId, customerName, { detail } = {}) {
    const name = String(customerName || '').trim() || 'Okänd kund';
    const href = kundkortUrl(customerId);
    if (!href) {
      return detail
        ? `<strong class="mejl-detail-title">${esc(name)}</strong>`
        : `<span class="mejl-item-customer">${esc(name)}</span>`;
    }
    if (detail) {
      return `<a class="mejl-detail-customer-link mejl-detail-title" href="${esc(href)}" title="Öppna kundkort" data-kundkort-link="1"><strong>${esc(name)}</strong></a>`;
    }
    return `<a class="mejl-item-customer-link" href="${esc(href)}" title="Öppna kundkort" data-kundkort-link="1">${esc(name)}</a>`;
  }

  function resolveMessageCustomerId(m, listMeta) {
    return (
      String((m && m.customerId) || '').trim() ||
      String((listMeta && listMeta.customerId) || '').trim() ||
      String((m && m.labelLink && m.labelLink.kundId) || '').trim() ||
      String((listMeta && listMeta.labelLink && listMeta.labelLink.kundId) || '').trim() ||
      ''
    );
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
    folderOpen: document.getElementById('mejl-folder-open'),
    folderSent: document.getElementById('mejl-folder-sent'),
    folderShared: document.getElementById('mejl-folder-shared'),
    syncStatus: document.getElementById('mejl-sync-status'),
    protectedBody: document.getElementById('mejl-protected-body'),
    protectedWrap: document.getElementById('mejl-protected-wrap'),
    markBankid: document.getElementById('mejl-mark-bankid'),
    toggleProtected: document.getElementById('mejl-toggle-protected'),
    attachments: document.getElementById('mejl-attachments'),
    attachList: document.getElementById('mejl-attach-list'),
    qList: document.getElementById('mejl-q-list'),
    qAdd: document.getElementById('mejl-q-add'),
    qTarget: document.getElementById('mejl-q-target'),
    qRunWrap: document.getElementById('mejl-q-run-wrap'),
    qRunId: document.getElementById('mejl-q-run-id'),
    tabInbox: document.getElementById('mejl-tab-inbox'),
    tabSettings: document.getElementById('mejl-tab-settings'),
    panelInbox: document.getElementById('mejl-panel-inbox'),
    panelSettings: document.getElementById('mejl-panel-settings'),
    sigPreview: document.getElementById('mejl-sig-preview'),
    sigSave: document.getElementById('mejl-sig-save'),
    sigStatus: document.getElementById('mejl-sig-status'),
    sigLayouts: document.getElementById('mejl-sig-layouts')
  };

  let status = null;
  let customers = [];
  let messages = [];
  let sharedMessages = [];
  let activeId = null;
  let folder = 'inbox';
  let kunderLabelsCache = [];
  let detailContext = null;
  let pendingFiles = [];
  let sigLayout = 'text-left-portrait-right';
  let sigImage1DataUrl = '';
  let sigImage2DataUrl = '';
  let connectInFlight = false;
  const archiveApi = (window.MejlArchive && MejlArchive.createApi)
    ? MejlArchive.createApi({ baseUrl, authOpts, showToast })
    : null;
  const handleStatusApi = (window.MejlHandleStatus && MejlHandleStatus.createApi)
    ? MejlHandleStatus.createApi()
    : null;
  const hiddenMessagesApi = (window.MejlHidden && MejlHidden.createApi)
    ? MejlHidden.createApi()
    : null;

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
    try {
      const res = await fetch(`${baseUrl}/api/gmail/status`, authOpts());
      const data = await res.json().catch(() => ({}));
      status = data && typeof data === 'object' ? data : { success: false };
      return status;
    } catch (err) {
      status = { success: false, error: (err && err.message) || 'Kunde inte hämta Gmail-status' };
      return status;
    }
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
    if (els.folderOpen) els.folderOpen.classList.toggle('is-active', folder === 'open');
    if (els.folderSent) els.folderSent.classList.toggle('is-active', folder === 'sent');
    if (els.folderShared) {
      els.folderShared.classList.toggle('is-active', folder === 'shared');
      const count = sharedMessages.length;
      els.folderShared.innerHTML =
        'Delat med mig' +
        (count ? `<span class="mejl-folder-count">(${count})</span>` : '');
    }
  }

  function resetConnectButton() {
    if (!els.connectBtn) return;
    connectInFlight = false;
    els.connectBtn.innerHTML = '<i class="fab fa-google"></i> Koppla Gmail';
  }

  function renderStatus() {
    if (!status || !status.success) {
      els.connectText.textContent = 'Kunde inte hämta Gmail-status.';
      setConnectEnabled(false, 'Kunde inte hämta Gmail-status');
      resetConnectButton();
      // Visa ändå delade mejl om de finns
      const showShared = sharedMessages.length > 0;
      els.main.hidden = !showShared;
      els.toolbar.hidden = !showShared;
      if (showShared && folder !== 'shared') {
        folder = 'shared';
        setFolderUi();
      }
      return;
    }
    if (!status.configured) {
      els.statusPill.textContent = 'Ej konfigurerad';
      els.statusPill.classList.add('is-off');
      els.connectText.textContent = status.redirectHint || missingEnvMessage(status);
      els.connectBtn.hidden = false;
      resetConnectButton();
      setConnectEnabled(false, missingEnvMessage(status));
      els.disconnectBtn.hidden = true;
      els.refreshBtn.hidden = true;
      els.composeToggle.hidden = true;
      const showShared = sharedMessages.length > 0;
      els.toolbar.hidden = !showShared;
      els.main.hidden = !showShared;
      if (showShared) {
        folder = 'shared';
        setFolderUi();
        els.connectText.textContent =
          (els.connectText.textContent || '') +
          (sharedMessages.length
            ? ' Delade mejl visas under «Delat med mig» utan Gmail.'
            : '');
      }
      return;
    }
    if (status.connected) {
      els.statusPill.textContent = status.email ? `Kopplad: ${status.email}` : 'Kopplad';
      els.statusPill.classList.remove('is-off');
      els.connectText.textContent = '';
      els.connectBtn.hidden = true;
      resetConnectButton();
      els.disconnectBtn.hidden = false;
      els.refreshBtn.hidden = false;
      els.composeToggle.hidden = false;
      els.toolbar.hidden = false;
      els.main.hidden = false;
    } else {
      els.statusPill.textContent = 'Ej kopplad';
      els.statusPill.classList.add('is-off');
      const sharedHint = sharedMessages.length
        ? ` ${sharedMessages.length} ${sharedMessages.length === 1 ? 'delat mejl' : 'delade mejl'} visas under «Delat med mig» — Gmail behövs inte för dem.`
        : '';
      els.connectText.textContent =
        'Koppla Gmail för att läsa kundmejl under KUNDER och skicka som dig själv.' + sharedHint;
      els.connectBtn.hidden = false;
      if (!connectInFlight) resetConnectButton();
      setConnectEnabled(true);
      els.disconnectBtn.hidden = true;
      els.refreshBtn.hidden = true;
      els.composeToggle.hidden = true;
      // Visa listan även utan Gmail så delade mejl syns
      els.toolbar.hidden = false;
      els.main.hidden = false;
      if (folder === 'inbox' || folder === 'sent') {
        folder = 'shared';
      }
    }
    setFolderUi();
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

  function sharedListId(archiveId) {
    return 'shared:' + String(archiveId || '').trim();
  }

  function isSharedListId(id) {
    return String(id || '').startsWith('shared:');
  }

  function archiveIdFromListId(id) {
    return String(id || '').replace(/^shared:/, '').trim();
  }

  function archiveToListItem(archive) {
    const cid = String((archive && archive.customerId) || '').trim();
    const fromCustomers = customers.find((c) => c.id === cid);
    return {
      id: sharedListId(archive.id),
      archiveId: archive.id,
      gmailMessageId: archive.gmailMessageId || '',
      source: 'shared',
      subject: archive.subject || '(Inget ämne)',
      from: archive.from || '',
      to: archive.to || '',
      snippet: archive.snippet || '',
      date: archive.date || '',
      customerId: cid,
      customerName:
        String(archive.customerName || '').trim() ||
        (fromCustomers && fromCustomers.namn) ||
        '',
      threadId: archive.threadId || '',
      visibility: archive.visibility || 'byra',
      bodyText: archive.bodyText || '',
      bodyHtml: archive.bodyHtml || '',
      masked: !!archive.masked,
      attachmentMeta: archive.attachmentMeta || [],
      savedTo: archive.savedTo || [],
      isOwner: !!archive.isOwner
    };
  }

  function isUnderlagRecipient(m) {
    const headers = [m && m.to, m && m.cc, m && m.deliveredTo].filter(Boolean).join(' ');
    return /(?:^|[\s,<])underlag@/i.test(String(headers || ''));
  }

  function isClientHidden(m) {
    if (!m || !m.id) return false;
    if (isUnderlagRecipient(m)) return true;
    if (hiddenMessagesApi && hiddenMessagesApi.isHidden(m.id)) return true;
    return false;
  }

  function isUnhandled(m) {
    if (!m || !m.id) return true;
    if (!handleStatusApi) return true;
    return handleStatusApi.get(m.id) !== 'handled';
  }

  function displayedMessages() {
    if (folder === 'shared') {
      return (sharedMessages || []).filter((m) => !isClientHidden(m));
    }
    let list = (messages || []).filter((m) => !isClientHidden(m));
    if (folder === 'open') {
      list = list.filter((m) => isUnhandled(m) && !isSharedListId(m.id));
    }
    return list;
  }

  function renderList(extraHtml) {
    const list = displayedMessages();
    if (!list.length) {
      let empty = 'Inga mejl hittades under etiketten KUNDER.';
      if (folder === 'sent') empty = 'Inga skickade mejl under etiketten KUNDER.';
      if (folder === 'open') empty = 'Inga öppna (ohanerade) mejl just nu.';
      if (folder === 'shared') {
        empty =
          status && status.connected
            ? 'Inga mejl har delats med dig ännu.'
            : 'Inga mejl har delats med dig ännu. När en kollega delar ett mejl visas det här — även utan att du kopplat Gmail.';
      } else if (!(status && status.connected) && folder !== 'shared') {
        empty = 'Koppla Gmail för att se inkorg under KUNDER, eller öppna «Delat med mig».';
      }
      els.list.innerHTML = `<p class="mejl-hint">${empty}</p>${extraHtml || ''}`;
      return;
    }
    els.list.innerHTML =
      list
        .map((m) => {
          const customer = String(m.customerName || '').trim() || 'Okänd kund';
          const cid = resolveMessageCustomerId(m);
          const customerLink = customerNameLinkHtml(cid, customer);
          const sender = fromDisplayName(m);
          const handleCls =
            handleStatusApi && !isSharedListId(m.id)
              ? handleStatusApi.listItemClass(handleStatusApi.get(m.id))
              : '';
          const handleClass = handleCls ? ` ${handleCls}` : '';
          const sharedBadge =
            m.source === 'shared' || folder === 'shared'
              ? `<span class="mejl-item-shared-badge"><i class="fas fa-share-alt" aria-hidden="true"></i> Delat med dig</span>`
              : '';
          const menuHtml = isSharedListId(m.id)
            ? ''
            : `<div class="mejl-item-menu">
            <button type="button" class="mejl-item-menu-btn" data-mejl-menu-toggle aria-label="Fler alternativ" aria-haspopup="true" aria-expanded="false" title="Fler alternativ">
              <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
            </button>
            <div class="mejl-item-menu-panel" role="menu" hidden>
              <button type="button" class="mejl-item-menu-item" role="menuitem" data-mejl-menu-action="todo">
                <i class="fas fa-exclamation-circle" aria-hidden="true"></i> Att hantera
              </button>
              <button type="button" class="mejl-item-menu-item" role="menuitem" data-mejl-menu-action="handled">
                <i class="fas fa-check" aria-hidden="true"></i> Hanterat
              </button>
              <button type="button" class="mejl-item-menu-item" role="menuitem" data-mejl-menu-action="koppla">
                <i class="fas fa-link" aria-hidden="true"></i> Koppla till uppdrag / skapa uppgift
              </button>
              <button type="button" class="mejl-item-menu-item is-danger" role="menuitem" data-mejl-menu-action="radera">
                <i class="fas fa-eye-slash" aria-hidden="true"></i> Radera
              </button>
            </div>
          </div>`;
          return `
      <div class="mejl-item${m.id === activeId ? ' is-active' : ''}${handleClass}" data-id="${esc(m.id)}" role="button" tabindex="0">
        <div class="mejl-item-top">
          <div class="mejl-item-customer-row">
            ${customerLink}
          </div>
          <div class="mejl-item-top-right">
            <span class="mejl-item-date">${esc(fmtDate(m.internalDate || m.date))}</span>
            ${menuHtml}
          </div>
        </div>
        <div class="mejl-item-from">${esc(sender)}</div>
        <div class="mejl-item-subject">${esc(m.subject)}</div>
        ${sharedBadge}
        <div class="mejl-item-snippet">${esc(m.snippet || '')}</div>
      </div>
    `;
        })
        .join('') + (extraHtml || '');
  }

  async function loadSharedWithMe() {
    try {
      const res = await fetch(`${baseUrl}/api/gmail/archive/shared-with-me`, authOpts());
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        sharedMessages = [];
        return [];
      }
      const filterId = els.filter && els.filter.value ? els.filter.value : '';
      sharedMessages = (data.archives || [])
        .map(archiveToListItem)
        .filter((m) => !filterId || m.customerId === filterId);
      return sharedMessages;
    } catch (_) {
      sharedMessages = [];
      return [];
    }
  }

  async function setSyncStatus(text) {
    if (!els.syncStatus) return;
    if (!text) {
      els.syncStatus.hidden = true;
      els.syncStatus.innerHTML = '';
      return;
    }
    els.syncStatus.hidden = false;
    els.syncStatus.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${esc(text)}`;
  }

  function applyInboxData(data) {
    messages = data.messages || [];
    const unmatchedHtml = renderUnmatchedHint(data.unmatchedLabels);
    if (data.note && !messages.length) {
      els.list.innerHTML = `<p class="mejl-hint">${esc(data.note)}</p>${unmatchedHtml}`;
      return;
    }
    renderList(unmatchedHtml);
  }

  function inboxErrorNeedsReconnect(res, data) {
    const code = (data && data.code) || '';
    if (
      code === 'GMAIL_NOT_CONNECTED' ||
      code === 'GMAIL_REAUTH_REQUIRED' ||
      code === 'GMAIL_INSUFFICIENT_SCOPE'
    ) {
      return true;
    }
    return !!(res && (res.status === 401 || res.status === 403));
  }

  function markGmailNeedsReconnect(message) {
    if (status && typeof status === 'object') {
      status.connected = false;
      status.email = '';
    }
    try {
      renderStatus();
      setConnectEnabled(!!(status && status.configured), message || 'Koppla Gmail igen');
      if (els.connectBtn) els.connectBtn.hidden = false;
      if (els.disconnectBtn) els.disconnectBtn.hidden = true;
    } catch (_) {
      /* ignore UI update errors */
    }
  }

  function showInboxFailure(message, opts) {
    const options = opts || {};
    const text = message || 'Kunde inte hämta mejl';
    els.main.hidden = false;
    els.toolbar.hidden = false;
    if (!messages.length) {
      const reconnectHint = options.reconnect
        ? ' Koppla Gmail igen ovanför, eller öppna «Delat med mig».'
        : '';
      els.list.innerHTML = `<p class="mejl-hint">${esc(text)}${esc(reconnectHint)}</p>`;
    } else {
      showToast(text, 'error');
    }
  }

  async function fetchInbox(mode) {
    const customerId = els.filter.value || '';
    const params = new URLSearchParams();
    params.set('folder', folder === 'open' ? 'inbox' : folder);
    params.set('mode', mode || 'sync');
    if (customerId) params.set('customerId', customerId);
    const res = await fetch(`${baseUrl}/api/gmail/inbox?${params}`, authOpts());
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  /**
   * Visa cachad lista direkt, synka sedan inkrementellt utan att tömma listan.
   * opts.full = true → tvinga full sync (Shift+Uppdatera).
   */
  async function loadInbox(opts) {
    const options = opts || {};
    setFolderUi();

    if (folder === 'shared') {
      els.list.innerHTML =
        '<p class="mejl-hint"><i class="fas fa-spinner fa-spin"></i> Hämtar delade mejl…</p>';
      if (!options.preserveDetail) {
        els.detail.innerHTML = '<p class="mejl-detail-empty">Välj ett mejl till vänster.</p>';
        activeId = null;
      }
      try {
        await loadSharedWithMe();
        renderList();
      } catch (err) {
        els.list.innerHTML = `<p class="mejl-hint">${esc(
          (err && err.message) || 'Kunde inte hämta delade mejl'
        )}</p>`;
      }
      setFolderUi();
      return;
    }

    if (!(status && status.connected)) {
      els.list.innerHTML =
        '<p class="mejl-hint">Koppla Gmail för att se inkorg under KUNDER. Delade mejl finns under «Delat med mig».</p>';
      return;
    }

    const hadMessages = messages.length > 0;
    const preserveDetail = options.preserveDetail === true && activeId;

    if (!hadMessages) {
      els.list.innerHTML =
        '<p class="mejl-hint"><i class="fas fa-spinner fa-spin"></i> Hämtar mejl från Gmail…</p>';
      if (!preserveDetail) {
        els.detail.innerHTML = '<p class="mejl-detail-empty">Välj ett mejl till vänster.</p>';
        activeId = null;
      }
    }

    if (!options.full && !options.skipCache) {
      try {
        const { res, data } = await fetchInbox('cache');
        if (res.ok && data.success && (data.messages || []).length) {
          applyInboxData(data);
          setSyncStatus('Söker efter nya…');
        } else if (!hadMessages) {
          setSyncStatus('Hämtar mejl från Gmail…');
        } else {
          setSyncStatus('Söker efter nya…');
        }
      } catch (_) {
        if (!hadMessages) setSyncStatus('Hämtar mejl från Gmail…');
      }
    } else {
      setSyncStatus(options.full ? 'Full synkning…' : 'Söker efter nya…');
    }

    try {
      const { res, data } = await fetchInbox(options.full ? 'full' : 'sync');
      setSyncStatus('');
      if (!res.ok || !data.success) {
        const reconnect = inboxErrorNeedsReconnect(res, data);
        if (reconnect) markGmailNeedsReconnect(data.error);
        showInboxFailure(data.error || (reconnect ? 'Gmail behöver kopplas igen.' : 'Kunde inte hämta mejl'), {
          reconnect
        });
        return;
      }
      const prevActive = activeId;
      applyInboxData(data);
      if (preserveDetail && prevActive && messages.some((m) => m.id === prevActive)) {
        activeId = prevActive;
        renderList(renderUnmatchedHint(data.unmatchedLabels));
      }
    } catch (err) {
      setSyncStatus('');
      showInboxFailure((err && err.message) || 'Kunde inte hämta mejl');
    }
  }

  async function trashMessage(id) {
    if (
      !confirm(
        'Ta bort mejlet från ClientFlow-listan?\n\nDet raderas inte i Gmail — du ser det kvar där.'
      )
    ) {
      return;
    }
    if (hiddenMessagesApi) {
      hiddenMessagesApi.hide(id);
    } else {
      showToast('Kunde inte dölja mejlet lokalt.', 'error');
      return;
    }
    showToast('Mejlet togs bort från listan (finns kvar i Gmail).', 'success');
    activeId = null;
    els.detail.innerHTML = '<p class="mejl-detail-empty">Välj ett mejl till vänster.</p>';
    renderList();
  }

  function closeAllMejlItemMenus() {
    document.querySelectorAll('.mejl-item-menu.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
      const panel = menu.querySelector('.mejl-item-menu-panel');
      if (panel) panel.hidden = true;
      const toggle = menu.querySelector('[data-mejl-menu-toggle]');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    });
  }

  function findListMessage(id) {
    return (
      (messages || []).find((m) => m.id === id) ||
      (sharedMessages || []).find((m) => m.id === id) ||
      null
    );
  }

  async function handleMejlItemMenuAction(id, action) {
    if (isSharedListId(id)) return;
    if (action === 'todo' || action === 'handled') {
      if (!handleStatusApi) {
        showToast('Kunde inte uppdatera status.', 'error');
        return;
      }
      const status = action === 'handled' ? 'handled' : 'todo';
      handleStatusApi.set(id, status);
      renderList();
      if (activeId === id && detailContext && detailContext.message) {
        renderDetail(id, detailContext.message, detailContext.listMeta, kunderLabelsCache, null);
      }
      showToast(status === 'handled' ? 'Markerat som hanterat.' : 'Markerat som att hantera.', 'success');
      return;
    }
    if (action === 'radera') {
      await trashMessage(id);
      return;
    }
    if (action === 'koppla') {
      const listMsg = findListMessage(id);
      const cid = resolveMessageCustomerId(listMsg || {});
      if (!cid) {
        showToast('Koppla mejlet till en kund först (via kundetikett).', 'error');
        await openMessage(id);
        return;
      }
      await openMessage(id);
      const msg =
        (detailContext && detailContext.message) || listMsg || { id, attachments: [] };
      if (archiveApi && typeof archiveApi.openSaveWizard === 'function') {
        await archiveApi.openSaveWizard(id, msg, cid, () => openMessage(id));
      } else {
        const saveBtn = document.getElementById('mejl-save-btn');
        if (saveBtn && !saveBtn.disabled) saveBtn.click();
        else showToast('Kunde inte öppna koppla-dialogen.', 'error');
      }
    }
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

  const LABELS_PANEL_STORAGE_KEY = 'mejl-labels-panel-open';

  function isLabelsPanelOpen() {
    try {
      return sessionStorage.getItem(LABELS_PANEL_STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function setLabelsPanelOpen(open) {
    try {
      sessionStorage.setItem(LABELS_PANEL_STORAGE_KEY, open ? '1' : '0');
    } catch (_) {
      /* ignore */
    }
  }

  function applyLabelsPanelState(open) {
    const panel = document.getElementById('mejl-labels-panel');
    const toggle = document.getElementById('mejl-labels-toggle');
    if (panel) panel.hidden = !open;
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.classList.toggle('is-open', !!open);
    }
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
    const labelsToggle = document.getElementById('mejl-labels-toggle');

    if (labelsToggle) {
      labelsToggle.addEventListener('click', () => {
        const next = !isLabelsPanelOpen();
        setLabelsPanelOpen(next);
        applyLabelsPanelState(next);
      });
    }

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

  function renderDetail(id, m, listMeta, kunderLabels, archiveForDetail) {
    if (Array.isArray(kunderLabels)) kunderLabelsCache = kunderLabels;
    const isShared = isSharedListId(id) || (m && m.source === 'shared');
    const customerIdForArchive =
      (m && m.customerId) || (listMeta && listMeta.customerId) || '';
    const archiveVisibility =
      (archiveForDetail && archiveForDetail.visibility) ||
      (m && m.visibility) ||
      'byra';
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
    const labelsHtml = renderLabelChips(m.labels || [], { removable: !isShared });
    const reason = matchReasonLabel(m.matchReason || (listMeta && listMeta.matchReason));
    const reasonHtml = reason
      ? `<span class="mejl-match-pill ${reason.cls}"><i class="fas fa-link"></i> ${esc(reason.text)}</span>`
      : '';
    const detailCustomerId = resolveMessageCustomerId(m, listMeta);
    const linkedKundId =
      (m.labelLink && m.labelLink.kundId) ||
      (m.matchReason === 'link' ? m.customerId : '') ||
      '';
    const hasLink = !!(m.labelLink && m.labelLink.kundId) || m.matchReason === 'link';
    const customerTitleHtml = customerNameLinkHtml(detailCustomerId, customerName || title, { detail: true });
    const labelsOpen = isLabelsPanelOpen();
    const labelsToggleHtml = isShared
      ? ''
      : `<button type="button" class="mejl-labels-toggle${labelsOpen ? ' is-open' : ''}" id="mejl-labels-toggle" aria-expanded="${labelsOpen ? 'true' : 'false'}" aria-controls="mejl-labels-panel" title="Etiketter" aria-label="Etiketter"><i class="fas fa-tag" aria-hidden="true"></i></button>`;
    const gmailActionsHtml = isShared
      ? `<p class="mejl-hint" style="margin-top:0.75rem;">Detta mejl delades med dig via ClientFlow. Svara/radera och Gmail-etiketter kräver att du kopplar din egen Gmail.</p>`
      : `<div class="mejl-connect-actions" style="margin-top:0.75rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="mejl-reply-btn">
          <i class="fas fa-reply"></i> Svara
        </button>
        <button type="button" class="btn btn-secondary btn-sm btn-danger-outline" id="mejl-trash-btn" title="Tas bort från ClientFlow, inte från Gmail">
          <i class="fas fa-eye-slash"></i> Ta bort från listan
        </button>
      </div>`;
    const labelsBlockHtml = isShared
      ? `<p class="mejl-item-shared-badge" style="margin:0.5rem 0;"><i class="fas fa-share-alt" aria-hidden="true"></i> Delat med dig</p>`
      : `<div class="mejl-labels-block" id="mejl-labels-panel"${labelsOpen ? '' : ' hidden'}>
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
      </div>`;
    const gmailMessageIdForArchive = isShared
      ? m.gmailMessageId || (archiveForDetail && archiveForDetail.gmailMessageId) || ''
      : id;
    els.detail.innerHTML = `
      <div class="mejl-item-top">
        <div class="mejl-detail-title-row">
          ${customerTitleHtml}
          ${labelsToggleHtml}
        </div>
        <span class="mejl-item-date">${esc(fmtDate(m.internalDate || m.date))}</span>
      </div>
      <div class="mejl-item-subject">${esc(m.subject)}</div>
      <div class="mejl-item-meta">Från: ${esc(m.from)}</div>
      <div class="mejl-item-meta">Till: ${esc(m.to)}</div>
      ${labelsBlockHtml}
      ${gmailActionsHtml}
      ${
        !isShared && handleStatusApi
          ? handleStatusApi.toolbarHtml(handleStatusApi.get(id))
          : ''
      }
      ${
        !isShared && archiveApi && customerIdForArchive && gmailMessageIdForArchive
          ? archiveApi.toolbarHtml(customerIdForArchive, archiveVisibility)
          : ''
      }
      ${archiveApi ? archiveApi.archiveMetaHtml(archiveForDetail, { attachments: m.attachments }) : ''}
      ${!isShared && archiveApi ? archiveApi.attachmentsHtml(m.attachments, archiveForDetail) : ''}
      ${isShared ? '' : '<p class="mejl-mask-hint">Markera text i brödtexten och klicka Maska markering.</p>'}
      ${bodyHtml}
    `;
    detailContext = { id, message: m, listMeta, isShared };
    if (!isShared) bindDetailLabelUi(id);

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
        const cid = resolveMessageCustomerId(m, listMeta);
        if (cid) els.customer.value = cid;
        els.body.focus();
      });
    }
    const trashBtn = document.getElementById('mejl-trash-btn');
    if (trashBtn) {
      trashBtn.addEventListener('click', () => trashMessage(id));
    }
    if (!isShared && handleStatusApi) {
      handleStatusApi.bindDetailButtons({
        id,
        onChange: () => {
          renderList();
          renderDetail(id, m, listMeta, kunderLabelsCache, archiveForDetail);
        }
      });
    }
    if (!isShared && archiveApi && customerIdForArchive && gmailMessageIdForArchive) {
      archiveApi.bindDetailButtons({
        id: gmailMessageIdForArchive,
        message: m,
        customerId: customerIdForArchive,
        plainText: m.text || m.snippet || '',
        html: m.html || '',
        onRefresh: () => openMessage(id)
      });
    } else if (!isShared && archiveApi && gmailMessageIdForArchive) {
      archiveApi.bindAttachmentActions(gmailMessageIdForArchive, m.attachments);
    }
  }

  async function openSharedMessage(listId) {
    activeId = listId;
    renderList();
    els.detail.innerHTML = '<p class="mejl-detail-empty"><i class="fas fa-spinner fa-spin"></i> Laddar…</p>';
    const archiveId = archiveIdFromListId(listId);
    const res = await fetch(
      `${baseUrl}/api/gmail/archive/${encodeURIComponent(archiveId)}`,
      authOpts()
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success || !data.archive) {
      els.detail.innerHTML = `<p class="mejl-detail-empty">${esc(data.error || 'Kunde inte öppna det delade mejlet')}</p>`;
      return;
    }
    const archive = data.archive;
    const listMeta = sharedMessages.find((x) => x.id === listId) || archiveToListItem(archive);
    const idx = sharedMessages.findIndex((x) => x.id === listId);
    const item = archiveToListItem(archive);
    if (idx >= 0) sharedMessages[idx] = { ...sharedMessages[idx], ...item };
    else sharedMessages.unshift(item);
    const m = {
      source: 'shared',
      archiveId: archive.id,
      gmailMessageId: archive.gmailMessageId,
      subject: archive.subject,
      from: archive.from,
      to: archive.to,
      date: archive.date,
      snippet: archive.snippet,
      text: archive.bodyText || '',
      html: archive.bodyHtml || '',
      customerId: archive.customerId,
      customerName: listMeta.customerName || archive.customerName || '',
      threadId: archive.threadId,
      visibility: archive.visibility,
      attachments: Array.isArray(archive.attachmentMeta) ? archive.attachmentMeta : []
    };
    renderDetail(listId, m, listMeta, null, archive);
  }

  async function openMessage(id) {
    if (isSharedListId(id)) {
      await openSharedMessage(id);
      return;
    }
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
    let archiveForDetail = null;
    const cid =
      m.customerId ||
      listMetaWithLink.customerId ||
      (typeof resolveMessageCustomerId === 'function'
        ? resolveMessageCustomerId(m, listMetaWithLink)
        : '');
    if (archiveApi && cid) {
      archiveForDetail = await archiveApi.fetchArchive(id, cid);
    }
    renderDetail(id, { ...m, labelLink: m.labelLink || null }, listMetaWithLink, data.kunderLabels, archiveForDetail);
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => reject(new Error('Kunde inte läsa fil'));
      reader.readAsDataURL(file);
    });
  }
  function renderAttachList() {
    if (!els.attachList) return;
    if (!pendingFiles.length) { els.attachList.innerHTML = ''; return; }
    els.attachList.innerHTML = pendingFiles.map((f, i) =>
      `<div class="mejl-attach-row">
        <span class="mejl-attach-name">${esc(f.name)}</span>
        <div class="mejl-attach-row-actions">
          <label class="mejl-attach-bankid-badge ${f.bankId ? 'is-bankid' : 'is-open'}" title="Växla BankID-skydd">
            <input type="checkbox" class="visually-hidden" data-attach-bankid="${i}" ${f.bankId ? 'checked' : ''}>
            ${f.bankId ? '<i class="fas fa-lock" aria-hidden="true"></i> BankID' : 'Öppen bilaga'}
          </label>
          <button type="button" class="mejl-attach-remove" data-attach-remove="${i}">Ta bort</button>
        </div>
      </div>`
    ).join('');
  }
  function addQuestionRow(prefill) {
    if (!els.qList) return;
    const row = document.createElement('div');
    row.className = 'mejl-q-row';
    row.innerHTML = `<input type="text" class="form-input mejl-q-text" placeholder="Fråga / underlag" style="flex:1 1 12rem;" value="${esc((prefill && prefill.text) || '')}">
      <label><input type="checkbox" class="mejl-q-file" ${(prefill && prefill.fileRequired) ? 'checked' : ''}> Fil</label>
      <label><input type="checkbox" class="mejl-q-bankid" ${(prefill && prefill.requiresBankId) ? 'checked' : ''}> BankID</label>
      <button type="button" class="btn btn-secondary btn-sm mejl-q-remove">×</button>`;
    els.qList.appendChild(row);
  }
  function collectQuestions() {
    if (!els.qList) return [];
    return Array.from(els.qList.querySelectorAll('.mejl-q-row')).map((row) => ({
      text: String((row.querySelector('.mejl-q-text') || {}).value || '').trim(),
      fileRequired: !!(row.querySelector('.mejl-q-file') || {}).checked,
      requiresBankId: !!(row.querySelector('.mejl-q-bankid') || {}).checked
    })).filter((q) => q.text);
  }
  function encodeQuestionsTitle(items) {
    if (!items.length) return '';
    if (items.length === 1) {
      const it = items[0];
      return `${it.requiresBankId ? '[bankid] ' : ''}${it.text}${it.fileRequired ? ' [fil obligatorisk]' : ''}`;
    }
    return items.map((it, i) => `${i + 1}. ${it.requiresBankId ? '[bankid] ' : ''}${it.text}${it.fileRequired ? ' [fil obligatorisk]' : ''}`).join('\n');
  }
  function collectSignatureSettings() {
    return {
      layout: sigLayout,
      name: (document.getElementById('mejl-sig-name') || {}).value || '',
      title: (document.getElementById('mejl-sig-title') || {}).value || '',
      phone: (document.getElementById('mejl-sig-phone') || {}).value || '',
      email: (document.getElementById('mejl-sig-email') || {}).value || '',
      address: (document.getElementById('mejl-sig-address') || {}).value || '',
      website: (document.getElementById('mejl-sig-website') || {}).value || '',
      freeText: (document.getElementById('mejl-sig-freetext') || {}).value || '',
      disclaimer: (document.getElementById('mejl-sig-disclaimer') || {}).value || '',
      image1Url: (document.getElementById('mejl-sig-img1-url') || {}).value || '',
      image2Url: (document.getElementById('mejl-sig-img2-url') || {}).value || '',
      image1DataUrl: sigImage1DataUrl || '',
      image2DataUrl: sigImage2DataUrl || ''
    };
  }
  function fillSignatureForm(settings) {
    const conf = settings || {};
    sigLayout = conf.layout || 'text-left-portrait-right';
    sigImage1DataUrl = conf.image1DataUrl || '';
    sigImage2DataUrl = conf.image2DataUrl || '';
    const map = {'mejl-sig-name':conf.name,'mejl-sig-title':conf.title,'mejl-sig-phone':conf.phone,'mejl-sig-email':conf.email,'mejl-sig-address':conf.address,'mejl-sig-website':conf.website,'mejl-sig-freetext':conf.freeText,'mejl-sig-disclaimer':conf.disclaimer,'mejl-sig-img1-url':conf.image1Url,'mejl-sig-img2-url':conf.image2Url};
    Object.entries(map).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val || ''; });
    if (els.sigLayouts) els.sigLayouts.querySelectorAll('.mejl-layout-card').forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-layout') === sigLayout));
  }
  async function refreshSignaturePreview() {
    if (!els.sigPreview) return;
    const res = await fetch(`${baseUrl}/api/mejl/signature/preview`, { method:'POST', ...authOpts(), body: JSON.stringify({ settings: collectSignatureSettings() }) });
    const data = await res.json().catch(() => ({}));
    els.sigPreview.innerHTML = data.previewHtml || '<p class="mejl-hint">Ingen sidfot ännu.</p>';
  }
  async function loadSignatureSettings() {
    if (!els.panelSettings) return;
    const res = await fetch(`${baseUrl}/api/mejl/signature`, authOpts());
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.settings) { fillSignatureForm(data.settings); if (data.previewHtml && els.sigPreview) els.sigPreview.innerHTML = data.previewHtml; else await refreshSignaturePreview(); }
  }
  function showMejlPanel(name) {
    const isSettings = name === 'settings';
    if (els.panelInbox) els.panelInbox.hidden = isSettings;
    if (els.panelSettings) els.panelSettings.hidden = !isSettings;
    if (els.tabInbox) els.tabInbox.classList.toggle('is-active', !isSettings);
    if (els.tabSettings) els.tabSettings.classList.toggle('is-active', isSettings);
    if (isSettings) loadSignatureSettings().catch(() => {});
  }


  async function sendMail() {
    els.sendStatus.textContent = 'Förbereder…';
    try {
      const publicText = els.body.value;
      const protectedText = (els.protectedBody && els.protectedBody.value) || '';
      const protectedFiles = [];
      for (const f of pendingFiles) {
        if (!f.bankId) continue;
        protectedFiles.push({ name: f.name, mimeType: f.file.type || 'application/octet-stream', contentBase64: await readFileAsBase64(f.file) });
      }
      let samarbeteUrl = '';
      let samarbeteTitle = '';
      const questions = collectQuestions();
      if (questions.length) {
        const customerId = els.customer.value;
        if (!customerId) { els.sendStatus.textContent = 'Välj kund för att skicka frågor / underlag.'; return; }
        const c = customers.find((x) => x.id === customerId);
        samarbeteTitle = encodeQuestionsTitle(questions);
        const body = {
          customerId,
          recipientName: (c && (c.kontaktperson || c.namn)) || 'Kund',
          recipientEmail: els.to.value.trim() || (c && c.email) || '',
          type: 'Filer', title: samarbeteTitle, customerMessage: publicText.slice(0, 2000), status: 'Väntar'
        };
        if ((els.qTarget && els.qTarget.value) === 'uppdragskorning' && els.qRunId && els.qRunId.value.trim()) {
          body.uppdragskorningId = els.qRunId.value.trim();
        }
        const samRes = await fetch(`${baseUrl}/api/samarbete/requests`, { method:'POST', ...authOpts(), body: JSON.stringify(body) });
        const samData = await samRes.json().catch(() => ({}));
        if (!samRes.ok || !samData.success) { els.sendStatus.textContent = samData.error || 'Kunde inte skapa underlagsfrågor'; return; }
        samarbeteUrl = samData.link || '';
      }
      const prepRes = await fetch(`${baseUrl}/api/mejl/compose-prepare`, {
        method:'POST', ...authOpts(),
        body: JSON.stringify({ publicText, protectedText, protectedFiles, subject: els.subject.value.trim(), customerId: els.customer.value || undefined, samarbeteUrl, samarbeteTitle })
      });
      const prep = await prepRes.json().catch(() => ({}));
      if (!prepRes.ok || !prep.success) { els.sendStatus.textContent = prep.error || 'Kunde inte förbereda mejlet'; return; }
      els.sendStatus.textContent = 'Skickar…';
      const payload = { to: els.to.value.trim(), subject: els.subject.value.trim(), text: prep.text || publicText, html: prep.html || undefined, customerId: els.customer.value || undefined, threadId: els.compose.dataset.threadId || undefined, inReplyTo: els.compose.dataset.inReplyTo || undefined };
      const res = await fetch(`${baseUrl}/api/gmail/send`, { method:'POST', ...authOpts(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) { els.sendStatus.textContent = data.error || 'Kunde inte skicka'; return; }
      els.sendStatus.textContent = `Skickat från ${data.from || 'Gmail'}`;
      els.compose.hidden = true;
      els.to.value = ''; els.subject.value = ''; els.body.value = '';
      if (els.protectedBody) els.protectedBody.value = '';
      if (els.protectedWrap) els.protectedWrap.hidden = true;
      pendingFiles = []; renderAttachList();
      if (els.qList) els.qList.innerHTML = '';
      if (els.attachments) els.attachments.value = '';
      delete els.compose.dataset.threadId; delete els.compose.dataset.inReplyTo;
      folder = 'sent'; await loadInbox();
    } catch (err) { els.sendStatus.textContent = err.message || 'Kunde inte skicka'; }
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
    if (connectInFlight) return;
    const prevHtml = els.connectBtn.innerHTML;
    connectInFlight = true;
    els.connectBtn.dataset.connectReady = '0';
    els.connectBtn.classList.add('is-disabled');
    els.connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Öppnar Google…';
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      if (controller) controller.abort();
    }, 20000);
    try {
      const res = await fetch(`${baseUrl}/api/gmail/connect?redirect=0`, {
        ...authOpts(),
        signal: controller ? controller.signal : undefined,
        headers: { ...(authOpts().headers || {}), Accept: 'application/json' }
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.url) {
        const msg = data.error || missingEnvMessage(data);
        showToast(msg, 'error');
        els.connectText.textContent = msg;
        resetConnectButton();
        setConnectEnabled(!!(status && status.configured), msg);
        return;
      }
      // Lämna knappen i loading-läge tills navigering sker; återställ om den inte gör det.
      window.location.href = data.url;
      setTimeout(() => {
        if (connectInFlight) {
          resetConnectButton();
          setConnectEnabled(true);
          showToast('Kunde inte öppna Google. Tillåt popup/omdirigering och försök igen.', 'error');
        }
      }, 8000);
    } catch (err) {
      clearTimeout(timeoutId);
      const aborted = err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''));
      const msg = aborted
        ? 'Timeout när Google skulle öppnas. Försök igen.'
        : err.message || 'Kunde inte starta Gmail-koppling';
      showToast(msg, 'error');
      resetConnectButton();
      setConnectEnabled(true);
    }
  });

  els.disconnectBtn.addEventListener('click', async () => {
    if (!confirm('Koppla från Gmail?')) return;
    await fetch(`${baseUrl}/api/gmail/disconnect`, { method: 'POST', ...authOpts(), body: '{}' });
    await boot();
  });

  els.refreshBtn.addEventListener('click', (ev) => {
    loadInbox({ full: !!(ev && ev.shiftKey), preserveDetail: true });
  });
  if (els.refreshBtn) {
    els.refreshBtn.title = 'Uppdatera (inkrementellt). Håll Shift för full synkning.';
  }
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
    if (e.target.closest('[data-kundkort-link]')) return;

    const menuToggle = e.target.closest('[data-mejl-menu-toggle]');
    if (menuToggle) {
      e.preventDefault();
      e.stopPropagation();
      const menu = menuToggle.closest('.mejl-item-menu');
      const panel = menu && menu.querySelector('.mejl-item-menu-panel');
      const wasOpen = menu && menu.classList.contains('is-open');
      closeAllMejlItemMenus();
      if (!wasOpen && menu && panel) {
        menu.classList.add('is-open');
        panel.hidden = false;
        menuToggle.setAttribute('aria-expanded', 'true');
      }
      return;
    }

    const menuAction = e.target.closest('[data-mejl-menu-action]');
    if (menuAction) {
      e.preventDefault();
      e.stopPropagation();
      const item = menuAction.closest('.mejl-item');
      const id = item && item.getAttribute('data-id');
      const action = menuAction.getAttribute('data-mejl-menu-action');
      closeAllMejlItemMenus();
      if (id && action) handleMejlItemMenuAction(id, action);
      return;
    }

    if (e.target.closest('.mejl-item-menu')) {
      e.stopPropagation();
      return;
    }

    const btn = e.target.closest('.mejl-item');
    if (!btn) return;
    openMessage(btn.getAttribute('data-id'));
  });
  els.list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-kundkort-link]')) return;
    if (e.target.closest('.mejl-item-menu')) return;
    const btn = e.target.closest('.mejl-item');
    if (!btn || e.target !== btn) return;
    e.preventDefault();
    openMessage(btn.getAttribute('data-id'));
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.mejl-item-menu')) return;
    closeAllMejlItemMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllMejlItemMenus();
  });

  // Panel tabs + compose/sidfot listeners (DOM already present; bind once after load)
  if (els.tabInbox) els.tabInbox.addEventListener('click', () => showMejlPanel('inbox'));
  if (els.tabSettings) els.tabSettings.addEventListener('click', () => showMejlPanel('settings'));
  if (els.toggleProtected) els.toggleProtected.addEventListener('click', () => {
    if (els.protectedWrap) els.protectedWrap.hidden = !els.protectedWrap.hidden;
  });
  if (els.markBankid) els.markBankid.addEventListener('click', () => {
    const ta = els.body;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      showToast('Markera text i den offentliga delen först.', 'error');
      return;
    }
    const selected = ta.value.slice(start, end);
    ta.value = (ta.value.slice(0, start) + ta.value.slice(end)).replace(/\n{3,}/g, '\n\n');
    if (els.protectedWrap) els.protectedWrap.hidden = false;
    if (els.protectedBody) {
      els.protectedBody.value = els.protectedBody.value
        ? `${els.protectedBody.value}\n\n${selected}`
        : selected;
    }
  });
  if (els.attachments) els.attachments.addEventListener('change', () => {
    Array.from(els.attachments.files || []).forEach((file) =>
      pendingFiles.push({ name: file.name, size: file.size, file, bankId: true })
    );
    els.attachments.value = '';
    renderAttachList();
  });
  if (els.attachList) {
    els.attachList.addEventListener('click', (e) => {
      const rem = e.target.closest('[data-attach-remove]');
      if (rem) {
        pendingFiles.splice(Number(rem.getAttribute('data-attach-remove')), 1);
        renderAttachList();
      }
    });
    els.attachList.addEventListener('change', (e) => {
      const chk = e.target.closest('[data-attach-bankid]');
      if (!chk) return;
      const i = Number(chk.getAttribute('data-attach-bankid'));
      if (pendingFiles[i]) {
        pendingFiles[i].bankId = !!chk.checked;
        renderAttachList();
      }
    });
  }
  if (els.qAdd) els.qAdd.addEventListener('click', () => addQuestionRow());
  if (els.qList) {
    els.qList.addEventListener('click', (e) => {
      const btn = e.target.closest('.mejl-q-remove');
      if (btn) btn.closest('.mejl-q-row').remove();
    });
  }
  if (els.qTarget) {
    els.qTarget.addEventListener('change', () => {
      if (els.qRunWrap) els.qRunWrap.hidden = els.qTarget.value !== 'uppdragskorning';
    });
  }
  if (els.sigLayouts) {
    els.sigLayouts.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-layout]');
      if (!btn) return;
      sigLayout = btn.getAttribute('data-layout');
      els.sigLayouts.querySelectorAll('.mejl-layout-card').forEach((el) =>
        el.classList.toggle('is-active', el === btn)
      );
      refreshSignaturePreview();
    });
  }
  [
    'mejl-sig-name',
    'mejl-sig-title',
    'mejl-sig-phone',
    'mejl-sig-email',
    'mejl-sig-address',
    'mejl-sig-website',
    'mejl-sig-freetext',
    'mejl-sig-disclaimer',
    'mejl-sig-img1-url',
    'mejl-sig-img2-url'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        clearTimeout(el._sigTimer);
        el._sigTimer = setTimeout(() => refreshSignaturePreview(), 250);
      });
    }
  });
  /**
   * Sidfot lagras som JSON i Airtable long text (~100k). Råa telefonbilder
   * som data-URL spränger gränsen (422). Skala ner till mejlstorlek.
   */
  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Kunde inte läsa bild'));
      };
      img.src = url;
    });
  }

  async function compressSignatureImage(file, which) {
    const img = await loadImageFromFile(file);
    const maxW = which === 1 ? 176 : 320;
    const maxH = which === 1 ? 176 : 120;
    const scale = Math.min(1, maxW / (img.naturalWidth || img.width), maxH / (img.naturalHeight || img.height));
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Kunde inte bearbeta bild');
    ctx.drawImage(img, 0, 0, w, h);
    const preferPng = which === 2 && /png|svg|webp/i.test(file.type || '');
    const qualities = preferPng ? [null] : [0.82, 0.7, 0.55];
    let best = '';
    for (const q of qualities) {
      const dataUrl =
        q == null ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', q);
      if (!best || dataUrl.length < best.length) best = dataUrl;
      if (best.length <= 40000) break;
    }
    if (!best || best.length > 45000) {
      throw new Error(
        which === 1
          ? 'Bild 1 är fortfarande för stor efter komprimering. Använd en mindre fil eller URL.'
          : 'Bild 2 är fortfarande för stor efter komprimering. Använd en mindre fil eller URL.'
      );
    }
    return best;
  }

  async function onSigImage(inputId, which) {
    const input = document.getElementById(inputId);
    if (!input || !input.files || !input.files[0]) return;
    try {
      if (els.sigStatus) els.sigStatus.textContent = 'Bearbetar bild…';
      const dataUrl = await compressSignatureImage(input.files[0], which);
      if (which === 1) sigImage1DataUrl = dataUrl;
      else sigImage2DataUrl = dataUrl;
      if (els.sigStatus) els.sigStatus.textContent = '';
      refreshSignaturePreview();
    } catch (err) {
      if (which === 1) sigImage1DataUrl = '';
      else sigImage2DataUrl = '';
      input.value = '';
      const msg = (err && err.message) || 'Kunde inte läsa bild';
      if (els.sigStatus) els.sigStatus.textContent = msg;
      showToast(msg, 'error');
    }
  }
  const img1 = document.getElementById('mejl-sig-img1');
  const img2 = document.getElementById('mejl-sig-img2');
  if (img1) img1.addEventListener('change', () => onSigImage('mejl-sig-img1', 1));
  if (img2) img2.addEventListener('change', () => onSigImage('mejl-sig-img2', 2));
  if (els.sigSave) {
    els.sigSave.addEventListener('click', async () => {
      els.sigStatus.textContent = 'Sparar…';
      try {
        const res = await fetch(`${baseUrl}/api/mejl/signature`, {
          method: 'PUT',
          ...authOpts(),
          body: JSON.stringify({ settings: collectSignatureSettings() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          const msg =
            data.error && !/^Request failed with status code \d+$/i.test(data.error)
              ? data.error
              : 'Kunde inte spara sidfoten. Kontrollera bilderna och försök igen.';
          els.sigStatus.textContent = msg;
          showToast(msg, 'error');
          return;
        }
        fillSignatureForm(data.settings);
        if (data.previewHtml && els.sigPreview) els.sigPreview.innerHTML = data.previewHtml;
        els.sigStatus.textContent = 'Sparad.';
        showToast('Mejl-sidfot sparad.', 'success');
      } catch (err) {
        const msg = (err && err.message) || 'Kunde inte spara sidfoten.';
        els.sigStatus.textContent = msg;
        showToast(msg, 'error');
      }
    });
  }

  function onFolderClick(next) {
    if (folder === next) return;
    if ((next === 'inbox' || next === 'sent' || next === 'open') && !(status && status.connected)) {
      showToast('Koppla Gmail för att öppna Inkorg/öppna/Skickat. Delade mejl finns under «Delat med mig».', 'error');
      folder = 'shared';
      setFolderUi();
      loadInbox();
      return;
    }
    folder = next;
    // "open" filtrerar lokalt bland inbox-data
    if (next === 'open') {
      setFolderUi();
      // återanvänd senaste inbox-data; hämta om tomt
      if (!messages.length) loadInbox();
      else {
        activeId = null;
        els.detail.innerHTML = '<p class="mejl-detail-empty">Välj ett mejl till vänster.</p>';
        renderList();
      }
      return;
    }
    loadInbox();
  }
  if (els.folderInbox) els.folderInbox.addEventListener('click', () => onFolderClick('inbox'));
  if (els.folderOpen) els.folderOpen.addEventListener('click', () => onFolderClick('open'));
  if (els.folderSent) els.folderSent.addEventListener('click', () => onFolderClick('sent'));
  if (els.folderShared) els.folderShared.addEventListener('click', () => onFolderClick('shared'));

  async function boot() {
    try {
      const params = new URLSearchParams(window.location.search);
      const presetCustomer = params.get('customerId') || '';
      if (params.get('panel') === 'settings') showMejlPanel('settings');
      if (params.get('gmail') === 'connected') {
        showToast('Gmail är kopplad.', 'success');
        history.replaceState(
          {},
          '',
          'mejl.html' + (presetCustomer ? `?customerId=${encodeURIComponent(presetCustomer)}` : '')
        );
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
      // Ladda delade mejl först så de syns även utan Gmail (och innan status kan dölja UI).
      try {
        await loadSharedWithMe();
      } catch (_) {
        /* delade mejl är optional vid boot */
      }
      await loadStatus();
      if (!(status && status.connected)) {
        folder = 'shared';
      }
      renderStatus();
      resetConnectButton();
      setConnectEnabled(!!(status && status.configured && !status.connected));
      els.main.hidden = false;
      els.toolbar.hidden = false;
      try {
        await loadInbox();
        setFolderUi();
      } catch (err) {
        console.warn('mejl boot loadInbox:', err);
        showInboxFailure(
          (err && err.message) ||
            'Kunde inte synka inkorg just nu. Delade mejl och övrigt fungerar fortfarande.'
        );
        setFolderUi();
      }
    } catch (err) {
      console.error('mejl boot:', err);
      try {
        els.main.hidden = false;
        els.toolbar.hidden = false;
        if (els.list) {
          els.list.innerHTML = `<p class="mejl-hint">${esc(
            (err && err.message) || 'Mejl-sidan kunde inte laddas helt. Prova att ladda om.'
          )}</p>`;
        }
      } catch (_) {
        /* ignore */
      }
    }
  }

  // Om användaren återvänder efter misslyckad OAuth – nollställ stuck «Öppnar Google…»
  window.addEventListener('pageshow', () => {
    if (connectInFlight) {
      resetConnectButton();
      if (status && status.configured && !status.connected) setConnectEnabled(true);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && connectInFlight) {
      resetConnectButton();
      if (status && status.configured && !status.connected) setConnectEnabled(true);
    }
  });

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
