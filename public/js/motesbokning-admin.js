/**
 * Admin-UI: Mötesbokning – möteslänkar (Reclaim-liknande).
 */
(function () {
  'use strict';

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || '';
  const ICON_MAP = {
    bolt: 'fa-bolt',
    lightbulb: 'fa-lightbulb',
    sun: 'fa-sun',
    comments: 'fa-comments',
    briefcase: 'fa-briefcase'
  };

  const el = {
    loading: document.getElementById('mb-loading'),
    noAuth: document.getElementById('mb-no-auth'),
    setup: document.getElementById('mb-setup'),
    setupBtn: document.getElementById('mb-setup-btn'),
    setupMsg: document.getElementById('mb-setup-msg'),
    content: document.getElementById('mb-content'),
    linkGrid: document.getElementById('mb-link-grid'),
    hiddenGrid: document.getElementById('mb-hidden-grid'),
    inviteList: document.getElementById('mb-invite-list'),
    emptyLankar: document.getElementById('mb-empty-lankar'),
    emptyHidden: document.getElementById('mb-empty-hidden'),
    emptyInvites: document.getElementById('mb-empty-invites'),
    badgeLankar: document.getElementById('mb-badge-lankar'),
    badgeHidden: document.getElementById('mb-badge-hidden'),
    badgeInvites: document.getElementById('mb-badge-invites'),
    newBtn: document.getElementById('mb-new-link'),
    modal: document.getElementById('mb-modal'),
    form: document.getElementById('mb-form'),
    formError: document.getElementById('mb-form-error'),
    editId: document.getElementById('mb-edit-id'),
    modalTitle: document.getElementById('mb-modal-title'),
    hostSlug: document.getElementById('mb-host-slug'),
    openHost: document.getElementById('mb-open-host'),
    copyHost: document.getElementById('mb-copy-host'),
    shareModal: document.getElementById('mb-share-modal'),
    shareLinkId: document.getElementById('mb-share-link-id'),
    shareLinkName: document.getElementById('mb-share-link-name'),
    shareCustomer: document.getElementById('mb-share-customer'),
    shareAgenda: document.getElementById('mb-share-agenda'),
    shareDuration: document.getElementById('mb-share-duration'),
    shareLoadSlots: document.getElementById('mb-share-load-slots'),
    shareSlots: document.getElementById('mb-share-slots'),
    shareSlotsEmpty: document.getElementById('mb-share-slots-empty'),
    shareOnlySuggested: document.getElementById('mb-share-only-suggested'),
    shareCreate: document.getElementById('mb-share-create'),
    shareResult: document.getElementById('mb-share-result'),
    shareUrl: document.getElementById('mb-share-url'),
    shareCopy: document.getElementById('mb-share-copy'),
    shareError: document.getElementById('mb-share-error')
  };

  let shareLinkRef = null;
  let shareAvailSlots = [];

  let links = [];
  let invites = [];
  let currentTab = 'lankar';
  let userEmail = '';

  const DAY_LABELS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
  const DEFAULT_INTERVAL = { start: '09:00', end: '16:30' };
  /** @type {Record<string, Array<{start:string,end:string}>>} */
  let scheduleState = defaultSchedule();

  function defaultSchedule() {
    const out = {};
    for (let d = 0; d <= 4; d++) out[String(d)] = [{ ...DEFAULT_INTERVAL }];
    return out;
  }

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

  function fmtDurations(arr) {
    return (arr || [])
      .map((n) => {
        const m = Number(n);
        if (m >= 60 && m % 60 === 0) return `${m / 60}h`;
        if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
        return `${m}m`;
      })
      .join(', ')
      .replace(/, ([^,]+)$/, ' or $1');
  }

  function locLabel(locations) {
    const locs = locations || [];
    if (!locs.length) return '—';
    const first = locs[0];
    if (first.type === 'meet') return 'Google Meet';
    if (first.type === 'phone') return first.value || first.label || 'Telefon';
    return first.value || first.label || 'På plats';
  }

  function priorityBars(p) {
    const n = Math.min(4, Math.max(1, Number(p) || 2));
    let html = '<span class="mb-prio" title="Prioritet ' + n + '">';
    for (let i = 1; i <= 4; i++) {
      html += `<i class="mb-prio-bar${i <= n ? ' is-on' : ''}"></i>`;
    }
    return html + '</span>';
  }

  async function api(path, opts) {
    const o = Object.assign({}, authOpts(), opts || {});
    o.headers = Object.assign({}, o.headers || {}, (opts && opts.headers) || {});
    if (o.body && typeof o.body === 'object' && !(o.body instanceof FormData)) {
      o.body = JSON.stringify(o.body);
      o.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(baseUrl + path, o);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message
        || (res.status === 422
          ? 'Kunde inte spara (Airtable avvisade fälten). Prova igen eller kör setup för möteslänkar.'
          : `Kunde inte spara (fel ${res.status})`);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function setTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.mb-tab').forEach((btn) => {
      const on = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['lankar', 'inbjudningar', 'dolda'].forEach((t) => {
      const panel = document.getElementById('mb-panel-' + t);
      if (panel) panel.hidden = t !== tab;
    });
  }

  function cardHtml(link) {
    const icon = ICON_MAP[link.icon] || 'fa-bolt';
    const color = esc(link.color || '#13505c');
    const url = esc(link.url || '');
    return `
      <article class="mb-link-card" data-id="${esc(link.id)}">
        <div class="mb-link-card-actions">
          <button type="button" class="mb-icon-btn" data-act="edit" title="Redigera"><i class="fas fa-pen"></i></button>
          <button type="button" class="mb-icon-btn" data-act="copy" title="Kopiera länk"><i class="fas fa-copy"></i></button>
          <button type="button" class="mb-icon-btn" data-act="share" title="Anpassa inbjudan"><i class="fas fa-envelope-open-text"></i></button>
          <span class="mb-icon-btn" title="Prioritet ${esc(link.priorityLabel || link.priority)}">${priorityBars(link.priority)}</span>
          <button type="button" class="mb-icon-btn" data-act="more" title="Mer"><i class="fas fa-ellipsis-v"></i></button>
        </div>
        <div class="mb-link-avatar">
          <span class="mb-link-icon" style="background:${color}"><i class="fas ${icon}"></i></span>
        </div>
        <h3 class="mb-link-title">${esc(link.title)}</h3>
        <p class="mb-link-desc">${esc(link.description || '')}</p>
        <div class="mb-link-meta">
          <div><i class="far fa-clock"></i> ${esc(fmtDurations(link.durations))}</div>
          <div><i class="fas fa-video"></i> ${esc(locLabel(link.locations))}</div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm mb-card-customize" data-act="share">
          <i class="fas fa-pen-fancy"></i> Anpassa inbjudan
        </button>
        <input type="hidden" class="mb-card-url" value="${url}">
      </article>`;
  }

  function renderLinks() {
    const visible = links.filter((l) => l.visible !== false);
    const hidden = links.filter((l) => l.visible === false);
    if (el.linkGrid) el.linkGrid.innerHTML = visible.map(cardHtml).join('');
    if (el.hiddenGrid) el.hiddenGrid.innerHTML = hidden.map(cardHtml).join('');
    if (el.emptyLankar) el.emptyLankar.hidden = visible.length > 0;
    if (el.emptyHidden) el.emptyHidden.hidden = hidden.length > 0;
    if (el.badgeLankar) el.badgeLankar.textContent = String(visible.length);
    if (el.badgeHidden) el.badgeHidden.textContent = String(hidden.length);

    const first = visible[0] || links[0];
    if (first && el.hostSlug) {
      const slugPart = first.slug ? first.slug.split('-')[0] : 'mote';
      const hostPath = `boka-mote.html?lank=${encodeURIComponent(first.slug)}`;
      const full = (first.url || hostPath).replace(/\?.*$/, '') + `?host=${encodeURIComponent(userEmail.split('@')[0] || 'mote')}`;
      el.hostSlug.textContent = full.replace(/^https?:\/\//, '');
      if (el.openHost) el.openHost.href = first.url || hostPath;
    }

    document.querySelectorAll('.mb-link-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = card.getAttribute('data-id');
        const link = links.find((l) => l.id === id);
        if (!link) return;
        const act = btn.getAttribute('data-act');
        if (act === 'edit') openEdit(link);
        if (act === 'copy') copyText(link.url);
        if (act === 'share') openShare(link);
        if (act === 'more') toggleMore(card, link);
      });
    });
  }

  function renderInvites() {
    if (!el.inviteList) return;
    if (!invites.length) {
      el.inviteList.innerHTML = '';
      if (el.emptyInvites) el.emptyInvites.hidden = false;
      if (el.badgeInvites) el.badgeInvites.textContent = '0';
      return;
    }
    if (el.emptyInvites) el.emptyInvites.hidden = true;
    if (el.badgeInvites) el.badgeInvites.textContent = String(invites.length);
    el.inviteList.innerHTML = invites
      .map(
        (inv) => `
      <article class="moten-card">
        <div class="moten-card-main">
          <div class="moten-card-top">
            <h3>${esc(inv.title)}</h3>
            <span class="moten-badge">${esc(inv.status)}</span>
          </div>
          <p class="moten-card-meta">${esc(inv.customerName || inv.bookerName || '—')} · ${esc(inv.meetingType || '')}</p>
          ${inv.bookingUrl ? `<div class="moten-link-row"><input class="kunduppgifter-input" readonly value="${esc(inv.bookingUrl)}"></div>` : ''}
        </div>
      </article>`
      )
      .join('');
  }

  function toggleMore(card, link) {
    const existing = card.querySelector('.mb-more-menu');
    if (existing) {
      existing.remove();
      return;
    }
    const menu = document.createElement('div');
    menu.className = 'mb-more-menu';
    menu.innerHTML = `
      <button type="button" data-more="hide">${link.visible === false ? 'Visa' : 'Dölj'}</button>
      <button type="button" data-more="delete" class="is-danger">Ta bort</button>`;
    card.appendChild(menu);
    menu.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-more]');
      if (!b) return;
      const act = b.getAttribute('data-more');
      try {
        if (act === 'hide') {
          await api('/api/motesbokning/links/' + encodeURIComponent(link.id), {
            method: 'PATCH',
            body: { ...linkPayloadFromLink(link), visible: link.visible === false }
          });
          await load();
        }
        if (act === 'delete') {
          if (!confirm('Ta bort möteslänken?')) return;
          await api('/api/motesbokning/links/' + encodeURIComponent(link.id), { method: 'DELETE' });
          await load();
        }
      } catch (err) {
        alert(err.message || 'Kunde inte uppdatera');
      }
    });
  }

  function linkPayloadFromLink(link) {
    return {
      title: link.title,
      slug: link.slug,
      description: link.description,
      durations: link.durations,
      locations: link.locations,
      priority: link.priority,
      bufferBeforeMin: link.bufferBeforeMin,
      bufferAfterMin: link.bufferAfterMin,
      noticeHours: link.noticeHours,
      windowDays: link.windowDays,
      weekdays: link.weekdays,
      dayStart: link.dayStart,
      dayEnd: link.dayEnd,
      schedule: link.schedule || null,
      defaultAgenda: link.defaultAgenda,
      icon: link.icon,
      color: link.color,
      visible: link.visible
    };
  }

  function checkedValues(rootId) {
    return Array.from(document.querySelectorAll('#' + rootId + ' input[type=checkbox]:checked')).map((i) =>
      Number(i.value)
    );
  }

  function setChecked(rootId, values) {
    const set = new Set((values || []).map(Number));
    document.querySelectorAll('#' + rootId + ' input[type=checkbox]').forEach((i) => {
      i.checked = set.has(Number(i.value));
    });
  }

  function scheduleFromLink(link) {
    if (link?.schedule && typeof link.schedule === 'object' && Object.keys(link.schedule).length) {
      const out = {};
      for (let d = 0; d <= 6; d++) {
        const key = String(d);
        const list = link.schedule[key];
        if (!Array.isArray(list) || !list.length) continue;
        out[key] = list.map((iv) => ({
          start: String(iv.start || '09:00').slice(0, 5),
          end: String(iv.end || '17:00').slice(0, 5)
        }));
      }
      if (Object.keys(out).length) return out;
    }
    const days = Array.isArray(link?.weekdays) && link.weekdays.length ? link.weekdays : [0, 1, 2, 3, 4];
    const start = String(link?.dayStart || '09:00').slice(0, 5);
    const end = String(link?.dayEnd || '16:30').slice(0, 5);
    const out = {};
    days.forEach((d) => {
      out[String(d)] = [{ start, end }];
    });
    return out;
  }

  function syncDayToggles() {
    document.querySelectorAll('#mb-day-toggles .mb-day-toggle').forEach((btn) => {
      const d = btn.getAttribute('data-day');
      btn.classList.toggle('is-on', !!(scheduleState[d] && scheduleState[d].length));
    });
  }

  function renderScheduleRows() {
    const root = document.getElementById('mb-schedule-rows');
    if (!root) return;
    const activeDays = Object.keys(scheduleState)
      .map(Number)
      .filter((d) => scheduleState[String(d)]?.length)
      .sort((a, b) => a - b);
    if (!activeDays.length) {
      root.innerHTML = '<p class="mb-empty">Välj minst en dag ovan.</p>';
      syncDayToggles();
      return;
    }
    root.innerHTML = activeDays
      .map((d, idx) => {
        const key = String(d);
        const intervals = scheduleState[key] || [];
        const ivHtml = intervals
          .map(
            (iv, i) => `
          <div class="mb-schedule-iv" data-day="${key}" data-iv="${i}">
            <input type="time" class="kunduppgifter-input" data-role="start" value="${esc(iv.start)}">
            <span class="mb-iv-to">till</span>
            <input type="time" class="kunduppgifter-input" data-role="end" value="${esc(iv.end)}">
            ${
              intervals.length > 1
                ? `<button type="button" class="mb-iv-remove" data-act="remove-iv" data-day="${key}" data-iv="${i}" title="Ta bort"><i class="fas fa-times"></i></button>`
                : ''
            }
            ${
              i === intervals.length - 1
                ? `<button type="button" class="mb-schedule-add" data-act="add-iv" data-day="${key}" title="Lägg till intervall (t.ex. efter lunch)">+</button>`
                : ''
            }
          </div>`
          )
          .join('');
        return `
        <div class="mb-schedule-day" data-day="${key}">
          <div class="mb-schedule-day-head">
            <span>${esc(DAY_LABELS[d] || key)}</span>
            ${
              idx === 0
                ? `<button type="button" class="mb-schedule-copy" data-act="copy-all" data-day="${key}">
              <i class="fas fa-copy"></i> Kopiera till alla
            </button>`
                : ''
            }
          </div>
          <div class="mb-schedule-intervals">${ivHtml}</div>
        </div>`;
      })
      .join('');
    syncDayToggles();

    root.querySelectorAll('input[type="time"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const row = inp.closest('.mb-schedule-iv');
        if (!row) return;
        const day = row.getAttribute('data-day');
        const iv = Number(row.getAttribute('data-iv'));
        if (!scheduleState[day] || !scheduleState[day][iv]) return;
        const role = inp.getAttribute('data-role');
        scheduleState[day][iv][role] = inp.value || (role === 'start' ? '09:00' : '17:00');
      });
    });
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.getAttribute('data-act');
        const day = btn.getAttribute('data-day');
        if (act === 'add-iv') {
          if (!scheduleState[day]) scheduleState[day] = [];
          const last = scheduleState[day][scheduleState[day].length - 1];
          scheduleState[day].push({
            start: last?.end || '13:00',
            end: '17:00'
          });
          renderScheduleRows();
        }
        if (act === 'remove-iv') {
          const iv = Number(btn.getAttribute('data-iv'));
          if (scheduleState[day] && scheduleState[day].length > 1) {
            scheduleState[day].splice(iv, 1);
            renderScheduleRows();
          }
        }
        if (act === 'copy-all') {
          const src = (scheduleState[day] || []).map((iv) => ({ ...iv }));
          if (!src.length) return;
          Object.keys(scheduleState).forEach((k) => {
            if (scheduleState[k]?.length) scheduleState[k] = src.map((iv) => ({ ...iv }));
          });
          renderScheduleRows();
        }
      });
    });
  }

  function bindDayToggles() {
    document.querySelectorAll('#mb-day-toggles .mb-day-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const day = btn.getAttribute('data-day');
        if (scheduleState[day]?.length) {
          delete scheduleState[day];
        } else {
          // Kopiera från första aktiva dagen om möjligt
          const firstKey = Object.keys(scheduleState).sort()[0];
          const template = firstKey
            ? scheduleState[firstKey].map((iv) => ({ ...iv }))
            : [{ ...DEFAULT_INTERVAL }];
          scheduleState[day] = template;
        }
        renderScheduleRows();
      });
    });
  }

  function readForm() {
    const locations = [];
    if (document.getElementById('mb-loc-meet')?.checked) {
      locations.push({ id: 'meet', type: 'meet', label: 'Google Meet', value: '' });
    }
    if (document.getElementById('mb-loc-phone')?.checked) {
      const phone = document.getElementById('mb-phone')?.value || '';
      locations.push({ id: 'phone', type: 'phone', label: 'Telefon', value: phone });
    }
    if (document.getElementById('mb-loc-place')?.checked) {
      const place = document.getElementById('mb-place')?.value || '';
      locations.push({ id: 'place', type: 'place', label: 'På plats', value: place });
    }
    // Synka times från DOM innan spar
    document.querySelectorAll('#mb-schedule-rows .mb-schedule-iv').forEach((row) => {
      const day = row.getAttribute('data-day');
      const iv = Number(row.getAttribute('data-iv'));
      if (!scheduleState[day] || !scheduleState[day][iv]) return;
      const start = row.querySelector('[data-role="start"]')?.value || '09:00';
      const end = row.querySelector('[data-role="end"]')?.value || '17:00';
      scheduleState[day][iv] = { start, end };
    });
    const weekdays = Object.keys(scheduleState)
      .map(Number)
      .filter((d) => scheduleState[String(d)]?.length)
      .sort((a, b) => a - b);
    const first = weekdays.length ? scheduleState[String(weekdays[0])][0] : DEFAULT_INTERVAL;
    return {
      title: document.getElementById('mb-title')?.value || 'Möte',
      slug: document.getElementById('mb-slug')?.value || '',
      description: document.getElementById('mb-description')?.value || '',
      priority: Number(document.getElementById('mb-priority')?.value || 2),
      visible: document.getElementById('mb-visible')?.value !== '0',
      durations: checkedValues('mb-durations'),
      locations,
      schedule: scheduleState,
      weekdays,
      dayStart: first.start,
      dayEnd: first.end,
      bufferBeforeMin: Number(document.getElementById('mb-buf-before')?.value || 0),
      bufferAfterMin: Number(document.getElementById('mb-buf-after')?.value || 0),
      noticeHours: Number(document.getElementById('mb-notice')?.value || 2),
      windowDays: Number(document.getElementById('mb-window')?.value || 28),
      defaultAgenda: document.getElementById('mb-agenda')?.value || '',
      reminder1h: !!document.getElementById('mb-reminder')?.checked,
      icon: document.getElementById('mb-icon')?.value || 'bolt',
      color: document.getElementById('mb-color')?.value || '#13505c'
    };
  }

  function fillForm(link) {
    el.editId.value = link?.id || '';
    el.modalTitle.textContent = link?.id ? 'Redigera möteslänk' : 'Ny möteslänk';
    document.getElementById('mb-title').value = link?.title || 'Möte';
    document.getElementById('mb-slug').value = link?.slug || '';
    document.getElementById('mb-description').value = link?.description || '';
    document.getElementById('mb-priority').value = String(link?.priority || 2);
    document.getElementById('mb-visible').value = link && link.visible === false ? '0' : '1';
    setChecked('mb-durations', link?.durations || [30, 60]);
    const locs = link?.locations || [{ type: 'meet' }];
    document.getElementById('mb-loc-meet').checked = locs.some((l) => l.type === 'meet');
    document.getElementById('mb-loc-phone').checked = locs.some((l) => l.type === 'phone');
    document.getElementById('mb-loc-place').checked = locs.some((l) => l.type === 'place');
    document.getElementById('mb-phone').value = (locs.find((l) => l.type === 'phone') || {}).value || '';
    document.getElementById('mb-place').value = (locs.find((l) => l.type === 'place') || {}).value || '';
    scheduleState = scheduleFromLink(link);
    renderScheduleRows();
    document.getElementById('mb-buf-before').value = link?.bufferBeforeMin || 0;
    document.getElementById('mb-buf-after').value = link?.bufferAfterMin || 0;
    document.getElementById('mb-notice').value = link?.noticeHours ?? 2;
    document.getElementById('mb-window').value = link?.windowDays || 28;
    document.getElementById('mb-agenda').value = link?.defaultAgenda || '';
    const rem = document.getElementById('mb-reminder');
    if (rem) rem.checked = link ? link.reminder1h !== false : true;
    document.getElementById('mb-icon').value = link?.icon || 'bolt';
    document.getElementById('mb-color').value = link?.color || '#13505c';
    if (el.formError) el.formError.hidden = true;
  }

  function openEdit(link) {
    fillForm(link || null);
    if (el.modal) el.modal.hidden = false;
  }

  function closeModal() {
    if (el.modal) el.modal.hidden = true;
  }

  function fmtSlotLabel(start, end) {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const day = s.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
      const t1 = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      const t2 = e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
      return `${day} ${t1}–${t2}`;
    } catch (_) {
      return String(start);
    }
  }

  function renderShareSlots(slots) {
    shareAvailSlots = Array.isArray(slots) ? slots : [];
    if (!el.shareSlots) return;
    if (!shareAvailSlots.length) {
      el.shareSlots.innerHTML = '';
      if (el.shareSlotsEmpty) el.shareSlotsEmpty.hidden = false;
      return;
    }
    if (el.shareSlotsEmpty) el.shareSlotsEmpty.hidden = true;
    el.shareSlots.innerHTML = shareAvailSlots
      .slice(0, 60)
      .map(
        (s, i) => `
      <label class="mb-share-slot">
        <input type="checkbox" data-share-slot="${i}" value="${esc(s.start)}|${esc(s.end)}">
        <span>${esc(fmtSlotLabel(s.start, s.end))}</span>
      </label>`
      )
      .join('');
  }

  function readSuggestedSlots() {
    if (!el.shareSlots) return [];
    return Array.from(el.shareSlots.querySelectorAll('input[type=checkbox]:checked'))
      .map((inp) => {
        const [start, end] = String(inp.value || '').split('|');
        if (!start || !end) return null;
        return { start, end };
      })
      .filter(Boolean);
  }

  async function loadShareAvailability() {
    if (!shareLinkRef?.id) return;
    if (el.shareError) el.shareError.hidden = true;
    const duration = Number(el.shareDuration?.value || shareLinkRef.durations?.[0] || 30);
    if (el.shareLoadSlots) {
      el.shareLoadSlots.disabled = true;
      el.shareLoadSlots.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hämtar...';
    }
    try {
      const data = await api(
        `/api/motesbokning/links/${encodeURIComponent(shareLinkRef.id)}/availability?duration=${encodeURIComponent(duration)}`
      );
      renderShareSlots(data.slots || []);
    } catch (err) {
      renderShareSlots([]);
      if (el.shareError) {
        el.shareError.textContent = err.message || 'Kunde inte hämta tider';
        el.shareError.hidden = false;
      }
    } finally {
      if (el.shareLoadSlots) {
        el.shareLoadSlots.disabled = false;
        el.shareLoadSlots.innerHTML = '<i class="fas fa-sync"></i> Hämta lediga tider';
      }
    }
  }

  function openShare(link) {
    shareLinkRef = link;
    el.shareLinkId.value = link.id;
    if (el.shareLinkName) el.shareLinkName.textContent = link.title || 'Möte';
    el.shareCustomer.value = '';
    el.shareAgenda.value = link.defaultAgenda || '';
    if (el.shareOnlySuggested) el.shareOnlySuggested.checked = false;
    if (el.shareDuration) {
      const durs = Array.isArray(link.durations) && link.durations.length ? link.durations : [30, 60];
      el.shareDuration.innerHTML = durs
        .map((d) => {
          const label = d >= 60 && d % 60 === 0 ? `${d / 60}h` : `${d}m`;
          return `<option value="${d}">${label}</option>`;
        })
        .join('');
    }
    renderShareSlots([]);
    if (el.shareResult) el.shareResult.hidden = true;
    if (el.shareError) el.shareError.hidden = true;
    if (el.shareModal) el.shareModal.hidden = false;
    loadShareAvailability();
  }

  function closeShare() {
    if (el.shareModal) el.shareModal.hidden = true;
    shareLinkRef = null;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text || '');
    } catch (_) {
      prompt('Kopiera länken:', text || '');
    }
  }

  async function load() {
    show(el.loading, true);
    show(el.noAuth, false);
    show(el.setup, false);
    show(el.content, false);
    try {
      const user = window.AuthManager && AuthManager.getUser ? AuthManager.getUser() : null;
      userEmail = (user && (user.email || user.Email)) || '';
      if (!userEmail && window.AuthManager && AuthManager.requireAuth) {
        const ok = await AuthManager.requireAuth();
        if (!ok) {
          show(el.loading, false);
          show(el.noAuth, true);
          return;
        }
        const u2 = AuthManager.getUser();
        userEmail = (u2 && (u2.email || u2.Email)) || '';
      }

      const [linkData, inviteData] = await Promise.all([
        api('/api/motesbokning/links?mine=1'),
        api('/api/motesbokning/invites').catch(() => ({ invites: [] }))
      ]);
      links = Array.isArray(linkData.links) ? linkData.links : [];
      invites = Array.isArray(inviteData.invites) ? inviteData.invites : [];
      renderLinks();
      renderInvites();
      show(el.loading, false);
      show(el.content, true);
    } catch (err) {
      show(el.loading, false);
      if (err.status === 401) {
        show(el.noAuth, true);
        return;
      }
      if (err.status === 503 || (err.data && err.data.needsSetup)) {
        show(el.setup, true);
        return;
      }
      show(el.setup, true);
      if (el.setupMsg) el.setupMsg.textContent = err.message || 'Kunde inte ladda';
    }
  }

  function bind() {
    document.querySelectorAll('.mb-tab').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.getAttribute('data-tab')));
    });
    bindDayToggles();
    el.newBtn?.addEventListener('click', () => openEdit(null));
    document.querySelectorAll('[data-mb-close]').forEach((n) => n.addEventListener('click', closeModal));
    document.querySelectorAll('[data-mb-share-close]').forEach((n) => n.addEventListener('click', closeShare));

    el.form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (el.formError) el.formError.hidden = true;
      const body = readForm();
      if (!body.durations.length) {
        if (el.formError) {
          el.formError.textContent = 'Välj minst en längd.';
          el.formError.hidden = false;
        }
        return;
      }
      if (!body.locations.length) {
        if (el.formError) {
          el.formError.textContent = 'Välj minst en plats/mötesform.';
          el.formError.hidden = false;
        }
        return;
      }
      if (!body.weekdays.length) {
        if (el.formError) {
          el.formError.textContent = 'Välj minst en tillgänglig dag.';
          el.formError.hidden = false;
        }
        return;
      }
      try {
        const id = el.editId.value;
        if (id) {
          await api('/api/motesbokning/links/' + encodeURIComponent(id), { method: 'PATCH', body });
        } else {
          await api('/api/motesbokning/links', { method: 'POST', body });
        }
        closeModal();
        await load();
      } catch (err) {
        if (el.formError) {
          el.formError.textContent = err.message || 'Kunde inte spara';
          el.formError.hidden = false;
        }
      }
    });

    el.setupBtn?.addEventListener('click', async () => {
      if (el.setupMsg) el.setupMsg.textContent = 'Skapar...';
      try {
        await api('/api/setup/airtable-moteslankar', { method: 'POST' });
        await api('/api/setup/airtable-motesbokning', { method: 'POST' }).catch(() => null);
        if (el.setupMsg) el.setupMsg.textContent = 'Klart – laddar om...';
        await load();
      } catch (err) {
        if (el.setupMsg) el.setupMsg.textContent = err.message || 'Misslyckades';
      }
    });

    el.shareLoadSlots?.addEventListener('click', () => loadShareAvailability());
    el.shareDuration?.addEventListener('change', () => loadShareAvailability());

    el.shareCreate?.addEventListener('click', async () => {
      if (el.shareError) el.shareError.hidden = true;
      try {
        const suggestedSlots = readSuggestedSlots();
        const data = await api(
          '/api/motesbokning/links/' + encodeURIComponent(el.shareLinkId.value) + '/share',
          {
            method: 'POST',
            body: {
              agenda: el.shareAgenda?.value || '',
              customerName: el.shareCustomer?.value || '',
              suggestedSlots,
              onlySuggested: !!(el.shareOnlySuggested && el.shareOnlySuggested.checked)
            }
          }
        );
        if (el.shareUrl) el.shareUrl.value = data.url || '';
        if (el.shareResult) el.shareResult.hidden = false;
      } catch (err) {
        if (el.shareError) {
          el.shareError.textContent = err.message || 'Kunde inte skapa inbjudan';
          el.shareError.hidden = false;
        }
      }
    });

    el.shareCopy?.addEventListener('click', () => copyText(el.shareUrl?.value || ''));
    el.copyHost?.addEventListener('click', () => {
      const t = el.openHost?.href || el.hostSlug?.textContent || '';
      copyText(t);
    });
  }

  bind();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
