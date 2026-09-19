/**
 * Byrå-UI: tidregistrering -> fakturaunderlag.
 */
(function () {
  'use strict';

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || '';

  const el = {
    loading: document.getElementById('tid-loading'),
    noAuth: document.getElementById('tid-no-auth'),
    setup: document.getElementById('tid-setup'),
    setupBtn: document.getElementById('tid-setup-btn'),
    setupMsg: document.getElementById('tid-setup-msg'),
    content: document.getElementById('tid-content'),
    summary: document.getElementById('tid-summary'),
    list: document.getElementById('tid-list'),
    from: document.getElementById('tid-from'),
    to: document.getElementById('tid-to'),
    statusFilter: document.getElementById('tid-status-filter'),
    customerFilter: document.getElementById('tid-customer-filter'),
    bulkBar: document.getElementById('tid-bulk-bar'),
    bulkCount: document.getElementById('tid-bulk-count'),
    bulkInvoice: document.getElementById('tid-bulk-invoice'),
    bulkClear: document.getElementById('tid-bulk-clear'),
    selectAllKlar: document.getElementById('tid-select-all-klar'),
    newBtn: document.getElementById('tid-new'),
    modal: document.getElementById('tid-modal'),
    form: document.getElementById('tid-form'),
    editId: document.getElementById('tid-edit-id'),
    customerSearch: document.getElementById('tid-customer-search'),
    customerId: document.getElementById('tid-customer-id'),
    customerList: document.getElementById('tid-customer-datalist'),
    date: document.getElementById('tid-date'),
    hours: document.getElementById('tid-hours'),
    activity: document.getElementById('tid-activity'),
    activityList: document.getElementById('tid-activity-datalist'),
    rate: document.getElementById('tid-rate'),
    rateHint: document.getElementById('tid-rate-hint'),
    uppdrag: document.getElementById('tid-uppdrag'),
    description: document.getElementById('tid-description'),
    mejlLink: document.getElementById('tid-mejl-link'),
    status: document.getElementById('tid-status'),
    amountHint: document.getElementById('tid-amount-hint'),
    save: document.getElementById('tid-save'),
    formError: document.getElementById('tid-form-error'),
    modalTitle: document.getElementById('tid-modal-title')
  };

  let entries = [];
  let summary = null;
  let customers = [];
  let hourlyRates = [];
  let selectedIds = new Set();
  let bound = false;
  let rateTouched = false;

  function authOpts() {
    return window.AuthManager && AuthManager.getAuthFetchOptions
      ? AuthManager.getAuthFetchOptions()
      : { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  }

  function show(node, on) {
    if (!node) return;
    node.style.display = on ? '' : 'none';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr';
  }

  function fmtHours(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' h';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso + (String(iso).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return String(iso);
    }
  }

  function badgeClass(status) {
    if (status === 'Klar') return 'tid-badge tid-badge--klar';
    if (status === 'Fakturerad') return 'tid-badge tid-badge--fakturerad';
    return 'tid-badge';
  }

  function monthBounds() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const from = y + '-' + String(m + 1).padStart(2, '0') + '-01';
    const last = new Date(y, m + 1, 0).getDate();
    const to = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(last).padStart(2, '0');
    return { from: from, to: to };
  }

  function resolveRateFromTimlista(activity, uppdragsnamn) {
    if (!hourlyRates.length) return null;
    const needles = [activity, uppdragsnamn]
      .map(function (s) { return String(s || '').trim().toLowerCase(); })
      .filter(Boolean);

    function exact(needle) {
      return hourlyRates.find(function (it) {
        return String(it.namn || '').toLowerCase() === needle;
      }) || null;
    }
    function partial(needle) {
      if (needle.length < 3) return null;
      return hourlyRates.find(function (it) {
        const n = String(it.namn || '').toLowerCase();
        if (n.length < 3) return false;
        return n.indexOf(needle) !== -1 || needle.indexOf(n) !== -1;
      }) || null;
    }

    for (let i = 0; i < needles.length; i++) {
      const hit = exact(needles[i]);
      if (hit) return hit;
    }
    for (let j = 0; j < needles.length; j++) {
      const hit = partial(needles[j]);
      if (hit) return hit;
    }

    const named = hourlyRates.find(function (it) {
      const n = String(it.namn || '').trim().toLowerCase();
      return n === 'timpris' || n.indexOf('timpris') !== -1 || /^tim(me|mar)?\b/.test(n);
    });
    if (named) return named;

    const prices = [];
    hourlyRates.forEach(function (it) {
      if (prices.indexOf(it.pris) === -1) prices.push(it.pris);
    });
    if (prices.length === 1) return hourlyRates[0];
    return null;
  }

  function applyRateFromTimlista(force) {
    if (!el.rate) return;
    if (!force && rateTouched && String(el.rate.value || '').trim() !== '') return;
    const hit = resolveRateFromTimlista(
      el.activity && el.activity.value,
      el.uppdrag && el.uppdrag.value
    );
    if (!hit) {
      if (el.rateHint) {
        el.rateHint.hidden = true;
        el.rateHint.textContent = '';
      }
      return;
    }
    if (force || !String(el.rate.value || '').trim()) {
      el.rate.value = hit.pris;
      if (!force) rateTouched = false;
    }
    if (el.rateHint) {
      el.rateHint.hidden = false;
      el.rateHint.textContent = 'Timpris från byråns prislista: ' + hit.namn;
    }
    updateAmountHint();
  }

  function updateAmountHint() {
    if (!el.amountHint) return;
    const h = Number(el.hours && el.hours.value);
    const r = Number(el.rate && el.rate.value);
    if (h > 0 && r > 0) {
      el.amountHint.hidden = false;
      el.amountHint.textContent = 'Belopp: ' + fmtMoney(Math.round(h * r * 100) / 100);
    } else {
      el.amountHint.hidden = true;
      el.amountHint.textContent = '';
    }
  }

  function updateActivityDatalist() {
    if (!el.activityList) return;
    el.activityList.innerHTML = hourlyRates.map(function (it) {
      return '<option value="' + esc(it.namn) + '"></option>';
    }).join('');
  }

  async function api(path, opts) {
    const res = await fetch(baseUrl + path, Object.assign({}, authOpts(), opts || {}));
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status;
      err.needsSetup = !!data.needsSetup;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function loadCustomers() {
    try {
      const res = await fetch(baseUrl + '/api/kunddata', {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({})
      });
      if (!res.ok) return;
      const data = await res.json();
      const records = (data.success && data.data) ? data.data : [];
      customers = records.map(function (r) {
        const f = r.fields || {};
        return { id: r.id, namn: f.Namn || f['Företagsnamn'] || 'Namn saknas' };
      }).sort(function (a, b) { return a.namn.localeCompare(b.namn, 'sv'); });
      if (el.customerList) {
        el.customerList.innerHTML = customers.map(function (c) {
          return '<option value="' + esc(c.namn) + '" data-id="' + esc(c.id) + '"></option>';
        }).join('');
      }
    } catch (_) {
      customers = [];
    }
  }

  function resolveCustomerFromSearch() {
    const name = String((el.customerSearch && el.customerSearch.value) || '').trim();
    const match = customers.find(function (c) { return c.namn === name; });
    if (match) {
      el.customerId.value = match.id;
      return match;
    }
    const id = String((el.customerId && el.customerId.value) || '').trim();
    if (id) {
      const byId = customers.find(function (c) { return c.id === id; });
      if (byId) return byId;
    }
    return name ? { id: '', namn: name } : null;
  }

  function renderSummary() {
    if (!el.summary) return;
    const s = summary || {};
    const basis = s.invoiceBasis || {};
    const draftH = (s.byStatus && s.byStatus.Utkast && s.byStatus.Utkast.hours) || 0;
    const draftC = (s.byStatus && s.byStatus.Utkast && s.byStatus.Utkast.count) || 0;
    el.summary.innerHTML =
      '<div class="tid-stat"><span class="tid-stat-label">Totalt</span><strong>' + esc(fmtHours(s.totalHours)) +
      '</strong><span class="tid-stat-sub">' + esc(fmtMoney(s.totalAmount)) + ' · ' + (s.totalCount || 0) + ' poster</span></div>' +
      '<div class="tid-stat tid-stat--basis"><span class="tid-stat-label">Fakturaunderlag (Klar)</span><strong>' +
      esc(fmtHours(basis.hours)) + '</strong><span class="tid-stat-sub">' + esc(fmtMoney(basis.amount)) +
      ' · ' + (basis.count || 0) + ' poster</span></div>' +
      '<div class="tid-stat"><span class="tid-stat-label">Utkast</span><strong>' + esc(fmtHours(draftH)) +
      '</strong><span class="tid-stat-sub">' + draftC + ' poster</span></div>';
  }

  function filteredEntries() {
    const q = String((el.customerFilter && el.customerFilter.value) || '').trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(function (e) {
      return String(e.customerName || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function eligibleKlarIds() {
    return filteredEntries().filter(function (e) { return e.status === 'Klar'; }).map(function (e) { return e.id; });
  }

  function syncSelectionWithList() {
    const valid = new Set(eligibleKlarIds());
    selectedIds = new Set(Array.from(selectedIds).filter(function (id) { return valid.has(id); }));
  }

  function updateBulkBar() {
    syncSelectionWithList();
    const n = selectedIds.size;
    if (el.bulkCount) el.bulkCount.textContent = String(n);
    if (el.bulkBar) el.bulkBar.hidden = n === 0;
    if (el.bulkInvoice) el.bulkInvoice.disabled = n === 0;
    if (el.selectAllKlar) {
      const ids = eligibleKlarIds();
      el.selectAllKlar.disabled = ids.length === 0;
      el.selectAllKlar.checked = ids.length > 0 && ids.every(function (id) { return selectedIds.has(id); });
      el.selectAllKlar.indeterminate = n > 0 && !el.selectAllKlar.checked;
    }
  }

  function mejlLinkHtml(url) {
    const href = String(url || '').trim();
    if (!href || !/^\/?(?:https?:\/\/[^\s]+\/)?mejl\.html\?messageId=/.test(href)) return '';
    return '<p class="tid-card-meta"><a class="tid-mejl-link" href="' + esc(href) + '">Öppna mejl</a></p>';
  }

  function renderMejlLink(url) {
    if (!el.mejlLink) return;
    const href = String(url || '').trim();
    if (!href || !/^\/?(?:https?:\/\/[^\s]+\/)?mejl\.html\?messageId=/.test(href)) {
      el.mejlLink.hidden = true;
      el.mejlLink.innerHTML = '';
      return;
    }
    el.mejlLink.hidden = false;
    el.mejlLink.innerHTML = '<a class="tid-mejl-link" href="' + esc(href) + '">Öppna mejl</a>';
  }

  function renderList() {
    if (!el.list) return;
    const list = filteredEntries();
    syncSelectionWithList();
    if (!list.length) {
      el.list.innerHTML = '<p class="moten-empty">Ingen tid registrerad för valt filter. Klicka på <strong>Registrera tid</strong>.</p>';
      updateBulkBar();
      return;
    }
    el.list.innerHTML = list.map(function (e) {
      const canEdit = e.status !== 'Fakturerad';
      const canSelect = e.status === 'Klar';
      let actions = '';
      if (canEdit && e.status === 'Utkast') {
        actions += '<button type="button" class="btn btn-primary btn-sm" data-tid-ready="' + esc(e.id) + '">Markera Klar</button>';
      }
      if (canEdit && e.status === 'Klar') {
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-tid-draft="' + esc(e.id) + '">Tillbaka till utkast</button>';
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-tid-invoiced="' + esc(e.id) + '">Markera fakturerad</button>';
      }
      if (canEdit) {
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-tid-edit="' + esc(e.id) + '">Redigera</button>';
        actions += '<button type="button" class="btn btn-ghost btn-sm" data-tid-del="' + esc(e.id) + '">Radera</button>';
      }
      const act = e.activity ? (e.activity + (e.description ? ' — ' : '')) : '';
      const amountNote = e.rateFromPrislista
        ? '<span class="tid-rate-from-list" title="Beräknat från byråns prislista"> · från prislista</span>'
        : '';
      const check = canSelect
        ? '<label class="tid-card-check"><input type="checkbox" data-tid-select="' + esc(e.id) + '"' +
          (selectedIds.has(e.id) ? ' checked' : '') + '><span class="sr-only">Välj för fakturering</span></label>'
        : '<span class="tid-card-check tid-card-check--empty" aria-hidden="true"></span>';
      return '<article class="tid-card' + (selectedIds.has(e.id) ? ' is-selected' : '') + '" data-id="' + esc(e.id) + '">' +
        check +
        '<div class="tid-card-main">' +
        '<div class="tid-card-top"><h3>' + esc(e.customerName || 'Kund saknas') + '</h3>' +
        '<span class="' + badgeClass(e.status) + '">' + esc(e.status) + '</span></div>' +
        '<p class="tid-card-meta">' + esc(fmtDate(e.date)) + ' · ' + esc(fmtHours(e.hours)) +
        (e.amount != null ? ' · ' + esc(fmtMoney(e.amount)) : '') + amountNote + '</p>' +
        '<p class="tid-card-desc">' + esc(act) + esc(e.description || '') + '</p>' +
        mejlLinkHtml(e.mejlUrl) +
        (e.uppdragsnamn ? '<p class="tid-card-meta">Uppdrag: ' + esc(e.uppdragsnamn) + '</p>' : '') +
        '<p class="tid-card-meta">' + esc(e.performedByName || e.performedBy || '') + '</p></div>' +
        '<div class="tid-card-actions">' + actions + '</div></article>';
    }).join('');
    updateBulkBar();
  }

  async function loadEntries() {
    const params = new URLSearchParams();
    if (el.from && el.from.value) params.set('from', el.from.value);
    if (el.to && el.to.value) params.set('to', el.to.value);
    if (el.statusFilter && el.statusFilter.value) params.set('status', el.statusFilter.value);
    const qs = params.toString() ? '?' + params.toString() : '';
    const data = await api('/api/tidregistrering' + qs);
    entries = data.entries || [];
    summary = data.summary || null;
    hourlyRates = (data.prislista && data.prislista.hourlyRates) || [];
    updateActivityDatalist();
    renderSummary();
    renderList();
  }

  function openModal(entry) {
    if (!el.modal) return;
    if (el.form) el.form.reset();
    el.formError.hidden = true;
    el.formError.textContent = '';
    rateTouched = false;
    if (el.rateHint) {
      el.rateHint.hidden = true;
      el.rateHint.textContent = '';
    }
    if (entry) {
      el.modalTitle.textContent = 'Redigera tid';
      el.editId.value = entry.id;
      el.customerSearch.value = entry.customerName || '';
      el.customerId.value = entry.customerId || '';
      el.date.value = entry.date || '';
      el.hours.value = entry.hours != null ? entry.hours : '';
      el.activity.value = entry.activity || '';
      el.rate.value = entry.rate != null ? entry.rate : '';
      el.uppdrag.value = entry.uppdragsnamn || '';
      el.description.value = entry.description || '';
      el.status.value = entry.status === 'Klar' ? 'Klar' : 'Utkast';
      renderMejlLink(entry.mejlUrl);
      if (entry.rate != null && Number(entry.rate) > 0) {
        rateTouched = !entry.rateFromPrislista;
        if (entry.rateFromPrislista && el.rateHint) {
          el.rateHint.hidden = false;
          el.rateHint.textContent = 'Timpris från byråns prislista' +
            (entry.rateMatchedName ? ': ' + entry.rateMatchedName : '');
        }
      } else {
        applyRateFromTimlista(true);
      }
    } else {
      el.modalTitle.textContent = 'Registrera tid';
      el.editId.value = '';
      renderMejlLink('');
      el.customerId.value = '';
      el.date.value = new Date().toISOString().slice(0, 10);
      el.status.value = 'Utkast';
      const pre = new URLSearchParams(location.search);
      if (pre.get('customerName')) el.customerSearch.value = pre.get('customerName');
      if (pre.get('customerId')) el.customerId.value = pre.get('customerId');
      if (pre.get('uppdrag')) el.uppdrag.value = pre.get('uppdrag');
      if (pre.get('hours')) el.hours.value = pre.get('hours');
      if (pre.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(pre.get('date'))) {
        el.date.value = pre.get('date');
      }
      const start = pre.get('start');
      const end = pre.get('end');
      if (start && end && el.description && !el.description.value) {
        const fmt = (iso) => {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return '';
          return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        };
        const a = fmt(start);
        const b = fmt(end);
        if (a && b) el.description.value = 'Avsatt tid ' + a + '–' + b + ' (från kalender)';
      }
      if (!el.activity.value && pre.get('hours')) {
        el.activity.value = 'Uppdragsarbete';
      }
      applyRateFromTimlista(true);
    }
    updateAmountHint();
    el.modal.hidden = false;
    if (el.customerSearch) el.customerSearch.focus();
  }

  function closeModal() {
    if (el.modal) el.modal.hidden = true;
  }

  async function saveEntry(ev) {
    ev.preventDefault();
    el.formError.hidden = true;
    const cust = resolveCustomerFromSearch();
    if (!cust) {
      el.formError.hidden = false;
      el.formError.textContent = 'Välj eller ange en kund';
      return;
    }
    if (!String(el.rate.value || '').trim()) {
      applyRateFromTimlista(true);
    }
    const body = {
      customerId: cust.id || '',
      customerName: cust.namn,
      date: el.date.value,
      hours: Number(el.hours.value),
      activity: el.activity.value.trim(),
      description: el.description.value.trim(),
      uppdragsnamn: el.uppdrag.value.trim(),
      status: el.status.value,
      rate: el.rate.value !== '' ? Number(el.rate.value) : null
    };
    try {
      el.save.disabled = true;
      const id = el.editId.value.trim();
      if (id) {
        await api('/api/tidregistrering/' + encodeURIComponent(id), {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await api('/api/tidregistrering', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      closeModal();
      await loadEntries();
    } catch (err) {
      el.formError.hidden = false;
      el.formError.textContent = err.message || 'Kunde inte spara';
    } finally {
      el.save.disabled = false;
    }
  }

  async function setStatus(id, status) {
    await api('/api/tidregistrering/' + encodeURIComponent(id) + '/status', {
      method: 'PUT',
      body: JSON.stringify({ status: status })
    });
    await loadEntries();
  }

  async function bulkMarkInvoiced() {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      alert('Välj minst en tidpost med status Klar.');
      return;
    }
    if (!confirm('Markera ' + ids.length + ' tidpost(er) som fakturerad?')) return;
    try {
      if (el.bulkInvoice) el.bulkInvoice.disabled = true;
      const data = await api('/api/tidregistrering/bulk/status', {
        method: 'PUT',
        body: JSON.stringify({ ids: ids, status: 'Fakturerad' })
      });
      selectedIds = new Set();
      await loadEntries();
      const parts = [];
      if (data.count) parts.push(data.count + ' markerad(e) som fakturerad');
      if (data.skipped && data.skipped.length) {
        parts.push(data.skipped.length + ' hoppades över');
      }
      if (data.errors && data.errors.length) {
        parts.push(data.errors.length + ' misslyckades');
      }
      if (parts.length && ((data.skipped && data.skipped.length) || (data.errors && data.errors.length))) {
        alert(parts.join('. ') + '.');
      }
    } catch (err) {
      alert(err.message || 'Kunde inte markera som fakturerad');
    } finally {
      updateBulkBar();
    }
  }

  async function deleteEntry(id) {
    if (!confirm('Radera tidposten?')) return;
    await api('/api/tidregistrering/' + encodeURIComponent(id), { method: 'DELETE' });
    selectedIds.delete(id);
    await loadEntries();
  }

  function showSetup() {
    show(el.loading, false);
    show(el.noAuth, false);
    show(el.content, false);
    show(el.setup, true);
  }

  function bind() {
    if (bound) return;
    bound = true;
    if (el.newBtn) el.newBtn.addEventListener('click', function () { openModal(null); });
    if (el.setupBtn) {
      el.setupBtn.addEventListener('click', async function () {
        el.setupMsg.textContent = 'Skapar tabell…';
        try {
          const data = await api('/api/setup/airtable-tidregistrering', { method: 'POST' });
          el.setupMsg.textContent = data.message || 'Klart';
          await boot(true);
        } catch (err) {
          el.setupMsg.textContent = err.message || 'Setup misslyckades';
        }
      });
    }
    if (el.form) el.form.addEventListener('submit', saveEntry);
    if (el.hours) el.hours.addEventListener('input', updateAmountHint);
    if (el.rate) {
      el.rate.addEventListener('input', function () {
        rateTouched = true;
        if (el.rateHint) {
          el.rateHint.hidden = true;
          el.rateHint.textContent = '';
        }
        updateAmountHint();
      });
    }
    if (el.activity) {
      el.activity.addEventListener('change', function () { applyRateFromTimlista(false); });
      el.activity.addEventListener('blur', function () { applyRateFromTimlista(false); });
    }
    if (el.uppdrag) {
      el.uppdrag.addEventListener('change', function () { applyRateFromTimlista(false); });
      el.uppdrag.addEventListener('blur', function () { applyRateFromTimlista(false); });
    }
    if (el.customerSearch) el.customerSearch.addEventListener('change', resolveCustomerFromSearch);
    if (el.customerFilter) el.customerFilter.addEventListener('input', renderList);
    if (el.bulkInvoice) el.bulkInvoice.addEventListener('click', bulkMarkInvoiced);
    if (el.bulkClear) {
      el.bulkClear.addEventListener('click', function () {
        selectedIds = new Set();
        renderList();
      });
    }
    if (el.selectAllKlar) {
      el.selectAllKlar.addEventListener('change', function () {
        const ids = eligibleKlarIds();
        if (el.selectAllKlar.checked) {
          ids.forEach(function (id) { selectedIds.add(id); });
        } else {
          ids.forEach(function (id) { selectedIds.delete(id); });
        }
        renderList();
      });
    }
    [el.from, el.to, el.statusFilter].forEach(function (node) {
      if (!node) return;
      node.addEventListener('change', function () {
        selectedIds = new Set();
        loadEntries().catch(function (err) {
          if (err.needsSetup) showSetup();
        });
      });
    });
    document.querySelectorAll('[data-tid-close]').forEach(function (n) {
      n.addEventListener('click', closeModal);
    });
    if (el.list) {
      el.list.addEventListener('change', function (ev) {
        const cb = ev.target.closest('[data-tid-select]');
        if (!cb) return;
        const id = cb.getAttribute('data-tid-select');
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        const card = cb.closest('.tid-card');
        if (card) card.classList.toggle('is-selected', cb.checked);
        updateBulkBar();
      });
      el.list.addEventListener('click', async function (ev) {
        const t = ev.target.closest('[data-tid-ready],[data-tid-draft],[data-tid-invoiced],[data-tid-edit],[data-tid-del]');
        if (!t) return;
        try {
          if (t.dataset.tidReady) await setStatus(t.dataset.tidReady, 'Klar');
          else if (t.dataset.tidDraft) await setStatus(t.dataset.tidDraft, 'Utkast');
          else if (t.dataset.tidInvoiced) await setStatus(t.dataset.tidInvoiced, 'Fakturerad');
          else if (t.dataset.tidEdit) {
            const entry = entries.find(function (e) { return e.id === t.dataset.tidEdit; });
            if (entry) openModal(entry);
          } else if (t.dataset.tidDel) await deleteEntry(t.dataset.tidDel);
        } catch (err) {
          alert(err.message || 'Åtgärden misslyckades');
        }
      });
    }
  }

  async function boot(afterSetup) {
    bind();
    const user = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
    if (!user) {
      show(el.loading, false);
      show(el.setup, false);
      show(el.content, false);
      show(el.noAuth, true);
      return;
    }
    show(el.noAuth, false);
    if (!afterSetup) {
      show(el.loading, true);
      show(el.setup, false);
      show(el.content, false);
    }
    if (el.from && el.to && !el.from.value && !el.to.value) {
      const b = monthBounds();
      el.from.value = b.from;
      el.to.value = b.to;
    }
    try {
      await Promise.all([loadCustomers(), loadEntries()]);
      show(el.loading, false);
      show(el.setup, false);
      show(el.content, true);
      const pre = new URLSearchParams(location.search);
      if (pre.get('new') === '1') openModal(null);
    } catch (err) {
      show(el.loading, false);
      if (err.needsSetup || err.status === 503) showSetup();
      else {
        show(el.content, true);
        if (el.list) el.list.innerHTML = '<p class="moten-empty">' + esc(err.message || 'Kunde inte ladda') + '</p>';
      }
    }
  }

  function go() { boot(false); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.addEventListener('clientflow:authReady', go, { once: true });
      setTimeout(go, 800);
    });
  } else {
    window.addEventListener('clientflow:authReady', go, { once: true });
    setTimeout(go, 800);
  }
})();
