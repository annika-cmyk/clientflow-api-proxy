/**
 * Mejl: skapa uppdrag (Eget uppdrag) eller uppgift (anteckning + ToDo) med deadline.
 */
(function (global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function snippetFromEmail(text, snippet, maxLen) {
    const raw = String(text || snippet || '').trim();
    if (!raw) return '';
    const collapsed = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const lim = maxLen || 900;
    if (collapsed.length <= lim) return collapsed;
    return collapsed.slice(0, Math.max(0, lim - 1)).trimEnd() + '…';
  }

  function defaultTitle(subject) {
    const s = String(subject || '').trim();
    if (!s) return 'Uppföljning från mejl';
    return s.replace(/^(re|fw|fwd)\s*:\s*/i, '').trim() || 'Uppföljning från mejl';
  }

  function createApi(opts) {
    const baseUrl = opts.baseUrl || '';
    const authOpts = opts.authOpts;
    const showToast = opts.showToast || function () {};
    const getCustomers = opts.getCustomers || function () { return []; };

    function closeModal() {
      const el = document.getElementById('mejl-create-work-modal');
      if (el) el.remove();
    }

    function currentUserName() {
      try {
        const u = global.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
        return String((u && (u.name || u.Namn)) || '').trim();
      } catch (_) {
        return '';
      }
    }

    function customerOptionsHtml(selectedId) {
      const list = getCustomers() || [];
      const opts = list
        .map((c) => {
          const sel = c.id === selectedId ? ' selected' : '';
          return `<option value="${esc(c.id)}"${sel}>${esc(c.namn)}</option>`;
        })
        .join('');
      return `<option value="">Välj kund…</option>${opts}`;
    }

    async function fetchCustomerMeta(customerId) {
      const res = await fetch(
        baseUrl + '/api/kunddata/' + encodeURIComponent(customerId),
        authOpts()
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Kunde inte hämta kund');
      const f = (data.customer && data.customer.fields) || (data.data && data.data.fields) || data.fields || {};
      return {
        namn: f.Namn || f.Företagsnamn || '',
        orgnr: f.Orgnr || f['Organisationsnummer'] || '',
        byraId: String(f['Byrå ID'] || f.ByråID || f['Byra ID'] || '')
      };
    }

    function toolbarButtonHtml() {
      return (
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-create-work-btn" title="Skapa uppdrag eller uppgift med deadline">' +
        '<i class="fas fa-tasks"></i> Uppdrag/uppgift</button>'
      );
    }

    function openCreateModal(ctx) {
      const message = (ctx && ctx.message) || {};
      const listMeta = (ctx && ctx.listMeta) || {};
      const prefillCustomerId = String(ctx.customerId || '').trim();
      const subject = message.subject || listMeta.subject || '';
      const titleDefault = defaultTitle(subject);
      const bodySnippet = snippetFromEmail(message.text, message.snippet || listMeta.snippet);
      const fromName =
        String(listMeta.fromName || '').trim() ||
        String(message.from || '')
          .replace(/<[^>]+>/g, '')
          .trim();
      const userName = currentUserName();

      closeModal();
      const root = document.createElement('div');
      root.id = 'mejl-create-work-modal';
      root.className = 'mejl-modal-backdrop';
      root.innerHTML =
        '<div class="mejl-modal" role="dialog" aria-modal="true" aria-labelledby="mejl-create-work-title">' +
        '<h3 id="mejl-create-work-title"><i class="fas fa-tasks"></i> Skapa från mejl</h3>' +
        '<div class="form-grid">' +
        '<div class="form-group">' +
        '<label>Typ *</label>' +
        '<div class="mejl-create-work-kind">' +
        '<label class="mejl-create-work-radio"><input type="radio" name="mejl-work-kind" value="uppgift" checked> ' +
        'Ny uppgift <span class="mejl-hint">(som Att göra i anteckningar)</span></label>' +
        '<label class="mejl-create-work-radio"><input type="radio" name="mejl-work-kind" value="uppdrag"> ' +
        'Nytt uppdrag <span class="mejl-hint">(Eget uppdrag, engång)</span></label>' +
        '</div></div>' +
        '<div class="form-group">' +
        '<label for="mejl-work-customer">Kund *</label>' +
        '<select id="mejl-work-customer" class="form-select form-input">' +
        customerOptionsHtml(prefillCustomerId) +
        '</select>' +
        (prefillCustomerId
          ? ''
          : '<p class="mejl-hint" id="mejl-work-customer-hint">Mejlet saknar kundkoppling — välj kund.</p>') +
        '</div>' +
        '<div class="form-group">' +
        '<label for="mejl-work-title">Titel *</label>' +
        '<input type="text" id="mejl-work-title" class="form-input" value="' + esc(titleDefault) + '">' +
        '</div>' +
        '<div class="form-group">' +
        '<label for="mejl-work-deadline">Deadline *</label>' +
        '<input type="date" id="mejl-work-deadline" class="form-input" value="' + esc(todayIso()) + '" required>' +
        '</div>' +
        '<div class="form-group">' +
        '<label for="mejl-work-desc">Beskrivning</label>' +
        '<textarea id="mejl-work-desc" class="form-input" rows="5">' + esc(bodySnippet) + '</textarea>' +
        '</div>' +
        '<div class="form-group" id="mejl-work-ansvarig-wrap" hidden>' +
        '<label for="mejl-work-ansvarig">Handläggare</label>' +
        '<input type="text" id="mejl-work-ansvarig" class="form-input" value="' + esc(userName) + '" placeholder="Ditt namn">' +
        '</div>' +
        '</div>' +
        '<div class="mejl-modal-actions">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-mejl-cancel>Avbryt</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-mejl-ok>Skapa</button>' +
        '</div></div>';

      document.body.appendChild(root);
      root.addEventListener('click', (e) => {
        if (e.target === root) closeModal();
      });
      root.querySelector('[data-mejl-cancel]').addEventListener('click', closeModal);

      const syncKind = () => {
        const kind = (root.querySelector('input[name="mejl-work-kind"]:checked') || {}).value;
        const wrap = root.querySelector('#mejl-work-ansvarig-wrap');
        if (wrap) wrap.hidden = kind !== 'uppdrag';
      };
      root.querySelectorAll('input[name="mejl-work-kind"]').forEach((el) => {
        el.addEventListener('change', syncKind);
      });
      syncKind();

      root.querySelector('[data-mejl-ok]').addEventListener('click', async () => {
        const okBtn = root.querySelector('[data-mejl-ok]');
        okBtn.disabled = true;
        try {
          const kind = (root.querySelector('input[name="mejl-work-kind"]:checked') || {}).value;
          const customerId = String(root.querySelector('#mejl-work-customer').value || '').trim();
          const title = String(root.querySelector('#mejl-work-title').value || '').trim();
          const deadline = String(root.querySelector('#mejl-work-deadline').value || '').trim();
          const description = String(root.querySelector('#mejl-work-desc').value || '').trim();
          const ansvarig = String(root.querySelector('#mejl-work-ansvarig').value || '').trim() || userName;

          if (!customerId) {
            showToast('Välj en kund.', 'error');
            return;
          }
          if (!title) {
            showToast('Ange en titel.', 'error');
            return;
          }
          if (!deadline) {
            showToast('Ange en deadline.', 'error');
            return;
          }

          if (kind === 'uppgift') {
            const meta = await fetchCustomerMeta(customerId);
            if (!meta.orgnr && !meta.byraId) {
              showToast('Kunden saknar orgnr/byrå-id — kan inte spara uppgift.', 'error');
              return;
            }
            const noteData = {
              typAvAnteckning: ['Emailkonversation'],
              datum: deadline,
              foretagsnamn: meta.namn,
              orgnr: meta.orgnr,
              byraId: meta.byraId,
              person: fromName,
              notes: ['Deadline: ' + deadline, subject ? 'Ämne: ' + subject : '', description]
                .filter(Boolean)
                .join('\n\n'),
              ToDo1: title + ' (deadline ' + deadline + ')',
              Status1: 'Att göra'
            };
            const res = await fetch(baseUrl + '/api/notes', {
              method: 'POST',
              ...authOpts(),
              body: JSON.stringify(noteData)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.success === false) {
              throw new Error(data.message || data.error || 'Kunde inte skapa uppgift');
            }
            closeModal();
            showToast('Uppgift skapad (syns under anteckningar / Mina uppgifter).', 'success');
            return;
          }

          if (!ansvarig) {
            showToast('Ange handläggare för uppdraget.', 'error');
            return;
          }
          const body = {
            customerId,
            typ: 'Eget uppdrag',
            fields: {
              Namn: title,
              Frekvens: 'Engång',
              Startdatum: todayIso(),
              'Nästa deadline': deadline,
              Rutin: description,
              Ansvarig: ansvarig,
              Klientansvarig: ansvarig,
              Status: 'Aktiv'
            }
          };
          const res = await fetch(baseUrl + '/api/uppdrag', {
            method: 'POST',
            ...authOpts(),
            body: JSON.stringify(body)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Kunde inte skapa uppdrag');
          closeModal();
          showToast('Uppdrag skapat.', 'success');
        } catch (e) {
          showToast(e.message || 'Kunde inte skapa', 'error');
        } finally {
          okBtn.disabled = false;
        }
      });
    }

    function bindDetailButtons(ctx) {
      const btn = document.getElementById('mejl-create-work-btn');
      if (!btn) return;
      btn.addEventListener('click', () => openCreateModal(ctx));
    }

    return {
      toolbarButtonHtml,
      bindDetailButtons,
      openCreateModal
    };
  }

  global.MejlCreateWork = { createApi };
})(typeof window !== 'undefined' ? window : global);
