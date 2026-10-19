/**
 * Publik mötesbokning: engångstoken, möteslänk (?lank=) eller delning (?dela=).
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = String(params.get('token') || '').trim();
  const manageToken = String(params.get('hantera') || params.get('manage') || '').trim();
  const linkSlug = String(params.get('lank') || params.get('link') || '').trim();
  const shareToken = String(params.get('dela') || params.get('share') || '').trim();
  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || window.location.origin;

  const el = {
    loading: document.getElementById('boka-loading'),
    error: document.getElementById('boka-error'),
    errorText: document.getElementById('boka-error-text'),
    done: document.getElementById('boka-done'),
    doneText: document.getElementById('boka-done-text'),
    closed: document.getElementById('boka-closed'),
    formWrap: document.getElementById('boka-form-wrap'),
    form: document.getElementById('boka-form'),
    title: document.getElementById('boka-title'),
    message: document.getElementById('boka-message'),
    meta: document.getElementById('boka-meta'),
    slots: document.getElementById('boka-slots'),
    name: document.getElementById('boka-name'),
    email: document.getElementById('boka-email'),
    note: document.getElementById('boka-note'),
    submit: document.getElementById('boka-submit'),
    formError: document.getElementById('boka-form-error'),
    linkWrap: document.getElementById('boka-link-wrap'),
    linkTitle: document.getElementById('boka-link-title'),
    linkHost: document.getElementById('boka-link-host'),
    linkDesc: document.getElementById('boka-link-desc'),
    avatar: document.getElementById('boka-avatar'),
    locs: document.getElementById('boka-locs'),
    durs: document.getElementById('boka-durs'),
    cal: document.getElementById('boka-cal'),
    calLabel: document.getElementById('boka-cal-label'),
    calPrev: document.getElementById('boka-cal-prev'),
    calNext: document.getElementById('boka-cal-next'),
    times: document.getElementById('boka-times'),
    timesEmpty: document.getElementById('boka-times-empty'),
    next: document.getElementById('boka-next'),
    stepPick: document.getElementById('boka-step-pick'),
    stepConfirm: document.getElementById('boka-step-confirm'),
    summary: document.getElementById('boka-summary'),
    linkName: document.getElementById('boka-link-name'),
    linkEmail: document.getElementById('boka-link-email'),
    linkAgenda: document.getElementById('boka-link-agenda'),
    agendaLabel: document.getElementById('boka-agenda-label'),
    linkError: document.getElementById('boka-link-error'),
    back: document.getElementById('boka-back'),
    confirm: document.getElementById('boka-confirm'),
    doneMail: document.getElementById('boka-done-mail'),
    manage: document.getElementById('boka-manage'),
    manageTitle: document.getElementById('boka-manage-title'),
    manageMeta: document.getElementById('boka-manage-meta'),
    manageWhen: document.getElementById('boka-manage-when'),
    manageWhere: document.getElementById('boka-manage-where'),
    manageAgenda: document.getElementById('boka-manage-agenda'),
    manageSaveAgenda: document.getElementById('boka-manage-save-agenda'),
    manageReschedule: document.getElementById('boka-manage-reschedule'),
    manageCancel: document.getElementById('boka-manage-cancel'),
    manageSlotsWrap: document.getElementById('boka-manage-slots-wrap'),
    manageSlots: document.getElementById('boka-manage-slots'),
    manageError: document.getElementById('boka-manage-error'),
    manageOk: document.getElementById('boka-manage-ok'),
    root: document.getElementById('boka-root')
  };

  let manageState = { token: manageToken, linkSlug: '', data: null };

  let selectedSlotId = '';
  let linkState = {
    slug: linkSlug,
    shareToken: shareToken,
    hostAgenda: '',
    link: null,
    duration: 30,
    locationId: '',
    month: new Date(),
    selectedDay: '',
    selectedSlot: null,
    slotsByDay: {},
    days: []
  };

  function hideAll() {
    ['loading', 'error', 'done', 'closed', 'formWrap', 'linkWrap', 'manage'].forEach((k) => {
      if (el[k]) el[k].classList.add('hidden');
    });
  }

  function setManageMsg(okText, errText) {
    if (el.manageOk) {
      el.manageOk.textContent = okText || '';
      el.manageOk.classList.toggle('hidden', !okText);
    }
    if (el.manageError) {
      el.manageError.textContent = errText || '';
      el.manageError.classList.toggle('hidden', !errText);
    }
  }

  function show(key) {
    hideAll();
    if (el[key]) el[key].classList.remove('hidden');
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function fmtRange(start, end) {
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const date = s.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    const t1 = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const t2 = e ? e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
    return t2 ? `${date} · ${t1}–${t2}` : `${date} · ${t1}`;
  }

  function fmtDur(m) {
    const n = Number(m);
    if (n >= 60 && n % 60 === 0) return `${n / 60}h`;
    if (n >= 60) return `${Math.floor(n / 60)}h ${n % 60}m`;
    return `${n}m`;
  }

  function hostInitial(email) {
    const local = String(email || 'M').split('@')[0] || 'M';
    return local.charAt(0).toUpperCase();
  }

  /* —— Legacy token invite —— */
  function renderSlots(slots) {
    if (!slots.length) {
      el.slots.innerHTML = '<p class="boka-meta">Inga lediga tider just nu.</p>';
      return;
    }
    el.slots.innerHTML = slots
      .map(
        (slot) => `
      <button type="button" class="boka-slot" data-slot="${esc(slot.id)}" role="radio" aria-checked="false">
        <span>${esc(fmtRange(slot.start, slot.end))}</span>
      </button>`
      )
      .join('');
    el.slots.querySelectorAll('[data-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedSlotId = btn.getAttribute('data-slot') || '';
        el.slots.querySelectorAll('.boka-slot').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-selected', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      });
    });
  }

  async function loadToken() {
    if (!token) {
      show('error');
      if (el.errorText) el.errorText.textContent = 'Länken saknar token.';
      return;
    }
    show('loading');
    try {
      const res = await fetch(`${baseUrl}/api/motesbokning/public/${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      if (data.status === 'Stängd' || data.status === 'Avbokad') {
        show('closed');
        return;
      }
      if (data.status === 'Bokad' && data.booked) {
        show('done');
        if (el.doneText) el.doneText.textContent = `Bokad tid: ${fmtRange(data.booked.start, data.booked.end)}`;
        return;
      }

      if (el.title) el.title.textContent = data.title || 'Boka möte';
      if (el.message) {
        el.message.textContent = data.message || 'Välj en tid som passar dig.';
        el.message.style.display = data.message ? '' : 'none';
      }
      const bits = [];
      if (data.meetingType) bits.push(data.meetingType);
      if (data.location) bits.push(data.location);
      if (el.meta) el.meta.textContent = bits.join(' · ');
      renderSlots(Array.isArray(data.slots) ? data.slots : []);
      show('formWrap');
      if (el.root) el.root.classList.add('boka-wrap--narrow');
    } catch (err) {
      show('error');
      if (el.errorText) el.errorText.textContent = err.message || 'Kunde inte ladda inbjudan.';
    }
  }

  el.form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (el.formError) el.formError.classList.add('hidden');
    if (!selectedSlotId) {
      if (el.formError) {
        el.formError.textContent = 'Välj en tid först.';
        el.formError.classList.remove('hidden');
      }
      return;
    }
    if (el.submit) {
      el.submit.disabled = true;
      el.submit.textContent = 'Bokar...';
    }
    try {
      const res = await fetch(`${baseUrl}/api/motesbokning/public/${encodeURIComponent(token)}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotId: selectedSlotId,
          name: el.name?.value || '',
          email: el.email?.value || '',
          note: el.note?.value || ''
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      show('done');
      if (el.doneText && data.booked) {
        el.doneText.textContent = `Bokad tid: ${fmtRange(data.booked.start, data.booked.end)}`;
      }
    } catch (err) {
      if (el.formError) {
        el.formError.textContent = err.message || 'Kunde inte boka';
        el.formError.classList.remove('hidden');
      }
    } finally {
      if (el.submit) {
        el.submit.disabled = false;
        el.submit.textContent = 'Boka tid';
      }
    }
  });

  /* —— Link / share flow —— */
  function apiUrl(path, qs) {
    const q = new URLSearchParams(qs || {});
    const s = q.toString();
    return `${baseUrl}${path}${s ? `?${s}` : ''}`;
  }

  async function fetchLinkAvailability() {
    const qs = { duration: linkState.duration };
    let url;
    if (linkState.shareToken) {
      url = apiUrl(`/api/motesbokning/public/share/${encodeURIComponent(linkState.shareToken)}`, qs);
    } else {
      url = apiUrl(`/api/motesbokning/public/link/${encodeURIComponent(linkState.slug)}`, qs);
    }
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function renderLocs(locations) {
    const locs = locations || [];
    if (!locs.length) {
      el.locs.innerHTML = '';
      return;
    }
    if (!linkState.locationId) linkState.locationId = locs[0].id;
    el.locs.innerHTML = locs
      .map(
        (loc) => `
      <label class="boka-loc${loc.id === linkState.locationId ? ' is-selected' : ''}">
        <input type="radio" name="boka-loc" value="${esc(loc.id)}" ${loc.id === linkState.locationId ? 'checked' : ''}>
        <span>${esc(loc.label || loc.value || loc.type)}</span>
      </label>`
      )
      .join('');
    el.locs.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        linkState.locationId = inp.value;
        el.locs.querySelectorAll('.boka-loc').forEach((n) => n.classList.toggle('is-selected', n.querySelector('input')?.value === inp.value));
      });
    });
  }

  function renderDurs(durations) {
    const durs = durations || [30];
    if (!durs.includes(linkState.duration)) linkState.duration = durs[0];
    el.durs.innerHTML = durs
      .map(
        (d) =>
          `<button type="button" class="${d === linkState.duration ? 'is-selected' : ''}" data-dur="${d}">${esc(fmtDur(d))}</button>`
      )
      .join('');
    el.durs.querySelectorAll('[data-dur]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        linkState.duration = Number(btn.getAttribute('data-dur'));
        linkState.selectedDay = '';
        linkState.selectedSlot = null;
        updateNext();
        await refreshSlots();
      });
    });
  }

  function monthLabel(d) {
    return d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  }

  function renderCalendar() {
    const y = linkState.month.getFullYear();
    const m = linkState.month.getMonth();
    if (el.calLabel) el.calLabel.textContent = monthLabel(linkState.month);
    const first = new Date(y, m, 1);
    const startPad = (first.getDay() + 6) % 7; // mån=0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const available = new Set(linkState.days || []);
    const todayIso = new Date().toISOString().slice(0, 10);
    const wd = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];
    let html = wd.map((w) => `<div class="boka-cal-wd">${w}</div>`).join('');
    for (let i = 0; i < startPad; i++) html += '<div></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const avail = available.has(iso);
      const cls = [
        'boka-cal-day',
        avail ? 'is-available' : '',
        iso === linkState.selectedDay ? 'is-selected' : '',
        iso === todayIso ? 'is-today' : ''
      ]
        .filter(Boolean)
        .join(' ');
      html += `<button type="button" class="${cls}" data-day="${iso}" ${avail ? '' : 'disabled'}>${day}</button>`;
    }
    el.cal.innerHTML = html;
    el.cal.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        linkState.selectedDay = btn.getAttribute('data-day') || '';
        linkState.selectedSlot = null;
        renderCalendar();
        renderTimes();
        updateNext();
      });
    });
  }

  function selectSlot(start, end) {
    if (!start || !end) return;
    linkState.selectedSlot = { start, end };
    clearPickHint();
    renderTimes();
    updateNext();
  }

  function clearPickHint() {
    const hint = document.getElementById('boka-next-hint');
    if (hint) {
      hint.textContent = '';
      hint.classList.add('hidden');
    }
  }

  function showPickHint(msg) {
    const hint = document.getElementById('boka-next-hint');
    if (hint) {
      hint.textContent = msg || 'Välj en tid först.';
      hint.classList.remove('hidden');
    }
  }

  function renderTimes() {
    const slots = (linkState.slotsByDay && linkState.slotsByDay[linkState.selectedDay]) || [];
    if (!linkState.selectedDay || !slots.length) {
      el.times.innerHTML = '';
      if (el.timesEmpty) {
        el.timesEmpty.hidden = false;
        el.timesEmpty.textContent = linkState.selectedDay
          ? 'Inga lediga tider den dagen.'
          : 'Välj en ledig dag först.';
      }
      updateNext();
      return;
    }
    if (el.timesEmpty) el.timesEmpty.hidden = true;

    // En enda lucka → välj automatiskt så Nästa fungerar direkt
    if (slots.length === 1) {
      const only = slots[0];
      if (!linkState.selectedSlot || linkState.selectedSlot.start !== only.start) {
        linkState.selectedSlot = { start: only.start, end: only.end };
      }
    } else if (
      linkState.selectedSlot &&
      !slots.some((s) => s.start === linkState.selectedSlot.start)
    ) {
      linkState.selectedSlot = null;
    }

    const ordered = slots.slice().sort((a, b) => {
      const ap = a.preferred ? 0 : 1;
      const bp = b.preferred ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(a.start).localeCompare(String(b.start));
    });
    const hasPreferred = ordered.some((s) => s.preferred);
    el.times.innerHTML =
      ordered
        .map((s) => {
          const t = new Date(s.start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
          const on = linkState.selectedSlot && linkState.selectedSlot.start === s.start;
          const pref = s.preferred
            ? '<span class="boka-pref-dot" title="Föreslagen tid" aria-hidden="true"></span>'
            : '<span class="boka-pref-dot boka-pref-dot--off" aria-hidden="true"></span>';
          return `<button type="button" class="boka-time${on ? ' is-selected' : ''}${s.preferred ? ' is-preferred' : ''}" data-start="${esc(s.start)}" data-end="${esc(s.end)}">
          ${pref}<span>${esc(t)}</span>
        </button>`;
        })
        .join('') +
      (hasPreferred
        ? '<p class="boka-hint" style="margin-top:0.5rem;"><span class="boka-pref-dot" style="display:inline-block;vertical-align:middle;"></span> Föreslagen tid</p>'
        : '');
    el.times.querySelectorAll('.boka-time').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectSlot(btn.getAttribute('data-start'), btn.getAttribute('data-end'));
      });
    });
    updateNext();
  }

  function updateNext() {
    if (!el.next) return;
    const ready = !!(linkState.selectedSlot && linkState.selectedSlot.start);
    el.next.disabled = false;
    el.next.classList.toggle('is-ready', ready);
    el.next.setAttribute('aria-disabled', ready ? 'false' : 'true');
    el.next.title = ready ? 'Fortsätt till bekräftelse' : 'Välj en tid först';
  }

  async function refreshSlots() {
    show('loading');
    try {
      const data = await fetchLinkAvailability();
      applyLinkData(data);
      show('linkWrap');
      el.stepPick?.classList.remove('hidden');
      el.stepConfirm?.classList.add('hidden');
    } catch (err) {
      show('error');
      if (el.errorText) el.errorText.textContent = err.message || 'Kunde inte ladda tider.';
    }
  }

  function applyLinkData(data) {
    linkState.link = data.link || {};
    linkState.slotsByDay = data.slotsByDay || {};
    linkState.days = data.days || Object.keys(linkState.slotsByDay);
    linkState.duration = data.duration || linkState.duration;
    if (data.share && data.share.agenda != null) {
      linkState.hostAgenda = String(data.share.agenda || '');
    } else {
      linkState.hostAgenda = String(linkState.link.defaultAgenda || '');
    }
    if (el.linkTitle) el.linkTitle.textContent = linkState.link.title || 'Möte';
    if (el.linkDesc) el.linkDesc.textContent = linkState.link.description || '';
    if (el.linkHost) {
      const host = linkState.link.hostEmail || '';
      el.linkHost.textContent = host ? `med ${host.split('@')[0]}` : '';
    }
    if (el.avatar) el.avatar.textContent = hostInitial(linkState.link.hostEmail);
    renderLocs(linkState.link.locations);
    renderDurs(linkState.link.durations);
    renderCalendar();
    renderTimes();
    updateNext();
  }

  function goConfirm() {
    // Om tid saknas men det finns luckor: välj den enda, annars visa tipset
    if (!linkState.selectedSlot || !linkState.selectedSlot.start) {
      const slots = (linkState.slotsByDay && linkState.slotsByDay[linkState.selectedDay]) || [];
      if (slots.length === 1) {
        linkState.selectedSlot = { start: slots[0].start, end: slots[0].end };
      } else if (!linkState.selectedDay) {
        showPickHint('Välj en dag och tid först.');
        return;
      } else if (!slots.length) {
        showPickHint('Inga lediga tider den dagen.');
        return;
      } else {
        showPickHint('Välj en tid i listan till höger.');
        return;
      }
    }
    clearPickHint();
    const loc =
      (linkState.link.locations || []).find((l) => l.id === linkState.locationId) ||
      (linkState.link.locations || [])[0];
    const start = linkState.selectedSlot.start;
    const end = linkState.selectedSlot.end;
    const dateStr = new Date(start).toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const t1 = new Date(start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const t2 = new Date(end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    if (el.summary) {
      el.summary.innerHTML = `
        <p><i class="far fa-calendar"></i> ${esc(dateStr)}</p>
        <p><i class="far fa-clock"></i> ${esc(t1)} – ${esc(t2)}</p>
        <p><i class="fas fa-video"></i> ${esc(loc?.label || loc?.value || 'Möte')}</p>`;
    }
    if (el.linkAgenda) el.linkAgenda.value = linkState.hostAgenda || '';
    if (el.agendaLabel) {
      const host = (linkState.link.hostEmail || '').split('@')[0] || 'värden';
      el.agendaLabel.textContent = `Meddelande till ${host}`;
    }
    el.stepPick?.classList.add('hidden');
    el.stepConfirm?.classList.remove('hidden');
  }

  async function confirmBook() {
    if (el.linkError) el.linkError.classList.add('hidden');
    const name = el.linkName?.value || '';
    if (!name.trim()) {
      if (el.linkError) {
        el.linkError.textContent = 'Namn krävs.';
        el.linkError.classList.remove('hidden');
      }
      return;
    }
    if (el.confirm) {
      el.confirm.disabled = true;
      el.confirm.textContent = 'Bokar...';
    }
    try {
      const slug = linkState.slug || linkState.link?.slug;
      const res = await fetch(
        `${baseUrl}/api/motesbokning/public/link/${encodeURIComponent(slug)}/book`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email: el.linkEmail?.value || '',
            start: linkState.selectedSlot.start,
            end: linkState.selectedSlot.end,
            locationId: linkState.locationId,
            agenda: el.linkAgenda?.value || '',
            hostAgenda: linkState.hostAgenda || '',
            shareToken: linkState.shareToken || ''
          })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || data.message || `Kunde inte boka (fel ${res.status})`;
        throw new Error(msg);
      }
      show('done');
      if (el.doneText && data.invite) {
        el.doneText.textContent = `Bokad tid: ${fmtRange(data.invite.bookedStart, data.invite.bookedEnd)}`;
      }
      if (el.doneMail) el.doneMail.hidden = false;
    } catch (err) {
      if (el.linkError) {
        el.linkError.textContent = err.message || 'Kunde inte boka';
        el.linkError.classList.remove('hidden');
      }
    } finally {
      if (el.confirm) {
        el.confirm.disabled = false;
        el.confirm.textContent = 'Bekräfta';
      }
    }
  }

  async function loadManage() {
    show('loading');
    try {
      const res = await fetch(
        `${baseUrl}/api/motesbokning/public/${encodeURIComponent(manageState.token)}/manage`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Kunde inte hämta bokning (${res.status})`);
      manageState.data = data;
      manageState.linkSlug = data.linkSlug || '';
      if (el.manageTitle) el.manageTitle.textContent = data.title || 'Hantera bokning';
      if (el.manageMeta) {
        el.manageMeta.textContent = data.bookerName
          ? `Bokat av ${data.bookerName}`
          : (data.canEdit ? 'Aktiv bokning' : `Status: ${data.status || ''}`);
      }
      if (el.manageWhen) {
        el.manageWhen.textContent = data.bookedStart
          ? fmtRange(data.bookedStart, data.bookedEnd)
          : 'Ingen tid bokad';
      }
      if (el.manageWhere) {
        el.manageWhere.textContent = data.location || data.meetingType || '';
      }
      if (el.manageAgenda) el.manageAgenda.value = data.note || '';
      const can = !!data.canEdit;
      if (el.manageSaveAgenda) el.manageSaveAgenda.disabled = !can;
      if (el.manageReschedule) el.manageReschedule.disabled = !can || !manageState.linkSlug;
      if (el.manageCancel) el.manageCancel.disabled = !can;
      if (el.manageSlotsWrap) el.manageSlotsWrap.classList.add('hidden');
      setManageMsg('', '');
      show('manage');
    } catch (err) {
      show('error');
      if (el.errorText) el.errorText.textContent = err.message || 'Kunde inte öppna bokningen.';
    }
  }

  async function manageSaveAgenda() {
    setManageMsg('', '');
    try {
      const res = await fetch(
        `${baseUrl}/api/motesbokning/public/${encodeURIComponent(manageState.token)}/agenda`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agenda: el.manageAgenda?.value || '' })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kunde inte spara agenda');
      setManageMsg('Agendan är sparad.', '');
    } catch (err) {
      setManageMsg('', err.message || 'Kunde inte spara');
    }
  }

  async function manageCancel() {
    if (!confirm('Vill du avboka mötet?')) return;
    setManageMsg('', '');
    try {
      const res = await fetch(
        `${baseUrl}/api/motesbokning/public/${encodeURIComponent(manageState.token)}/cancel`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kunde inte avboka');
      setManageMsg('Mötet är avbokat.', '');
      if (el.manageSaveAgenda) el.manageSaveAgenda.disabled = true;
      if (el.manageReschedule) el.manageReschedule.disabled = true;
      if (el.manageCancel) el.manageCancel.disabled = true;
    } catch (err) {
      setManageMsg('', err.message || 'Kunde inte avboka');
    }
  }

  async function manageReschedule() {
    setManageMsg('', '');
    if (!manageState.linkSlug) {
      setManageMsg('', 'Ombokning kräver en möteslänk.');
      return;
    }
    if (el.manageSlotsWrap) el.manageSlotsWrap.classList.remove('hidden');
    if (el.manageSlots) el.manageSlots.innerHTML = '<p class="boka-hint">Hämtar lediga tider...</p>';
    try {
      const qs = new URLSearchParams({ days: '14' });
      const res = await fetch(
        `${baseUrl}/api/motesbokning/public/link/${encodeURIComponent(manageState.linkSlug)}?${qs}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Kunde inte hämta tider');
      const slots = Array.isArray(data.slots) ? data.slots : [];
      if (!slots.length) {
        el.manageSlots.innerHTML = '<p class="boka-hint">Inga lediga tider just nu.</p>';
        return;
      }
      el.manageSlots.innerHTML = slots.slice(0, 40).map((s) => `
        <button type="button" class="boka-slot" data-start="${esc(s.start)}" data-end="${esc(s.end)}">
          ${esc(fmtRange(s.start, s.end))}
        </button>
      `).join('');
      el.manageSlots.querySelectorAll('.boka-slot').forEach((btn) => {
        btn.addEventListener('click', async () => {
          setManageMsg('', '');
          try {
            const r = await fetch(
              `${baseUrl}/api/motesbokning/public/${encodeURIComponent(manageState.token)}/reschedule`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: btn.dataset.start, end: btn.dataset.end })
              }
            );
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(body.error || 'Kunde inte omboka');
            if (el.manageWhen) {
              el.manageWhen.textContent = fmtRange(body.bookedStart, body.bookedEnd);
            }
            if (el.manageSlotsWrap) el.manageSlotsWrap.classList.add('hidden');
            setManageMsg('Ny tid är sparad. En uppdatering syns i kalendern.', '');
          } catch (err) {
            setManageMsg('', err.message || 'Kunde inte omboka');
          }
        });
      });
    } catch (err) {
      setManageMsg('', err.message || 'Kunde inte hämta tider');
    }
  }

  async function loadLinkOrShare() {
    show('loading');
    try {
      if (shareToken && !linkSlug) {
        // slug comes from share payload
      }
      const data = await fetchLinkAvailability();
      if (data.link?.slug) linkState.slug = data.link.slug;
      applyLinkData(data);
      show('linkWrap');
    } catch (err) {
      show('error');
      if (el.errorText) el.errorText.textContent = err.message || 'Kunde inte ladda länken.';
    }
  }

  el.calPrev?.addEventListener('click', () => {
    linkState.month = new Date(linkState.month.getFullYear(), linkState.month.getMonth() - 1, 1);
    renderCalendar();
  });
  el.calNext?.addEventListener('click', () => {
    linkState.month = new Date(linkState.month.getFullYear(), linkState.month.getMonth() + 1, 1);
    renderCalendar();
  });
  el.next?.addEventListener('click', goConfirm);
  el.back?.addEventListener('click', () => {
    el.stepConfirm?.classList.add('hidden');
    el.stepPick?.classList.remove('hidden');
  });
  el.confirm?.addEventListener('click', confirmBook);
  el.manageSaveAgenda?.addEventListener('click', manageSaveAgenda);
  el.manageCancel?.addEventListener('click', manageCancel);
  el.manageReschedule?.addEventListener('click', manageReschedule);

  if (manageToken) {
    loadManage();
  } else if (linkSlug || shareToken) {
    loadLinkOrShare();
  } else {
    loadToken();
  }
})();
