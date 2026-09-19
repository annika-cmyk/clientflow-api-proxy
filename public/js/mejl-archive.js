/**
 * Mejlarkiv-UI: koppla / dela / privat / maska på mejldetalj.
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
        '<button type="button" class="btn btn-primary btn-sm" data-mejl-ok>' + esc(confirmLabel || 'Koppla') + '</button>' +
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

    function destinationDisplayName(dest) {
      const base = dest.label || 'ClientFlow';
      const extra = dest.runName || dest.uppdragName || '';
      return extra ? base + ': ' + extra : base;
    }

    function destinationContents(dest) {
      const parts = [];
      if (dest.emailSaved) parts.push('mejl');
      if (dest.attachments && dest.attachments.length) {
        const names = dest.attachments.slice(0, 3).join(', ');
        const more =
          dest.attachments.length > 3 ? ' +' + (dest.attachments.length - 3) : '';
        parts.push(
          dest.attachments.length === 1
            ? 'bilaga (' + names + ')'
            : dest.attachments.length + ' bilagor (' + names + more + ')'
        );
      }
      return parts.length ? parts.join(' + ') : 'kopplad';
    }

    function summarizeSavedToClient(savedTo, customerId) {
      const entries = Array.isArray(savedTo) ? savedTo : [];
      const byKey = new Map();
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        let type = String(entry.type || '').toLowerCase();
        if (type === 'run' || type === 'uppdragskorning') type = 'korning';
        if (type === 'docs' || type === 'kund' || type === 'customer') type = 'dokumentation';
        if (!type) type = 'dokumentation';
        const cid = String(entry.customerId || customerId || '').trim();
        const uppdragId = String(entry.uppdragId || '').trim();
        const runId = String(entry.runId || '').trim();
        const key = [type, cid, uppdragId, runId].join('|');
        let dest = byKey.get(key);
        if (!dest) {
          const label =
            type === 'korning' ? 'Uppdragskörning' : type === 'uppdrag' ? 'Uppdrag' : 'Dokumentation';
          const href = cid
            ? 'kundkort.html?id=' +
              encodeURIComponent(cid) +
              (type === 'dokumentation'
                ? '#dokumentation'
                : type === 'uppdrag' || type === 'korning'
                  ? '#uppdrag'
                  : '')
            : '';
          dest = {
            type,
            label,
            customerId: cid,
            uppdragId: uppdragId || null,
            runId: runId || null,
            uppdragName: entry.uppdragName || entry.uppdragLabel || null,
            runName: entry.runName || entry.runLabel || entry.periodLabel || null,
            href,
            emailSaved: false,
            attachments: []
          };
          byKey.set(key, dest);
        }
        const filename = String(entry.filename || '').trim();
        if (entry.gmailAttachmentId || entry.attachmentId) {
          if (filename && dest.attachments.indexOf(filename) < 0) dest.attachments.push(filename);
        } else {
          dest.emailSaved = true;
        }
      }
      const destinations = Array.from(byKey.values());
      return { hasSaves: destinations.length > 0, destinations, totalSaves: entries.length };
    }

    function attachmentSaveFlags(messageAttachments, archive) {
      const savedIds = new Set();
      const savedNames = new Set();
      const pushEntry = (entry) => {
        if (!entry) return;
        const id = String(entry.gmailAttachmentId || entry.attachmentId || '').trim();
        if (id) savedIds.add(id);
        const name = String(entry.filename || '').trim().toLowerCase();
        if (name) savedNames.add(name);
      };
      (archive && archive.savedTo ? archive.savedTo : []).forEach((e) => {
        if (e && (e.gmailAttachmentId || e.attachmentId)) pushEntry(e);
      });
      (archive && archive.attachmentMeta ? archive.attachmentMeta : []).forEach(pushEntry);
      return (messageAttachments || []).map((a) => {
        const id = String((a && a.attachmentId) || '').trim();
        const filename = String((a && a.filename) || '').trim();
        const saved =
          (id && savedIds.has(id)) ||
          (filename && savedNames.has(filename.toLowerCase()));
        return { attachmentId: id, filename, saved: !!saved };
      });
    }

    function archiveMetaHtml(archive, opts) {
      const messageAttachments = (opts && opts.attachments) || [];
      if (!archive) {
        return '<div class="mejl-archive-meta">Inte kopplat i ClientFlow ännu.</div>';
      }
      const vis = archive.visibility === 'privat' ? 'privat' : 'byra';
      const summary =
        archive.savedSummary && Array.isArray(archive.savedSummary.destinations)
          ? archive.savedSummary
          : summarizeSavedToClient(archive.savedTo, archive.customerId);
      const flags = attachmentSaveFlags(messageAttachments, archive);
      const savedAttCount = flags.filter((f) => f.saved).length;
      const unsavedAttCount = flags.length ? flags.length - savedAttCount : 0;

      let html =
        '<div class="mejl-archive-meta">' +
        '<div class="mejl-archive-meta-row">' +
        '<span class="pill pill-' +
        vis +
        '">' +
        (vis === 'privat' ? 'Privat' : 'Byrå') +
        '</span>';
      if (archive.sharedWith && archive.sharedWith.length) {
        html +=
          '<span class="mejl-archive-chip">Delad med ' +
          archive.sharedWith.length +
          ' kollega(or)</span>';
      }
      if (archive.maskedRanges && archive.maskedRanges.length) {
        html += '<span class="mejl-archive-chip">Maskering</span>';
      }
      html += '</div>';

      if (summary.hasSaves) {
        html += '<div class="mejl-archive-saved-label">Kopplat i ClientFlow</div><ul class="mejl-archive-dest-list">';
        summary.destinations.forEach((dest) => {
          const title = destinationDisplayName(dest);
          const contents = destinationContents(dest);
          const titleHtml = dest.href
            ? '<a class="mejl-archive-dest-link" href="' +
              esc(dest.href) +
              '" target="_blank" rel="noopener">' +
              esc(title) +
              '</a>'
            : '<span class="mejl-archive-dest-name">' + esc(title) + '</span>';
          html +=
            '<li>' +
            titleHtml +
            '<span class="mejl-archive-dest-detail"> — ' +
            esc(contents) +
            '</span></li>';
        });
        html += '</ul>';
        if (flags.length) {
          html +=
            '<div class="mejl-archive-att-status">' +
            (savedAttCount
              ? savedAttCount +
                ' av ' +
                flags.length +
                ' bilaga(or) kopplad(e)' +
                (unsavedAttCount ? '; ' + unsavedAttCount + ' ej kopplad(e)' : '')
              : 'Inga bilagor kopplade ännu (' + flags.length + ' i mejlet)') +
            '.</div>';
        }
      } else {
        html +=
          '<div class="mejl-archive-saved-label mejl-archive-saved-label--muted">' +
          'I Mejlarkiv (synlighet/delning) — inte kopplat till dokumentation eller uppdrag ännu.' +
          '</div>';
      }
      html += '</div>';
      return html;
    }

    function toolbarHtml(customerId, visibility) {
      const disabled = customerId ? '' : ' disabled';
      const vis = visibility === 'privat' ? 'privat' : 'byra';
      return (
        '<div class="mejl-archive-bar">' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-save-btn"' + disabled + '>' +
        '<i class="fas fa-link"></i> Koppla…</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-share-btn"' + disabled + '>' +
        '<i class="fas fa-share-alt"></i> Dela…</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-privat-btn"' + disabled + '>' +
        '<i class="fas fa-lock"></i> ' + (vis === 'privat' ? 'Gör byråsynlig' : 'Markera privat') + '</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="mejl-mask-btn"' + disabled + '>' +
        '<i class="fas fa-eye-slash"></i> Maska markering</button>' +
        '</div>'
      );
    }

    function attachmentsHtml(atts, archive) {
      if (!atts || !atts.length) return '';
      const flags = attachmentSaveFlags(atts, archive);
      const savedById = new Map(flags.map((f) => [f.attachmentId, f.saved]));
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
            const saved = savedById.get(String(a.attachmentId || '')) === true;
            const savedBadge = saved
              ? ' <span class="mejl-att-saved" title="Kopplad i ClientFlow">Kopplad</span>'
              : '';
            return (
              '<li class="mejl-att-item">' +
              '<div class="mejl-att-meta"><span class="mejl-att-name">' +
              name +
              '</span>' +
              size +
              savedBadge +
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

    function attachmentUrl(messageId, attachmentId, disposition, extra) {
      const q = new URLSearchParams();
      q.set('attachmentId', String(attachmentId || ''));
      q.set('disposition', disposition || 'attachment');
      if (extra && extra.filename) q.set('filename', String(extra.filename));
      if (extra && extra.mimeType) q.set('mimeType', String(extra.mimeType));
      return (
        baseUrl +
        '/api/gmail/messages/' +
        encodeURIComponent(messageId) +
        '/attachment?' +
        q.toString()
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

    async function fetchAttachmentBlob(messageId, att, disposition) {
      const res = await fetch(
        attachmentUrl(messageId, att.attachmentId, disposition, {
          filename: att.filename,
          mimeType: att.mimeType
        }),
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
        const blob = await fetchAttachmentBlob(messageId, att, 'inline');
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
        const blob = await fetchAttachmentBlob(messageId, att, 'attachment');
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

    function bindAttachmentActions(messageId, attachments) {
      const root = document.querySelector('.mejl-atts');
      if (!root || !messageId) return;
      const byId = new Map();
      (Array.isArray(attachments) ? attachments : []).forEach((a) => {
        if (a && a.attachmentId) byId.set(String(a.attachmentId), a);
      });
      root.querySelectorAll('[data-mejl-att-preview]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-att-id') || '';
          const fromList = byId.get(id);
          previewAttachment(messageId, {
            attachmentId: (fromList && fromList.attachmentId) || id,
            filename:
              (fromList && fromList.filename) || btn.getAttribute('data-filename') || 'bilaga',
            mimeType: (fromList && fromList.mimeType) || btn.getAttribute('data-mime') || ''
          });
        });
      });
      root.querySelectorAll('[data-mejl-att-download]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-att-id') || '';
          const fromList = byId.get(id);
          downloadAttachment(messageId, {
            attachmentId: (fromList && fromList.attachmentId) || id,
            filename:
              (fromList && fromList.filename) || btn.getAttribute('data-filename') || 'bilaga',
            mimeType: (fromList && fromList.mimeType) || btn.getAttribute('data-mime') || ''
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

    function todayIsoDate() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }

    function uppdragOptionLabel(u) {
      const f = (u && (u.fields || u)) || {};
      const typ = f.Typ || f.typ || '';
      if (global.UppdragTyp && UppdragTyp.uppdragDisplayName) {
        return UppdragTyp.uppdragDisplayName(typ, f) || typ || u.id;
      }
      return f.Namn || typ || f.Name || u.id;
    }

    function userNameOptionsHtml(users, selectedName, placeholder) {
      const selected = String(selectedName || '').trim();
      const names = [];
      const seen = new Set();
      (users || []).forEach((u) => {
        const n = String((u && u.name) || '').trim();
        if (!n || seen.has(n)) return;
        seen.add(n);
        names.push(n);
      });
      if (selected && !seen.has(selected)) names.unshift(selected);
      let html = '<option value="">' + esc(placeholder || 'Välj…') + '</option>';
      names.forEach((n) => {
        html +=
          '<option value="' +
          esc(n) +
          '"' +
          (n === selected ? ' selected' : '') +
          '>' +
          esc(n) +
          '</option>';
      });
      return html;
    }

    async function loadCustomerMeta(customerId) {
      try {
        const res = await fetch(baseUrl + '/api/kunddata/' + encodeURIComponent(customerId), authOpts());
        const data = await res.json().catch(() => ({}));
        const fields =
          (data && data.record && data.record.fields) ||
          (data && data.fields) ||
          (data && data.data && data.data.fields) ||
          {};
        return {
          klientansvarig: String(fields['Klientansvarig'] || fields.Klientansvarig || '').trim(),
          byraId: String(fields['Byrå ID'] || fields['ByråID'] || fields.byraId || '').trim(),
          orgnr: String(fields['Orgnr'] || fields['Organisationsnummer'] || '').trim(),
          namn: String(fields['Namn'] || fields['Företagsnamn'] || '').trim()
        };
      } catch (_) {
        return { klientansvarig: '', byraId: '', orgnr: '', namn: '' };
      }
    }

    async function loadCustomerKlientansvarig(customerId) {
      const meta = await loadCustomerMeta(customerId);
      return meta.klientansvarig;
    }

    async function createEngangUppdrag(customerId, root, overrides) {
      const o = overrides || {};
      const namn = String(
        o.namn != null
          ? o.namn
          : (root.querySelector('#mejl-new-uppdrag-namn') || {}).value || ''
      ).trim();
      const ansvarig = String(
        o.ansvarig != null
          ? o.ansvarig
          : (root.querySelector('#mejl-new-uppdrag-ansvarig') || {}).value || ''
      ).trim();
      const klientansvarig = String(
        o.klientansvarig != null
          ? o.klientansvarig
          : (root.querySelector('#mejl-new-uppdrag-klientansvarig') || {}).value || ''
      ).trim();
      const deadline = String(
        o.deadline != null
          ? o.deadline
          : (root.querySelector('#mejl-new-uppdrag-deadline') || {}).value || ''
      ).trim();
      const egetTyp =
        (global.UppdragTyp && UppdragTyp.EGET_UPPDRAG_TYP) || 'Eget uppdrag';
      if (!namn) throw new Error('Ange ett namn på uppdraget (t.ex. Lön).');
      if (!klientansvarig) throw new Error('Välj klientansvarig.');
      if (!ansvarig) throw new Error('Välj handläggare.');
      if (!deadline) throw new Error('Ange deadline.');
      const today = todayIsoDate();
      const fields = {
        Namn: namn,
        Ansvarig: ansvarig,
        Klientansvarig: klientansvarig,
        Frekvens: 'Engång',
        Startdatum: today,
        'Nästa deadline': deadline,
        Status: 'Aktiv'
      };
      const res = await fetch(baseUrl + '/api/uppdrag', {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({ customerId, typ: egetTyp, fields })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Kunde inte skapa uppdrag');
      const record = data.record || data;
      if (!record || !record.id) throw new Error('Uppdraget skapades men id saknas');
      return { record, displayName: namn };
    }

    /** Sätt mejlstatus «uppgift skapad» och spara länk mejl ↔ körning/uppdrag. */
    function markUppgiftSkapadFromMejl(messageId, { runId, uppdragId }) {
      const mid = String(messageId || '').trim();
      if (!mid) return;
      try {
        const hs =
          global.MejlHandleStatus && MejlHandleStatus.createApi
            ? MejlHandleStatus.createApi()
            : null;
        if (hs) hs.set(mid, hs.TASK_CREATED || 'task_created');
      } catch (_) {}
      try {
        const linkApi =
          global.MejlTaskLink && MejlTaskLink.createApi ? MejlTaskLink.createApi() : null;
        if (linkApi) {
          linkApi.link({
            messageId: mid,
            runId: runId || '',
            uppdragId: uppdragId || ''
          });
        }
      } catch (_) {}
    }

    function mejlDeepLink(messageId) {
      const mid = String(messageId || '').trim();
      if (!mid || mid.startsWith('shared:')) return '';
      return 'mejl.html?messageId=' + encodeURIComponent(mid);
    }

    async function createUppgiftFromMejl(customerId, root, message, customerMeta, messageId) {
      const text = String((root.querySelector('#mejl-uppgift-text') || {}).value || '').trim();
      const ansvarig = String((root.querySelector('#mejl-uppgift-ansvarig') || {}).value || '').trim();
      const deadline = String((root.querySelector('#mejl-uppgift-deadline') || {}).value || '').trim();
      const meta = customerMeta || {};
      const klientansvarig = String(meta.klientansvarig || ansvarig || '').trim();
      const today = todayIsoDate();
      const mejlId = String(
        messageId || (message && (message.gmailMessageId || message.id || message.messageId)) || ''
      ).trim();
      const link = mejlDeepLink(mejlId.startsWith('shared:') ? (message && message.gmailMessageId) || '' : mejlId);
      const Koppla = global.MejlKopplaUppdrag || null;
      const notePayload = Koppla && typeof Koppla.buildUppgiftNotePayload === 'function'
        ? Koppla.buildUppgiftNotePayload({
          text,
          ansvarig,
          byraId: meta.byraId,
          orgnr: meta.orgnr,
          foretagsnamn: meta.namn,
          mejlSubject: (message && (message.subject || message.Subject)) || '',
          today,
          messageId: mejlId,
          mejlUrl: link
        })
        : (() => {
          if (!text) throw new Error('Ange vad som ska göras.');
          if (!ansvarig) throw new Error('Välj handläggare.');
          const subject = String((message && (message.subject || message.Subject)) || '').trim();
          const base = subject
            ? ('Uppgift från mejl: ' + subject + '\n\n' + text)
            : ('Uppgift från mejl\n\n' + text);
          return {
            typAvAnteckning: ['Emailkonversation'],
            datum: today,
            notes: link && base.indexOf(link) === -1 ? (base + '\n\n' + link) : base,
            mejlUrl: link,
            ToDo1: text,
            Status1: 'Att göra',
            name: ansvarig,
            byraId: meta.byraId,
            orgnr: meta.orgnr,
            foretagsnamn: meta.namn
          };
        })();
      const noteRes = await fetch(baseUrl + '/api/notes', {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify(notePayload)
      });
      const noteData = await noteRes.json().catch(() => ({}));
      if (!noteRes.ok) {
        throw new Error(noteData.message || noteData.error || 'Kunde inte skapa uppgift i anteckningar');
      }
      const created = await createEngangUppdrag(customerId, root, {
        namn: text,
        ansvarig,
        klientansvarig,
        deadline: deadline || today
      });
      return created;
    }

    async function openSaveWizard(id, m, customerId, onDone) {
      if (!customerId) { showToast('Koppla mejlet till en kund först.', 'error'); return; }
      const atts = Array.isArray(m.attachments) ? m.attachments : [];
      const currentUser =
        (global.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) || {};
      const currentUserName = String(currentUser.name || currentUser.Namn || '').trim();
      const [uppdrag, runs, users, customerMeta] = await Promise.all([
        loadUppdrag(customerId),
        loadRuns(customerId),
        loadByraUsers(),
        loadCustomerMeta(customerId)
      ]);
      const defaultKlient = customerMeta.klientansvarig || currentUserName;
      const attChecks = atts.length
        ? atts.map((a) =>
            '<label style="display:block;"><input type="checkbox" name="att" value="' +
            esc(a.attachmentId) + '" checked> ' + esc(a.filename || 'fil') + '</label>'
          ).join('')
        : '<p class="mejl-hint">Inga bilagor.</p>';
      const uppdragOpts = (uppdrag || []).map((u) => {
        return '<option value="' + esc(u.id) + '">' + esc(uppdragOptionLabel(u)) + '</option>';
      }).join('');
      const runOpts = (runs || []).map((r) => {
        const f = r.fields || r;
        const label = ((f['Period Label'] || f.PeriodKey || '') + (f.Typ ? ' · ' + f.Typ : '') + (f.Deadline ? ' (' + f.Deadline + ')' : '')) || r.id;
        return '<option value="' + esc(r.id) + '" data-uppdrag-id="' + esc(f['Uppdrag ID'] || '') + '">' + esc(label) + '</option>';
      }).join('');
      const today = todayIsoDate();
      const ansvarigOpts = userNameOptionsHtml(users, currentUserName, 'Välj handläggare');
      const klientOpts = userNameOptionsHtml(users, defaultKlient, 'Välj klientansvarig');
      const defaultUppgiftText = String((m && (m.subject || m.Subject)) || '').trim();
      const defaultMode = (runs && runs.length) ? 'korning' : 'dokumentation';

      openModal(
        'Koppla mejl / bilagor',
        '<div class="form-grid mejl-koppla-form">' +
          '<label><input type="checkbox" id="mejl-save-email" checked> Koppla hela mejlet</label>' +
          (atts.length
            ? '<label><input type="checkbox" id="mejl-save-atts"> Koppla bilagor (' +
              atts.length +
              ')</label>' +
              '<div id="mejl-save-atts-list" hidden><div class="mejl-labels-heading">Välj bilagor</div>' +
              attChecks +
              '</div>'
            : '<input type="checkbox" id="mejl-save-atts" hidden disabled>') +
          '<div><label class="mejl-label-edit-label" for="mejl-save-mode">Kopplingsmål</label>' +
          '<select id="mejl-save-mode" class="form-select form-input">' +
          '<option value="dokumentation"' +
          (defaultMode === 'dokumentation' ? ' selected' : '') +
          '>Dokumentation på kunden</option>' +
          '<option value="korning"' +
          (defaultMode === 'korning' ? ' selected' : '') +
          '>Uppdragskörning</option>' +
          '<option value="uppdrag">Uppdrag</option>' +
          '</select></div>' +
          '<div id="mejl-save-run-wrap" hidden><label class="mejl-label-edit-label" for="mejl-save-run">Körning</label>' +
          '<select id="mejl-save-run" class="form-select form-input"><option value="">Välj…</option>' +
          runOpts +
          '</select></div>' +
          '<div id="mejl-save-uppdrag-wrap" hidden>' +
          '<label class="mejl-label-edit-label" for="mejl-save-uppdrag">Uppdrag</label>' +
          '<select id="mejl-save-uppdrag" class="form-select form-input">' +
          '<option value="">Välj…</option>' +
          uppdragOpts +
          '</select></div>' +
          '<details id="mejl-koppla-advanced" class="mejl-koppla-advanced">' +
          '<summary>Fler alternativ</summary>' +
          '<div class="form-grid" style="margin-top:0.5rem;">' +
          '<label><input type="checkbox" id="mejl-save-split"> Dela upp: mejl→dokumentation, bilagor→körning/uppdrag</label>' +
          '<div><label class="mejl-label-edit-label" for="mejl-advanced-action">Skapa från mejlet</label>' +
          '<select id="mejl-advanced-action" class="form-select form-input">' +
          '<option value="">Ingen (bara koppla)</option>' +
          '<option value="new-uppdrag">Skapa enstaka uppdrag…</option>' +
          '<option value="uppgift">Skapa uppgift (Mina uppgifter)…</option>' +
          '</select></div>' +
          '<div id="mejl-new-uppdrag-wrap" hidden class="form-grid mejl-koppla-subform">' +
          '<div><label class="mejl-label-edit-label" for="mejl-new-uppdrag-namn">Namn på uppdrag *</label>' +
          '<input type="text" id="mejl-new-uppdrag-namn" class="form-input" placeholder="t.ex. Lön, Extra bokföring"></div>' +
          '<div><label class="mejl-label-edit-label" for="mejl-new-uppdrag-klientansvarig">Klientansvarig *</label>' +
          '<select id="mejl-new-uppdrag-klientansvarig" class="form-select form-input">' +
          klientOpts +
          '</select></div>' +
          '<div><label class="mejl-label-edit-label" for="mejl-new-uppdrag-ansvarig">Handläggare *</label>' +
          '<select id="mejl-new-uppdrag-ansvarig" class="form-select form-input">' +
          ansvarigOpts +
          '</select></div>' +
          '<div><label class="mejl-label-edit-label" for="mejl-new-uppdrag-deadline">Deadline *</label>' +
          '<input type="date" id="mejl-new-uppdrag-deadline" class="form-input" value="' +
          esc(today) +
          '"></div>' +
          '<p class="mejl-hint" style="margin:0;">Skapas som Eget uppdrag med frekvens Engång (en körning).</p>' +
          '</div>' +
          '<div id="mejl-uppgift-wrap" hidden class="form-grid mejl-koppla-subform">' +
          '<div><label class="mejl-label-edit-label" for="mejl-uppgift-text">Uppgift *</label>' +
          '<input type="text" id="mejl-uppgift-text" class="form-input" placeholder="Beskriv vad som ska göras…" value="' +
          esc(defaultUppgiftText) +
          '"></div>' +
          '<div><label class="mejl-label-edit-label" for="mejl-uppgift-ansvarig">Handläggare *</label>' +
          '<select id="mejl-uppgift-ansvarig" class="form-select form-input">' +
          ansvarigOpts +
          '</select></div>' +
          '<div><label class="mejl-label-edit-label" for="mejl-uppgift-deadline">Deadline *</label>' +
          '<input type="date" id="mejl-uppgift-deadline" class="form-input" value="' +
          esc(today) +
          '"></div>' +
          '<p class="mejl-hint" style="margin:0;">Skapas som Att göra (Mina uppgifter) och engångsuppdrag för kalendern.</p>' +
          '</div>' +
          '</div></details>' +
          '</div>',
        async (root) => {
          const advancedAction = String((root.querySelector('#mejl-advanced-action') || {}).value || '');
          const splitOn = !!(root.querySelector('#mejl-save-split') || {}).checked;
          let mode = root.querySelector('#mejl-save-mode').value;
          if (advancedAction === 'uppgift') mode = 'uppgift';
          else if (splitOn) mode = 'split';
          else if (advancedAction === 'new-uppdrag' && mode === 'dokumentation') mode = 'uppdrag';
          const includeEmail = root.querySelector('#mejl-save-email').checked;
          const saveAtts = root.querySelector('#mejl-save-atts').checked;
          const selectedAtts = [...root.querySelectorAll('input[name="att"]:checked')].map((el) => el.value);
          const uppdragEl = root.querySelector('#mejl-save-uppdrag');
          const runEl = root.querySelector('#mejl-save-run');
          let uppdragId = (uppdragEl || {}).value || '';
          let runId = (runEl || {}).value || '';
          let uppdragName =
            uppdragEl && uppdragEl.selectedIndex > 0 && uppdragId
              ? String(uppdragEl.options[uppdragEl.selectedIndex].textContent || '').trim()
              : '';
          let runName =
            runEl && runEl.selectedIndex > 0
              ? String(runEl.options[runEl.selectedIndex].textContent || '').trim()
              : '';

          if (advancedAction === 'new-uppdrag') uppdragId = '__new__';

          if (mode === 'uppgift') {
            try {
              const created = await createUppgiftFromMejl(customerId, root, m, customerMeta, id);
              uppdragId = created.record.id;
              uppdragName = created.displayName;
              const freshRuns = await loadRuns(customerId);
              const match = (freshRuns || []).find((r) => {
                const f = r.fields || r;
                return String(f['Uppdrag ID'] || '').trim() === uppdragId;
              });
              if (match) {
                runId = match.id;
                const f = match.fields || match;
                runName =
                  ((f['Period Label'] || f.PeriodKey || '') +
                    (f.Typ ? ' · ' + f.Typ : '') +
                    (f.Deadline ? ' (' + f.Deadline + ')' : '')) ||
                  uppdragName ||
                  match.id;
              }
              markUppgiftSkapadFromMejl(id, { runId, uppdragId });
            } catch (err) {
              showToast((err && err.message) || 'Kunde inte skapa uppgift', 'error');
              return;
            }
          } else if ((mode === 'uppdrag' || mode === 'split' || mode === 'korning') && uppdragId === '__new__') {
            try {
              const created = await createEngangUppdrag(customerId, root);
              uppdragId = created.record.id;
              uppdragName = created.displayName;
              if (mode === 'korning' || mode === 'split') {
                const freshRuns = await loadRuns(customerId);
                const match = (freshRuns || []).find((r) => {
                  const f = r.fields || r;
                  return String(f['Uppdrag ID'] || '').trim() === uppdragId;
                });
                if (match) {
                  runId = match.id;
                  const f = match.fields || match;
                  runName =
                    ((f['Period Label'] || f.PeriodKey || '') +
                      (f.Typ ? ' · ' + f.Typ : '') +
                      (f.Deadline ? ' (' + f.Deadline + ')' : '')) ||
                    uppdragName ||
                    match.id;
                } else if (mode === 'korning') {
                  showToast('Körning saknas ännu — kopplar till det nya uppdraget.', 'info');
                }
              }
            } catch (err) {
              showToast((err && err.message) || 'Kunde inte skapa uppdrag', 'error');
              return;
            }
          }

          let targets = [];
          if (mode === 'dokumentation') {
            targets = [{ type: 'dokumentation', customerId, includeEmail, attachmentIds: saveAtts ? selectedAtts : [] }];
          } else if (mode === 'uppdrag') {
            if (!uppdragId || uppdragId === '__new__') { showToast('Välj eller skapa ett uppdrag.', 'error'); return; }
            targets = [{
              type: 'uppdrag',
              uppdragId,
              uppdragName,
              customerId,
              includeEmail,
              attachmentIds: saveAtts ? selectedAtts : []
            }];
          } else if (mode === 'korning') {
            if (runId) {
              targets = [{
                type: 'korning',
                runId,
                runName,
                customerId,
                includeEmail,
                attachmentIds: saveAtts ? selectedAtts : []
              }];
            } else if (uppdragId && uppdragId !== '__new__') {
              targets = [{
                type: 'uppdrag',
                uppdragId,
                uppdragName,
                customerId,
                includeEmail,
                attachmentIds: saveAtts ? selectedAtts : []
              }];
            } else {
              showToast('Välj en körning eller skapa ett enstaka uppdrag.', 'error');
              return;
            }
          } else if (mode === 'uppgift') {
            // Uppgift + engångsuppdrag skapades redan; koppla mejl/bilagor till körning/uppdrag om valt.
            const wantsAttach = includeEmail || (saveAtts && selectedAtts.length);
            if (wantsAttach) {
              if (runId) {
                targets = [{
                  type: 'korning',
                  runId,
                  runName,
                  customerId,
                  includeEmail,
                  attachmentIds: saveAtts ? selectedAtts : []
                }];
              } else if (uppdragId && uppdragId !== '__new__') {
                targets = [{
                  type: 'uppdrag',
                  uppdragId,
                  uppdragName,
                  customerId,
                  includeEmail,
                  attachmentIds: saveAtts ? selectedAtts : []
                }];
              } else {
                showToast('Uppgift skapad, men ingen körning/uppdrag att koppla mejlet till. Mejlet har status Uppgift skapad.', 'info');
                closeModal();
                if (onDone) await onDone();
                return;
              }
            } else {
              showToast('Uppgift skapad (Mina uppgifter + kalender). Mejlet har status Uppgift skapad.', 'success');
              closeModal();
              if (onDone) await onDone();
              return;
            }
          } else {
            if (includeEmail) targets.push({ type: 'dokumentation', customerId, includeEmail: true, attachmentIds: [] });
            if (saveAtts && selectedAtts.length) {
              if (runId) {
                targets.push({
                  type: 'korning',
                  runId,
                  runName,
                  customerId,
                  includeEmail: false,
                  attachmentIds: selectedAtts
                });
              } else if (uppdragId && uppdragId !== '__new__') {
                targets.push({
                  type: 'uppdrag',
                  uppdragId,
                  uppdragName,
                  customerId,
                  includeEmail: false,
                  attachmentIds: selectedAtts
                });
              } else { showToast('Välj uppdrag eller körning för bilagor.', 'error'); return; }
            }
          }
          if (!targets.length) { showToast('Inget att koppla.', 'error'); return; }
          const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/save', {
            method: 'POST', ...authOpts(),
            body: JSON.stringify({ customerId, includeEmail: false, saveAttachments: false, targets })
          });
          const data = await res.json().catch(() => ({}));
          const nOk = (data.results || []).filter((r) => !r.error).length;
          const errResults = (data.results || []).filter((r) => r.error);
          const nErr = errResults.length;
          const firstResultErr = errResults[0] && errResults[0].error;
          if (!res.ok || data.success === false) {
            showToast(data.error || firstResultErr || 'Kunde inte koppla', 'error');
            return;
          }
          if (nErr && !nOk) {
            showToast(firstResultErr || 'Kunde inte koppla', 'error');
            return;
          }
          const destLabel =
            data.destinationLabel ||
            (Array.isArray(data.destinations) && data.destinations.length
              ? data.destinations.join('; ')
              : '') ||
            runName ||
            uppdragName ||
            '';
          const okMsg = destLabel
            ? 'Kopplat till ' + destLabel + ' (' + nOk + ' objekt).'
            : 'Kopplat (' + nOk + ' objekt).';
          showToast(
            nErr
              ? 'Kopplat ' +
                  nOk +
                  (destLabel ? ' till ' + destLabel : '') +
                  ', ' +
                  nErr +
                  ' fel' +
                  (firstResultErr ? ': ' + firstResultErr : '.')
              : okMsg,
            nErr ? 'error' : 'success'
          );
          closeModal();
          archiveState = data.archive || archiveState;
          if (onDone) await onDone();
        },
        'Koppla'
      );
      const modeEl = document.getElementById('mejl-save-mode');
      const attsEl = document.getElementById('mejl-save-atts');
      const advancedActionEl = document.getElementById('mejl-advanced-action');
      const splitEl = document.getElementById('mejl-save-split');
      const sync = () => {
        const mode = modeEl ? modeEl.value : 'dokumentation';
        const advancedAction = advancedActionEl ? advancedActionEl.value : '';
        const splitOn = !!(splitEl && splitEl.checked);
        const effectiveMode = advancedAction === 'uppgift' ? 'uppgift' : splitOn ? 'split' : mode;
        const u = document.getElementById('mejl-save-uppdrag-wrap');
        const r = document.getElementById('mejl-save-run-wrap');
        const neu = document.getElementById('mejl-new-uppdrag-wrap');
        const uppg = document.getElementById('mejl-uppgift-wrap');
        const attsList = document.getElementById('mejl-save-atts-list');
        if (r) r.hidden = !(effectiveMode === 'korning' || effectiveMode === 'split');
        if (u) u.hidden = !(effectiveMode === 'uppdrag' || effectiveMode === 'split');
        if (uppg) uppg.hidden = advancedAction !== 'uppgift';
        if (neu) neu.hidden = advancedAction !== 'new-uppdrag';
        if (attsList) attsList.hidden = !(attsEl && attsEl.checked);
        if (modeEl) modeEl.disabled = advancedAction === 'uppgift';
      };
      if (modeEl) modeEl.addEventListener('change', sync);
      if (attsEl) attsEl.addEventListener('change', sync);
      if (advancedActionEl) advancedActionEl.addEventListener('change', sync);
      if (splitEl) splitEl.addEventListener('change', sync);
      sync();
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
        '<p class="mejl-hint">Mottagaren ser mejlet under <strong>Delat med mig</strong> i Mejl — även utan egen Gmail-koppling. Privata mejl syns bara för dig och dem du delar med.</p><div>' + opts + '</div>',
        async (root) => {
          const ids = [...root.querySelectorAll('input[name="share"]:checked')].map((el) => el.value);
          const remove = [...shared].filter((x) => !ids.includes(x));
          const res = await fetch(baseUrl + '/api/gmail/messages/' + encodeURIComponent(id) + '/share', {
            method: 'POST', ...authOpts(),
            body: JSON.stringify({ customerId, userIds: ids, remove })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) { showToast(data.error || 'Kunde inte dela', 'error'); return; }
          showToast(
            ids.length
              ? 'Delning uppdaterad. Mottagaren hittar mejlet under Delat med mig.'
              : 'Delning uppdaterad.',
            'success'
          );
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
      bindAttachmentActions(id, message && message.attachments);
    }

    return {
      fetchArchive,
      archiveMetaHtml,
      toolbarHtml,
      attachmentsHtml,
      bindDetailButtons,
      bindAttachmentActions,
      openSaveWizard,
      getArchiveState: () => archiveState
    };
  }

  global.MejlArchive = { createApi };
})(window);
