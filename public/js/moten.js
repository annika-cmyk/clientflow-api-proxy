/**
 * Byrå-UI: mötesbokning – skapa tidsluckor och kundlänkar.
 */
(function () {
  'use strict';

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || '';

  const el = {
    loading: document.getElementById('mot-loading'),
    noAuth: document.getElementById('mot-no-auth'),
    setup: document.getElementById('mot-setup'),
    setupBtn: document.getElementById('mot-setup-btn'),
    setupMsg: document.getElementById('mot-setup-msg'),
    content: document.getElementById('mot-content'),
    list: document.getElementById('mot-list'),
    newBtn: document.getElementById('mot-new'),
    modal: document.getElementById('mot-modal'),
    form: document.getElementById('mot-form'),
    title: document.getElementById('mot-title'),
    message: document.getElementById('mot-message'),
    type: document.getElementById('mot-type'),
    location: document.getElementById('mot-location'),
    customerName: document.getElementById('mot-customer-name'),
    slots: document.getElementById('mot-slots'),
    addSlot: document.getElementById('mot-add-slot'),
    save: document.getElementById('mot-save'),
    formError: document.getElementById('mot-form-error')
  };

  let invites = [];

  function authOpts() {
    return window.AuthManager && AuthManager.getAuthFetchOptions
      ? AuthManager.getAuthFetchOptions()
      : { headers: { 'Content-Type': 'application/json' } };
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

  function fmt(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('sv-SE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return String(iso);
    }
  }

  function fmtRange(start, end) {
    if (!start) return '—';
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const date = s.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
    const t1 = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const t2 = e ? e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
    return t2 ? `${date} ${t1}–${t2}` : `${date} ${t1}`;
  }

  function badgeClass(status) {
    if (status === 'Bokad') return 'moten-badge moten-badge--bokad';
    if (status === 'Stängd') return 'moten-badge moten-badge--stangd';
    if (status === 'Avbokad') return 'moten-badge moten-badge--avbokad';
    return 'moten-badge';
  }

  function cardClass(status) {
    if (status === 'Bokad') return 'moten-card moten-card--bokad';
    if (status === 'Stängd') return 'moten-card moten-card--stangd';
    if (status === 'Avbokad') return 'moten-card moten-card--avbokad';
    return 'moten-card';
  }

  function toLocalInputValue(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function defaultSlotStart() {
    const d = new Date();
    d.setSeconds(0, 0);
    const rounded = Math.ceil(d.getMinutes() / 15) * 15;
    if (rounded >= 60) d.setHours(d.getHours() + 1, 0, 0, 0);
    else d.setMinutes(rounded, 0, 0);
    if (d.getHours() < 9) d.setHours(9, 0, 0, 0);
    return d;
  }

  function addSlotRow(startDate, endDate) {
    if (!el.slots) return;
    const start = startDate || defaultSlotStart();
    const end = endDate || new Date(start.getTime() + 60 * 60 * 1000);
    const row = document.createElement('div');
    row.className = 'moten-slot-row';
    row.innerHTML =
      '<input type="datetime-local" class="kunduppgifter-input mot-slot-start" required>' +
      '<span class="moten-slot-sep">–</span>' +
      '<input type="datetime-local" class="kunduppgifter-input mot-slot-end" required>' +
      '<button type="button" class="btn btn-ghost btn-sm mot-slot-remove" aria-label="Ta bort"><i class="fas fa-trash"></i></button>';
    row.querySelector('.mot-slot-start').value = toLocalInputValue(start);
    row.querySelector('.mot-slot-end').value = toLocalInputValue(end);
    row.querySelector('.mot-slot-remove').addEventListener('click', () => {
      if (el.slots.children.length > 1) row.remove();
    });
    el.slots.appendChild(row);
  }

  function collectSlots() {
    if (!el.slots) return [];
    return Array.from(el.slots.querySelectorAll('.moten-slot-row')).map((row) => {
      const startVal = row.querySelector('.mot-slot-start')?.value;
      const endVal = row.querySelector('.mot-slot-end')?.value;
      if (!startVal || !endVal) throw new Error('Fyll i start och slut för alla luckor');
      const startMs = Date.parse(startVal);
      const endMs = Date.parse(endVal);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        throw new Error('Ogiltig tidslucka – slut måste vara efter start');
      }
      return {
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString()
      };
    });
  }

  function setFormError(msg) {
    if (!el.formError) return;
    if (msg) {
      el.formError.textContent = msg;
      el.formError.hidden = false;
    } else {
      el.formError.textContent = '';
      el.formError.hidden = true;
    }
  }

  function openModal() {
    if (!el.modal) return;
    if (el.slots) el.slots.innerHTML = '';
    addSlotRow();
    addSlotRow(new Date(defaultSlotStart().getTime() + 24 * 60 * 60 * 1000));
    if (el.title) el.title.value = 'Möte';
    if (el.message) el.message.value = '';
    if (el.type) el.type.value = 'Distans';
    if (el.location) el.location.value = '';
    if (el.customerName) el.customerName.value = '';
    setFormError('');
    el.modal.hidden = false;
    document.body.classList.add('kalender-detail-open');
  }

  function closeModal() {
    if (!el.modal) return;
    el.modal.hidden = true;
    document.body.classList.remove('kalender-detail-open');
  }

  async function api(path, options) {
    const opts = Object.assign({}, authOpts(), options || {});
    opts.headers = Object.assign({}, (authOpts().headers || {}), (options && options.headers) || {});
    if (opts.body && typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body);
      if (!opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(baseUrl + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      prompt('Kopiera länken:', text);
      return false;
    }
  }

  function renderList() {
    if (!el.list) return;
    if (!invites.length) {
      el.list.innerHTML =
        '<div class="moten-empty"><p class="statistik-section-desc" style="margin:0;">Inga mötesinbjudningar ännu. Skapa en bokningslänk för att komma igång.</p></div>';
      return;
    }

    el.list.innerHTML = invites
      .map((inv) => {
        const free = (inv.slots || []).filter((s) => s.status === 'Ledig').length;
        const meta =
          inv.status === 'Bokad'
            ? `Bokat: <strong>${esc(fmtRange(inv.bookedStart, inv.bookedEnd))}</strong> · ${esc(inv.bookerName || 'Kund')}` +
              (inv.bookerEmail ? ` (${esc(inv.bookerEmail)})` : '')
            : `${free} lediga luckor` +
              (inv.meetingType ? ` · ${esc(inv.meetingType)}` : '') +
              (inv.createdAt ? ` · skapad ${esc(fmt(inv.createdAt))}` : '');

        const linkRow =
          inv.status === 'Öppen' && inv.bookingUrl
            ? `<div class="moten-link-row">
                <input type="text" class="kunduppgifter-input" readonly value="${esc(inv.bookingUrl)}">
                <button type="button" class="btn btn-secondary btn-sm" data-copy="${esc(inv.bookingUrl)}">Kopiera</button>
              </div>`
            : '';

        let actions = '';
        if (inv.status === 'Öppen') {
          actions += `<button type="button" class="btn btn-ghost btn-sm" data-close="${esc(inv.id)}">Stäng</button>`;
        }
        if (inv.status === 'Bokad') {
          actions += `<button type="button" class="btn btn-ghost btn-sm" data-cancel="${esc(inv.id)}">Avboka</button>`;
        }

        return `<article class="${cardClass(inv.status)}" data-id="${esc(inv.id)}">
          <div class="moten-card-main">
            <div class="moten-card-top">
              <h3>${esc(inv.title || 'Möte')}</h3>
              <span class="${badgeClass(inv.status)}">${esc(inv.status || 'Öppen')}</span>
            </div>
            <p class="moten-card-meta">${esc(inv.customerName || 'Utan kundnamn')}</p>
            <p class="moten-card-meta">${meta}</p>
            ${linkRow}
          </div>
          ${actions ? `<div class="moten-card-actions">${actions}</div>` : ''}
        </article>`;
      })
      .join('');
  }

  async function loadInvites() {
    show(el.loading, true);
    show(el.content, false);
    show(el.setup, false);
    show(el.noAuth, false);
    try {
      const data = await api('/api/motesbokning/invites');
      invites = Array.isArray(data.invites) ? data.invites : [];
      renderList();
      show(el.loading, false);
      show(el.content, true);
    } catch (err) {
      show(el.loading, false);
      if (err.status === 503 && err.data && err.data.needsSetup) {
        show(el.setup, true);
        if (el.setupMsg) el.setupMsg.textContent = '';
        return;
      }
      if (el.loading) {
        el.loading.innerHTML =
          `<p class="statistik-section-desc" style="color:#b42318;">${esc(err.message || 'Kunde inte hämta möten')}</p>`;
        show(el.loading, true);
      }
    }
  }

  async function runSetup() {
    if (el.setupBtn) el.setupBtn.disabled = true;
    if (el.setupMsg) el.setupMsg.textContent = 'Skapar tabell...';
    try {
      const data = await api('/api/setup/airtable-motesbokning', { method: 'POST' });
      if (el.setupMsg) el.setupMsg.textContent = data.message || 'Klart';
      await loadInvites();
    } catch (err) {
      if (el.setupMsg) el.setupMsg.textContent = err.message || 'Setup misslyckades';
    } finally {
      if (el.setupBtn) el.setupBtn.disabled = false;
    }
  }

  async function createInvite(e) {
    e.preventDefault();
    setFormError('');
    try {
      const slots = collectSlots();
      if (!slots.length) throw new Error('Lägg till minst en tidslucka');
      if (el.save) {
        el.save.disabled = true;
        el.save.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skapar...';
      }
      await api('/api/motesbokning/invites', {
        method: 'POST',
        body: {
          title: (el.title && el.title.value) || 'Möte',
          message: (el.message && el.message.value) || '',
          meetingType: (el.type && el.type.value) || 'Distans',
          location: (el.location && el.location.value) || '',
          customerName: (el.customerName && el.customerName.value) || '',
          slots
        }
      });
      closeModal();
      await loadInvites();
    } catch (err) {
      setFormError(err.message || 'Kunde inte skapa inbjudan');
    } finally {
      if (el.save) {
        el.save.disabled = false;
        el.save.innerHTML = '<i class="fas fa-link"></i> Skapa länk';
      }
    }
  }

  async function closeInvite(id) {
    if (!confirm('Stäng inbjudan? Kunden kan inte längre boka.')) return;
    try {
      await api('/api/motesbokning/invites/' + encodeURIComponent(id) + '/close', { method: 'PUT' });
      await loadInvites();
    } catch (err) {
      alert(err.message || 'Kunde inte stänga');
    }
  }

  async function cancelInvite(id) {
    if (!confirm('Avboka mötet?')) return;
    try {
      await api('/api/motesbokning/invites/' + encodeURIComponent(id) + '/cancel', { method: 'PUT' });
      await loadInvites();
    } catch (err) {
      alert(err.message || 'Kunde inte avboka');
    }
  }

  function bind() {
    if (el.newBtn) el.newBtn.addEventListener('click', openModal);
    if (el.addSlot) el.addSlot.addEventListener('click', () => addSlotRow());
    if (el.form) el.form.addEventListener('submit', createInvite);
    if (el.setupBtn) el.setupBtn.addEventListener('click', runSetup);

    document.querySelectorAll('[data-mot-close]').forEach((node) => {
      node.addEventListener('click', closeModal);
    });

    if (el.list) {
      el.list.addEventListener('click', (e) => {
        const t = e.target instanceof Element ? e.target.closest('[data-copy],[data-close],[data-cancel]') : null;
        if (!t) return;
        const copy = t.getAttribute('data-copy');
        if (copy) {
          copyText(copy);
          return;
        }
        const closeId = t.getAttribute('data-close');
        if (closeId) {
          closeInvite(closeId);
          return;
        }
        const cancelId = t.getAttribute('data-cancel');
        if (cancelId) cancelInvite(cancelId);
      });
    }
  }

  async function init() {
    bind();
    const user = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
    if (!user) {
      show(el.loading, false);
      show(el.content, false);
      show(el.setup, false);
      show(el.noAuth, true);
      return;
    }
    await loadInvites();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
