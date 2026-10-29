/**
 * Publik mötesbokning: engångstoken, möteslänk (?lank=), delning (?dela=)
 * eller central bokningssida (?host=).
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = String(params.get('token') || '').trim();
  const manageToken = String(params.get('hantera') || params.get('manage') || '').trim();
  const linkSlug = String(params.get('lank') || params.get('link') || '').trim();
  const shareToken = String(params.get('dela') || params.get('share') || '').trim();
  const hostKey = String(params.get('host') || '').trim();
  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || window.location.origin;

  const HUB_ICONS = {
    bolt: 'fa-bolt',
    lightbulb: 'fa-lightbulb',
    sun: 'fa-sun',
    comments: 'fa-comments',
    briefcase: 'fa-briefcase'
  };

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
    hubWrap: document.getElementById('boka-hub-wrap'),
    hubAvatar: document.getElementById('boka-hub-avatar'),
    hubTitle: document.getElementById('boka-hub-title'),
    hubWith: document.getElementById('boka-hub-with'),
    hubList: document.getElementById('boka-hub-list'),
    backHub: document.getElementById('boka-back-hub'),
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
    linkPhone: document.getElementById('boka-link-phone'),
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
    duration: null,
    locationId: '',
    month: new Date(),
    selectedDay: '',
    selectedSlot: null,
    slotsByDay: {},
    days: []
  };

  function hideAll() {
    ['loading', 'error', 'done', 'closed', 'formWrap', 'linkWrap', 'hubWrap', 'manage'].forEach((k) => {
      if (el[k]) el[k].classList.add('hidden');
    });
  }

  function locLabel(locations) {
    const locs = locations || [];
    if (!locs.length) return '';
    const first = locs[0];
    if (first.type === 'meet') return 'Google Meet';
    if (first.type === 'phone') return first.value || first.label || 'Telefon';
    return first.value || first.label || 'På plats';
  }

  function fmtDurationsList(arr) {
    return (arr || [])
      .map((n) => fmtDur(n))
      .join(', ')
      .replace(/, ([^,]+)$/, ' eller $1');
  }

  function hubUrlFor(key) {
    return `boka-mote.html?host=${encodeURIComponent(key)}`;
  }

  function looksLikeHtml(s) {
    return /<\/?[a-z][\s\S]*>/i.test(String(s || ''));
  }

  function htmlToPlainText(html) {
    return String(html || '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Visa beskrivning som HTML (servern har redan sanerat). Fallback: radbryt vanlig text. */
  function setDescriptionHtml(node, raw) {
    if (!node) return;
    const s = String(raw || '').trim();
    if (!s) {
      node.innerHTML = '';
      return;
    }
    if (looksLikeHtml(s)) {
      node.innerHTML = s;
      return;
    }
    node.innerHTML = esc(s).replace(/\r\n|\r|\n/g, '<br>');
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
    const qs = {};
    if (linkState.duration) qs.duration = linkState.duration;
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

  function locDetailText(loc) {
    const type = String(loc?.type || '').toLowerCase();
    const value = String(loc?.value || '').trim();
    if (!value) return '';
    if (type === 'place') return value;
    if (type === 'phone') return value;
    return '';
  }

  function hostPhoneFromLink() {
    const locs = linkState.link?.locations || [];
    const phone = locs.find((l) => String(l.type || '').toLowerCase() === 'phone');
    return String(phone?.value || '').trim();
  }

  function renderLocs(locations) {
    const locs = locations || [];
    if (!locs.length) {
      el.locs.innerHTML = '';
      return;
    }
    // Ingen plats förvald – kunden måste välja
    if (linkState.locationId && !locs.some((l) => l.id === linkState.locationId)) {
      linkState.locationId = '';
    }
    el.locs.innerHTML = locs
      .map((loc) => {
        const detail = locDetailText(loc);
        const on = loc.id === linkState.locationId;
        return `
      <label class="boka-loc${on ? ' is-selected' : ''}">
        <input type="radio" name="boka-loc" value="${esc(loc.id)}" ${on ? 'checked' : ''}>
        <span class="boka-loc-label">${esc(loc.label || loc.type || 'Plats')}</span>
        ${detail ? `<span class="boka-loc-detail">${esc(detail)}</span>` : ''}
      </label>`;
      })
      .join('');
    el.locs.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () => {
        linkState.locationId = inp.value;
        clearPickHint();
        el.locs.querySelectorAll('.boka-loc').forEach((n) => n.classList.toggle('is-selected', n.querySelector('input')?.value === inp.value));
        updateNext();
      });
    });
  }

  function renderDurs(durations) {
    const durs = durations || [30];
    // Ingen längd förvald – kunden måste välja
    if (linkState.duration != null && !durs.includes(linkState.duration)) {
      linkState.duration = null;
    }
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
        clearPickHint();
        el.durs.querySelectorAll('[data-dur]').forEach((b) => {
          b.classList.toggle('is-selected', Number(b.getAttribute('data-dur')) === linkState.duration);
        });
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
    if (!linkState.duration) {
      el.times.innerHTML = '';
      if (el.timesEmpty) {
        el.timesEmpty.hidden = false;
        el.timesEmpty.textContent = 'Välj längd först.';
      }
      updateNext();
      return;
    }
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

  function pickReady() {
    return !!(
      linkState.locationId &&
      linkState.duration &&
      linkState.selectedSlot &&
      linkState.selectedSlot.start
    );
  }

  function updateNext() {
    if (!el.next) return;
    const ready = pickReady();
    el.next.disabled = false;
    el.next.classList.toggle('is-ready', ready);
    el.next.setAttribute('aria-disabled', ready ? 'false' : 'true');
    if (!linkState.locationId) el.next.title = 'Välj mötesplats först';
    else if (!linkState.duration) el.next.title = 'Välj längd först';
    else if (!linkState.selectedSlot?.start) el.next.title = 'Välj en tid först';
    else el.next.title = 'Fortsätt till bekräftelse';
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
    // Visa lediga tider först när kunden valt längd
    if (linkState.duration) {
      linkState.slotsByDay = data.slotsByDay || {};
      linkState.days = data.days || Object.keys(linkState.slotsByDay);
    } else {
      linkState.slotsByDay = {};
      linkState.days = [];
      linkState.selectedDay = '';
      linkState.selectedSlot = null;
    }
    if (data.share && data.share.agenda != null) {
      linkState.hostAgenda = String(data.share.agenda || '');
    } else {
      linkState.hostAgenda = String(linkState.link.defaultAgenda || '');
    }
    if (el.linkTitle) el.linkTitle.textContent = linkState.link.title || 'Möte';
    if (el.linkDesc) setDescriptionHtml(el.linkDesc, linkState.link.description || '');
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
    if (!linkState.locationId) {
      showPickHint('Välj mötesplats (t.ex. Google Meet, telefon eller på plats).');
      return;
    }
    if (!linkState.duration) {
      showPickHint('Välj längd först.');
      return;
    }
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
    const loc = (linkState.link.locations || []).find((l) => l.id === linkState.locationId);
    if (!loc) {
      showPickHint('Välj mötesplats först.');
      return;
    }
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
      const type = String(loc?.type || '').toLowerCase();
      const icon = type === 'place' ? 'fa-map-marker-alt' : type === 'phone' ? 'fa-phone' : 'fa-video';
      const placeLine = type === 'place'
        ? (loc?.value || loc?.label || 'På plats')
        : type === 'phone'
          ? (loc?.value ? `Telefon ${loc.value}` : (loc?.label || 'Telefon'))
          : (loc?.label || 'Google Meet');
      const hostPhone = hostPhoneFromLink();
      const phoneBits = [];
      if (hostPhone) phoneBits.push(`Värd: ${hostPhone}`);
      el.summary.innerHTML = `
        <p><i class="far fa-calendar"></i> ${esc(dateStr)}</p>
        <p><i class="far fa-clock"></i> ${esc(t1)} – ${esc(t2)}</p>
        <p><i class="fas ${icon}"></i> ${esc(placeLine)}</p>
        ${phoneBits.length ? `<p><i class="fas fa-phone"></i> ${esc(phoneBits.join(' · '))}</p>` : ''}`;
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
    const phone = String(el.linkPhone?.value || '').trim();
    if (!name.trim()) {
      if (el.linkError) {
        el.linkError.textContent = 'Namn krävs.';
        el.linkError.classList.remove('hidden');
      }
      return;
    }
    if (!phone) {
      if (el.linkError) {
        el.linkError.textContent = 'Telefonnummer krävs.';
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
            phone,
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
        const bits = [data.location || data.meetingType || ''];
        if (data.hostPhone) bits.push(`Värd: ${data.hostPhone}`);
        if (data.bookerPhone) bits.push(`Bokare: ${data.bookerPhone}`);
        el.manageWhere.textContent = bits.filter(Boolean).join(' · ');
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

  async function loadHostPage() {
    show('loading');
    try {
      const res = await fetch(
        `${baseUrl}/api/motesbokning/public/host/${encodeURIComponent(hostKey)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Bokningssidan hittades inte');
      const host = data.host || {};
      const list = Array.isArray(data.links) ? data.links : [];
      if (el.hubAvatar) el.hubAvatar.textContent = hostInitial(host.email || host.displayName || hostKey);
      if (el.hubTitle) el.hubTitle.textContent = 'Välj mötestyp';
      if (el.hubWith) {
        el.hubWith.textContent = host.displayName
          ? `Med ${host.displayName}`
          : '';
      }
      if (el.hubList) {
        el.hubList.innerHTML = list.map((link) => {
          const icon = HUB_ICONS[link.icon] || 'fa-bolt';
          const color = esc(link.color || '#13505c');
          const desc = htmlToPlainText(link.description || '');
          const meta = [fmtDurationsList(link.durations), locLabel(link.locations)].filter(Boolean).join(' · ');
          const href = link.url
            || `boka-mote.html?lank=${encodeURIComponent(link.slug)}&host=${encodeURIComponent(host.key || hostKey)}`;
          return `
            <a class="boka-hub-card" role="listitem" href="${esc(href)}">
              <span class="boka-hub-icon" style="background:${color}"><i class="fas ${icon}"></i></span>
              <span>
                <h2>${esc(link.title || 'Möte')}</h2>
                ${desc ? `<p>${esc(desc.length > 140 ? desc.slice(0, 137) + '…' : desc)}</p>` : ''}
                ${meta ? `<p class="boka-hub-meta">${esc(meta)}</p>` : ''}
              </span>
              <i class="fas fa-chevron-right boka-hub-chevron" aria-hidden="true"></i>
            </a>`;
        }).join('');
      }
      if (el.root) el.root.classList.add('boka-wrap--narrow');
      show('hubWrap');
    } catch (err) {
      show('error');
      if (el.errorText) el.errorText.textContent = err.message || 'Kunde inte ladda bokningssidan.';
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
      if (el.backHub) {
        if (hostKey) {
          el.backHub.classList.remove('hidden');
          el.backHub.href = hubUrlFor(hostKey);
        } else {
          el.backHub.classList.add('hidden');
        }
      }
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
  } else if (hostKey) {
    loadHostPage();
  } else {
    loadToken();
  }
})();
