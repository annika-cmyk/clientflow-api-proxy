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
        '<div class="mejl-atts"><strong>Bilagor (' + atts.length + ')</strong>' +
        '<ul class="mejl-att-list">' +
        atts
          .map((a) => {
            const id = esc(a.attachmentId || '');
            const name = esc(a.filename || 'fil');
            const mime = esc(a.mimeType || '');
            const size =
              a.size ? ' <span class="mejl-att-size">(' + Math.round(a.size / 1024) + ' kB)</span>' : '';
            return (
              '<li class="mejl-att-item">' +
              '<div class="mejl-att-meta"><span class="mejl-att-name">' +
              name +
              '</span>' +
              size +
              '</div>' +
              '<div class="mejl-att-actions">' +
              '<button type="button" class="btn btn-secondary btn-sm" data-mejl-att-preview' +
              ' data-att-id="' +
              id +
              '" data-filename="' +
              name +
              '" data-mime="' +
              mime +
              '"><i class="fas fa-eye"></i> Förhandsgranska</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" data-mejl-att-download' +
              ' data-att-id="' +
              id +
              '" data-filename="' +
              name +
              '" data-mime="' +
              mime +
              '"><i class="fas fa-download"></i> Ladda ner</button>' +
              '</div></li>'
            );
          })
          .join('') +
        '</ul></div>'
      );
    }

    function attachmentAuthFetch() {
      const opts = authOpts();
      const headers = { ...(opts.headers || {}) };
      delete headers['Content-Type'];
      return { ...opts, method: 'GET', headers };
    }

    function attachmentUrl(messageId, attachmentId, disposition) {
      return (
        baseUrl +
        '/api/gmail/messages/' +
        encodeURIComponent(messageId) +
        '/attachments/' +
        encodeURIComponent(attachmentId) +
        '?disposition=' +
        encodeURIComponent(disposition || 'attachment')
      );
    }

    function guessPreviewType(filename, fallback) {
      const name = String(filename || '').toLowerCase();
      if (name.endsWith('.pdf')) return 'application/pdf';
      if (name.endsWith('.png')) return 'image/png';
      if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
      if (name.endsWith('.gif')) return 'image/gif';
      if (name.endsWith('.webp')) return 'image/webp';
      if (name.endsWith('.txt') || name.endsWith('.log') || name.endsWith('.csv')) return 'text/plain';
      if (name.endsWith('.json')) return 'application/json';
      return String(fallback || '').split(';')[0].trim() || 'application/octet-stream';
    }

    function canPreviewInline(type) {
      return (
        type === 'application/pdf' ||
        type === 'text/plain' ||
        type === 'application/json' ||
        (type.indexOf('image/') === 0 && type !== 'image/svg+xml')
      );
    }

    function closeAttPreview() {
      const modal = document.getElementById('mejl-att-preview-modal');
      if (modal && modal._objectUrl) {
        try {
          URL.revokeObjectURL(modal._objectUrl);
        } catch (_) {}
      }
      if (modal) modal.remove();
    }

    function openAttPreviewModal(title) {
      closeAttPreview();
      const root = document.createElement('div');
      root.id = 'mejl-att-preview-modal';
      root.className = 'mejl-modal-backdrop mejl-att-preview-backdrop';
      root.innerHTML =
        '<div class="mejl-modal mejl-att-preview-modal" role="dialog" aria-modal="true">' +
        '<div class="mejl-att-preview-header">' +
        '<h3><i class="fas fa-file-alt"></i> ' +
        esc(title || 'Bilaga') +
        '</h3>' +
        '<div class="mejl-att-preview-header-actions">' +
        '<a class="btn btn-primary btn-sm" id="mejl-att-preview-dl" style="display:none;" download>' +
        '<i class="fas fa-download"></i> Ladda ner</a>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-mejl-att-close title="Stäng">' +
        '<i class="fas fa-times"></i></button>' +
        '</div></div>' +
        '<div class="mejl-att-preview-body" id="mejl-att-preview-body">' +
        '<p class="mejl-hint"><i class="fas fa-spinner fa-spin"></i> Öppnar bilagan…</p>' +
        '</div></div>';
      document.body.appendChild(root);
      root.addEventListener('click', (e) => {
        if (e.target === root) closeAttPreview();
      });
      root.querySelector('[data-mejl-att-close]').addEventListener('click', closeAttPreview);
      return root;
    }

    async function fetchAttachmentBlob(messageId, attachmentId, disposition) {
      const res = await fetch(
        attachmentUrl(messageId, attachmentId, disposition),
        attachmentAuthFetch()
      );
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try {
          const err = await res.json();
          if (err && err.error) msg = err.error;
        } catch (_) {}
        throw new Error(msg);
      }
      return res.blob();
    }

    async function previewAttachment(messageId, att) {
      const filename = att.filename || 'bilaga';
      const modal = openAttPreviewModal(filename);
      const body = document.getElementById('mejl-att-preview-body');
      const dl = document.getElementById('mejl-att-preview-dl');
      try {
        const blob = await fetchAttachmentBlob(messageId, att.attachmentId, 'inline');
        const type = guessPreviewType(filename, att.mimeType || blob.type);
        const objectUrl = URL.createObjectURL(blob);
        modal._objectUrl = objectUrl;
        if (dl) {
          dl.href = objectUrl;
          dl.download = filename;
          dl.style.display = '';
        }
        if (!body) return;
        if (canPreviewInline(type)) {
          if (type.indexOf('image/') === 0) {
            body.innerHTML =
              '<img class="mejl-att-preview-image" src="' +
              esc(objectUrl) +
              '" alt="' +
              esc(filename) +
              '">';
          } else if (type === 'text/plain' || type === 'application/json') {
            const text = await blob.text();
            body.innerHTML = '<pre class="mejl-att-preview-text">' + esc(text) + '</pre>';
          } else {
            body.innerHTML =
              '<iframe class="mejl-att-preview-frame" title="' +
              esc(filename) +
              '" src="' +
              esc(objectUrl) +
              '"></iframe>';
          }
        } else {
          body.innerHTML =
            '<p class="mejl-hint">Den här filtypen kan inte förhandsgranskas i webbläsaren. Ladda ner filen istället.</p>' +
            '<p><button type="button" class="btn btn-primary btn-sm" id="mejl-att-fallback-dl">' +
            '<i class="fas fa-download"></i> Ladda ner ' +
            esc(filename) +
            '</button></p>';
          const fb = document.getElementById('mejl-att-fallback-dl');
          if (fb) {
            fb.addEventListener('click', () => {
              const a = document.createElement('a');
              a.href = objectUrl;
              a.download = filename;
              a.click();
            });
          }
        }
      } catch (err) {
        if (body) {
          body.innerHTML =
            '<p class="mejl-hint">Kunde inte öppna bilagan: ' +
            esc(err.message || 'okänt fel') +
            '</p>';
        }
        showToast(err.message || 'Kunde inte förhandsgranska', 'error');
      }
    }

    async function downloadAttachment(messageId, att) {
      const filename = att.filename || 'bilaga';
      try {
        const blob = await fetchAttachmentBlob(messageId, att.attachmentId, 'attachment');
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (_) {}
        }, 2000);
        showToast('Laddar ner ' + filename, 'success');
      } catch (err) {
        showToast(err.message || 'Kunde inte ladda ner', 'error');
      }
    }

    function bindAttachmentActions(messageId) {
      const root = document.querySelector('.mejl-atts');
      if (!root || !messageId) return;
      root.querySelectorAll('[data-mejl-att-preview]').forEach((btn) => {
        btn.addEventListener('click', () => {
          previewAttachment(messageId, {
            attachmentId: btn.getAttribute('data-att-id'),
            filename: btn.getAttribute('data-filename'),
            mimeType: btn.getAttribute('data-mime')
          });
        });
      });
      root.querySelectorAll('[data-mejl-att-download]').forEach((btn) => {
        btn.addEventListener('click', () => {
          downloadAttachment(messageId, {
            attachmentId: btn.getAttribute('data-att-id'),
            filename: btn.getAttribute('data-filename'),
            mimeType: btn.getAttribute('data-mime')
          });
        });
      });
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
      if (!customerId) { showToast('Koppla mejlet till en kund först.', 'error'); return; }
      try {
        const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/visibility', {
          method: 'POST', ...authOpts(),
          body: JSON.stringify({ customerId, visibility })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          const raw = data.error || '';
          const friendly = /^Request failed with status code \d+$/i.test(raw)
            ? 'Kunde inte ändra synlighet. Försök igen om en stund.'
            : (raw || 'Kunde inte ändra synlighet');
          showToast(friendly, 'error');
          return;
        }
        archiveState = data.archive || archiveState;
        showToast(visibility === 'privat' ? 'Markerat som privat.' : 'Synligt för byrån.', 'success');
        if (onDone) await onDone();
      } catch (err) {
        showToast((err && err.message) || 'Kunde inte ändra synlighet', 'error');
      }
    }

    async function maskSelection(id, customerId, bodyOpts, onDone) {
      const plainText = typeof bodyOpts === 'string' ? bodyOpts : String((bodyOpts && bodyOpts.plainText) || '');
      const html = typeof bodyOpts === 'string' ? '' : String((bodyOpts && bodyOpts.html) || '');
      const sel = window.getSelection && window.getSelection();
      const selected = sel ? String(sel.toString() || '') : '';
      if (!selected.trim()) { showToast('Markera text i brödtexten först.', 'error'); return; }

      const bodyEl = document.querySelector('.mejl-detail-body');
      const displayedText = bodyEl
        ? String(bodyEl.innerText || bodyEl.textContent || '')
        : '';

      const resolver = global.MejlMaskSelection && global.MejlMaskSelection.resolveMaskRanges;
      const resolved = resolver
        ? resolver({ selectedText: selected, plainText, html, displayedText })
        : (function fallbackExact() {
            const start = plainText.indexOf(selected);
            if (start < 0) return { ranges: [], error: 'not_found' };
            return {
              ranges: [{ start, end: start + selected.length, field: 'text' }],
              bodyText: plainText
            };
          })();

      if (resolved.error === 'empty') {
        showToast('Markera text i brödtexten först.', 'error');
        return;
      }
      if (resolved.error === 'not_found' || !resolved.ranges || !resolved.ranges.length) {
        showToast('Markeringen hittades inte i mejlets text.', 'error');
        return;
      }

      const textRange = resolved.ranges.find((r) => r.field === 'text');
      const approxLen = textRange ? textRange.end - textRange.start : selected.trim().length;
      if (!confirm('Maska ' + approxLen + ' tecken? Syns bara för dig och ClientFlow-admin.')) return;

      const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/mask', {
        method: 'POST', ...authOpts(),
        body: JSON.stringify({
          customerId,
          ranges: resolved.ranges,
          bodyText: resolved.bodyText || undefined
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { showToast(data.error || 'Kunde inte maska', 'error'); return; }
      showToast('Text maskerad i ClientFlow-arkivet.', 'success');
      if (onDone) await onDone();
    }

    function bindDetailButtons(ctx) {
      const { id, message, customerId, plainText, html, onRefresh } = ctx;
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
      if (maskBtn) {
        maskBtn.addEventListener('click', () =>
          maskSelection(id, customerId, {
            plainText: plainText || (message && (message.text || message.snippet)) || '',
            html: html || (message && (message.html || message.bodyHtml)) || ''
          }, onRefresh)
        );
      }
      bindAttachmentActions(id);
    }

    return {
      fetchArchive,
      archiveMetaHtml,
      toolbarHtml,
      attachmentsHtml,
      bindDetailButtons,
      bindAttachmentActions,
      getArchiveState: () => archiveState
    };
  }

  global.MejlArchive = { createApi };
})(window);
