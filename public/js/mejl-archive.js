/**
 * Mejlarkiv-UI: spara / dela / privat / maska på mejldetalj.
 */
(function (global) {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createApi(opts) {
    const baseUrl = opts.baseUrl || '';
    const authOpts = opts.authOpts;
    const showToast = opts.showToast || function () {};

    let archiveState = null;
    let byraUsersCache = null;

    function closeModal() {
      const el = document.getElementById('mejl-modal-root');
      if (el) el.remove();
    }

    function openModal(title, bodyHtml, onConfirm, confirmLabel) {
      closeModal();
      const root = document.createElement('div');
      root.id = 'mejl-modal-root';
      root.className = 'mejl-modal-backdrop';
      root.innerHTML =
        '<div class="mejl-modal" role="dialog" aria-modal="true">' +
        '<h3>' + esc(title) + '</h3>' +
        '<div class="mejl-modal-body">' + bodyHtml + '</div>' +
        '<div class="mejl-modal-actions">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-mejl-cancel>Avbryt</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-mejl-ok>' + esc(confirmLabel || 'Spara') + '</button>' +
        '</div></div>';
      document.body.appendChild(root);
      root.addEventListener('click', (e) => { if (e.target === root) closeModal(); });
      root.querySelector('[data-mejl-cancel]').addEventListener('click', closeModal);
      root.querySelector('[data-mejl-ok]').addEventListener('click', async () => {
        const okBtn = root.querySelector('[data-mejl-ok]');
        okBtn.disabled = true;
        try { await onConfirm(root); } finally { okBtn.disabled = false; }
      });
      return root;
    }

    async function fetchArchive(messageId, customerId) {
      if (!customerId) return null;
      try {
        const res = await fetch(
          baseUrl + '/api/gmail/messages/' + encodeURIComponent(messageId) +
            '/archive?customerId=' + encodeURIComponent(customerId),
          authOpts()
        );
        const data = await res.json();
        if (res.ok && data.success) {
          archiveState = data.archive;
          return data.archive;
        }
      } catch (_) {}
      return null;
    }

    function archiveMetaHtml(archive) {
      if (!archive) return '<div class="mejl-archive-meta">Inte sparat i ClientFlow ännu.</div>';
      const vis = archive.visibility === 'privat' ? 'privat' : 'byra';
      return (
        '<div class="mejl-archive-meta">' +
        '<span class="pill pill-' + vis + '">' + (vis === 'privat' ? 'Privat' : 'Byrå') + '</span>' +
        (archive.sharedWith && archive.sharedWith.length
          ? 'Delad med ' + archive.sharedWith.length + ' kollega(or). '
          : '') +
        (archive.savedTo && archive.savedTo.length
          ? 'Sparad ' + archive.savedTo.length + ' gång(er). '
          : '') +
        (archive.maskedRanges && archive.maskedRanges.length ? 'Innehåller maskering.' : '') +
        '</div>'
      );
    }

    function toolbarHtml(customerId, visibility) {
      const disabled = customerId ? '' : ' disabled';
      const vis = visibility === 'privat' ? 'privat' : 'byra';
      return (
        '<div class="mejl-archive-bar">' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-save-btn"' + disabled + '>' +
        '<i class="fas fa-save"></i> Spara…</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-share-btn"' + disabled + '>' +
        '<i class="fas fa-share-alt"></i> Dela…</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-privat-btn"' + disabled + '>' +
        '<i class="fas fa-lock"></i> ' + (vis === 'privat' ? 'Gör byråsynlig' : 'Markera privat') + '</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-mask-btn"' + disabled + '>' +
        '<i class="fas fa-eye-slash"></i> Maska markering</button>' +
        '</div>'
      );
    }

    function attachmentsHtml(atts) {
      if (!atts || !atts.length) return '';
      return (
        '<div class="mejl-atts"><strong>Bilagor (' + atts.length + ')</strong><ul>' +
        atts.map((a) =>
          '<li>' + esc(a.filename || 'fil') +
          (a.size ? ' (' + Math.round(a.size / 1024) + ' kB)' : '') + '</li>'
        ).join('') +
        '</ul></div>'
      );
    }

    async function loadByraUsers() {
      if (byraUsersCache) return byraUsersCache;
      try {
        const res = await fetch(baseUrl + '/api/byra/anvandare', authOpts());
        const data = await res.json();
        const list = (data && (data.users || data.data || data.anvandare)) || [];
        byraUsersCache = (Array.isArray(list) ? list : [])
          .map((u) => ({
            id: u.id || u.recordId,
            name: u.name || u.Namn || u.fullName || u.email || 'Användare',
            email: u.email || ''
          }))
          .filter((u) => u.id);
      } catch (_) {
        byraUsersCache = [];
      }
      return byraUsersCache;
    }

    async function loadUppdrag(customerId) {
      try {
        const res = await fetch(baseUrl + '/api/uppdrag?customerId=' + encodeURIComponent(customerId), authOpts());
        const data = await res.json();
        return (data && (data.records || data.data || data.uppdrag)) || [];
      } catch (_) { return []; }
    }

    async function loadRuns(customerId) {
      try {
        const res = await fetch(baseUrl + '/api/uppdrag/runs?customerId=' + encodeURIComponent(customerId), authOpts());
        const data = await res.json();
        return (data && (data.records || data.data || data.runs)) || [];
      } catch (_) { return []; }
    }

    async function openSaveWizard(id, m, customerId, onDone) {
      if (!customerId) { showToast('Koppla mejlet till en kund först.', 'error'); return; }
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      const [uppdrag, runs] = await Promise.all([loadUppdrag(customerId), loadRuns(customerId)]);
      const attChecks = atts.length
        ? atts.map((a) =>
            '<label style="display:block;"><input type="checkbox" name="att" value="' +
            esc(a.attachmentId) + '" checked> ' + esc(a.filename || 'fil') + '</label>'
          ).join('')
        : '<p class="mejl-hint">Inga bilagor.</p>';
      const uppdragOpts = (uppdrag || []).map((u) => {
        const f = u.fields || u;
        return '<option value="' + esc(u.id) + '">' + esc(f.Typ || f.Name || u.id) + '</option>';
      }).join('');
      const runOpts = (runs || []).map((r) => {
        const f = r.fields || r;
        const label = ((f['Period Label'] || f.PeriodKey || '') + (f.Typ ? ' · ' + f.Typ : '') + (f.Deadline ? ' (' + f.Deadline + ')' : '')) || r.id;
        return '<option value="' + esc(r.id) + '">' + esc(label) + '</option>';
      }).join('');

      openModal(
        'Spara mejl / bilagor',
        '<div class="form-grid">' +
          '<label><input type="checkbox" id="mejl-save-email" checked> Spara hela mejlet</label>' +
          '<label><input type="checkbox" id="mejl-save-atts"' + (atts.length ? ' checked' : ' disabled') + '> Spara bilagor</label>' +
          '<div><div class="mejl-labels-heading">Välj bilagor</div>' + attChecks + '</div>' +
          '<div><label class="mejl-label-edit-label" for="mejl-save-mode">Sparmål</label>' +
          '<select id="mejl-save-mode" class="form-select form-input">' +
          '<option value="dokumentation">Dokumentation på kunden</option>' +
          '<option value="uppdrag">Uppdrag</option>' +
          '<option value="korning">Uppdragskörning</option>' +
          '<option value="split">Dela upp: mejl→dokumentation, bilagor→uppdrag/körning</option>' +
          '</select></div>' +
          '<div id="mejl-save-uppdrag-wrap" hidden><label class="mejl-label-edit-label" for="mejl-save-uppdrag">Uppdrag</label>' +
          '<select id="mejl-save-uppdrag" class="form-select form-input"><option value="">Välj…</option>' + uppdragOpts + '</select></div>' +
          '<div id="mejl-save-run-wrap" hidden><label class="mejl-label-edit-label" for="mejl-save-run">Körning</label>' +
          '<select id="mejl-save-run" class="form-select form-input"><option value="">Välj…</option>' + runOpts + '</select></div>' +
          '</div>',
        async (root) => {
          const mode = root.querySelector('#mejl-save-mode').value;
          const includeEmail = root.querySelector('#mejl-save-email').checked;
          const saveAtts = root.querySelector('#mejl-save-atts').checked;
          const selectedAtts = [...root.querySelectorAll('input[name="att"]:checked')].map((el) => el.value);
          const uppdragId = (root.querySelector('#mejl-save-uppdrag') || {}).value || '';
          const runId = (root.querySelector('#mejl-save-run') || {}).value || '';
          let targets = [];
          if (mode === 'dokumentation') {
            targets = [{ type: 'dokumentation', customerId, includeEmail, attachmentIds: saveAtts ? selectedAtts : [] }];
          } else if (mode === 'uppdrag') {
            if (!uppdragId) { showToast('Välj ett uppdrag.', 'error'); return; }
            targets = [{ type: 'uppdrag', uppdragId, customerId, includeEmail, attachmentIds: saveAtts ? selectedAtts : [] }];
          } else if (mode === 'korning') {
            if (!runId) { showToast('Välj en körning.', 'error'); return; }
            targets = [{ type: 'korning', runId, customerId, includeEmail, attachmentIds: saveAtts ? selectedAtts : [] }];
          } else {
            if (includeEmail) targets.push({ type: 'dokumentation', customerId, includeEmail: true, attachmentIds: [] });
            if (saveAtts && selectedAtts.length) {
              if (runId) targets.push({ type: 'korning', runId, customerId, includeEmail: false, attachmentIds: selectedAtts });
              else if (uppdragId) targets.push({ type: 'uppdrag', uppdragId, customerId, includeEmail: false, attachmentIds: selectedAtts });
              else { showToast('Välj uppdrag eller körning för bilagor.', 'error'); return; }
            }
          }
          if (!targets.length) { showToast('Inget att spara.', 'error'); return; }
          const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/save', {
            method: 'POST', ...authOpts(),
            body: JSON.stringify({ customerId, includeEmail: false, saveAttachments: false, targets })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) { showToast(data.error || 'Kunde inte spara', 'error'); return; }
          const nOk = (data.results || []).filter((r) => !r.error).length;
          const nErr = (data.results || []).filter((r) => r.error).length;
          showToast(nErr ? 'Sparat ' + nOk + ', ' + nErr + ' fel.' : 'Sparat (' + nOk + ' objekt).', nErr ? 'error' : 'success');
          closeModal();
          archiveState = data.archive || archiveState;
          if (onDone) await onDone();
        },
        'Spara'
      );
      const modeEl = document.getElementById('mejl-save-mode');
      const sync = () => {
        const mode = modeEl.value;
        const u = document.getElementById('mejl-save-uppdrag-wrap');
        const r = document.getElementById('mejl-save-run-wrap');
        if (u) u.hidden = !(mode === 'uppdrag' || mode === 'split' || mode === 'korning');
        if (r) r.hidden = !(mode === 'korning' || mode === 'split');
        if (mode === 'uppdrag' && r) r.hidden = true;
      };
      if (modeEl) { modeEl.addEventListener('change', sync); sync(); }
    }

    async function openShareDialog(id, customerId, onDone) {
      if (!customerId) return;
      const users = await loadByraUsers();
      const shared = new Set((archiveState && archiveState.sharedWith) || []);
      const opts = users.length
        ? users.map((u) =>
            '<label style="display:block;"><input type="checkbox" name="share" value="' + esc(u.id) + '"' +
            (shared.has(u.id) ? ' checked' : '') + '> ' + esc(u.name) +
            (u.email ? ' (' + esc(u.email) + ')' : '') + '</label>'
          ).join('')
        : '<p class="mejl-hint">Inga byråanvändare hittades.</p>';
      openModal(
        'Dela mejl',
        '<p class="mejl-hint">Privata mejl syns bara för dig och dem du delar med.</p><div>' + opts + '</div>',
        async (root) => {
          const ids = [...root.querySelectorAll('input[name="share"]:checked')].map((el) => el.value);
          const remove = [...shared].filter((x) => !ids.includes(x));
          const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/share', {
            method: 'POST', ...authOpts(),
            body: JSON.stringify({ customerId, userIds: ids, remove })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) { showToast(data.error || 'Kunde inte dela', 'error'); return; }
          showToast('Delning uppdaterad.', 'success');
          closeModal();
          if (onDone) await onDone();
        },
        'Dela'
      );
    }

    async function toggleVisibility(id, customerId, visibility, onDone) {
      const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/visibility', {
        method: 'POST', ...authOpts(),
        body: JSON.stringify({ customerId, visibility })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { showToast(data.error || 'Kunde inte ändra synlighet', 'error'); return; }
      showToast(visibility === 'privat' ? 'Markerat som privat.' : 'Synligt för byrån.', 'success');
      if (onDone) await onDone();
    }

    async function maskSelection(id, customerId, plainText, onDone) {
      const sel = window.getSelection && window.getSelection();
      const selected = sel ? String(sel.toString() || '') : '';
      if (!selected.trim()) { showToast('Markera text i brödtexten först.', 'error'); return; }
      const src = String(plainText || '');
      const start = src.indexOf(selected);
      if (start < 0) {
        showToast('Markeringen hittades inte i plain text.', 'error');
        return;
      }
      const end = start + selected.length;
      if (!confirm('Maska ' + selected.length + ' tecken? Syns bara för dig och ClientFlow-admin.')) return;
      const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/mask', {
        method: 'POST', ...authOpts(),
        body: JSON.stringify({ customerId, ranges: [{ start, end, field: 'text' }] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { showToast(data.error || 'Kunde inte maska', 'error'); return; }
      showToast('Text maskerad i ClientFlow-arkivet.', 'success');
      if (onDone) await onDone();
    }

    function bindDetailButtons(ctx) {
      const { id, message, customerId, plainText, onRefresh } = ctx;
      const vis = (archiveState && archiveState.visibility) || 'byra';
      const saveBtn = document.getElementById('mejl-save-btn');
      if (saveBtn) saveBtn.addEventListener('click', () => openSaveWizard(id, message, customerId, onRefresh));
      const shareBtn = document.getElementById('mejl-share-btn');
      if (shareBtn) shareBtn.addEventListener('click', () => openShareDialog(id, customerId, onRefresh));
      const privatBtn = document.getElementById('mejl-privat-btn');
      if (privatBtn) {
        privatBtn.addEventListener('click', () =>
          toggleVisibility(id, customerId, vis === 'privat' ? 'byra' : 'privat', onRefresh)
        );
      }
      const maskBtn = document.getElementById('mejl-mask-btn');
      if (maskBtn) maskBtn.addEventListener('click', () => maskSelection(id, customerId, plainText, onRefresh));
    }

    return {
      fetchArchive,
      archiveMetaHtml,
      toolbarHtml,
      attachmentsHtml,
      bindDetailButtons,
      getArchiveState: () => archiveState
    };
  }

  global.MejlArchive = { createApi };
})(window);
