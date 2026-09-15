/**
 * Publik mötesbokning via token-länk.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const token = String(params.get('token') || '').trim();
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
    formError: document.getElementById('boka-form-error')
  };

  let selectedSlotId = '';

  function hideAll() {
    ['loading', 'error', 'done', 'closed', 'formWrap'].forEach((k) => {
      if (el[k]) el[k].classList.add('hidden');
    });
  }

  function show(key) {
    hideAll();
    if (el[key]) el[key].classList.remove('hidden');
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtRange(start, end) {
    const s = new Date(start);
    const e = end ? new Date(end) : null;
    const date = s.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
    const t1 = s.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const t2 = e ? e.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
    return t2 ? `${date} · ${t1}–${t2}` : `${date} · ${t1}`;
  }

  function renderSlots(slots) {
    if (!slots.length) {
      el.slots.innerHTML = '<p class="boka-meta">Inga lediga tider just nu.</p>';
      return;
    }
    el.slots.innerHTML = slots.map((slot) => `
      <button type="button" class="boka-slot" data-slot="${esc(slot.id)}" role="radio" aria-checked="false">
        <span class="boka-slot-radio" aria-hidden="true"></span>
        <span>${esc(fmtRange(slot.start, slot.end))}</span>
      </button>
    `).join('');

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

  async function load() {
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
        if (el.doneText) {
          el.doneText.textContent = `Bokad tid: ${fmtRange(data.booked.start, data.booked.end)}`;
        }
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

  load();
})();
