/**
 * HTTP-routes för Mejlarkiv (spara/dela/privat/maska).
 */
const api = require('./api');
const archiveAccess = require('./archive-access');
const archiveStore = require('./archive-store');
const archiveSave = require('./archive-save');
const access = require('../access');
const { htmlToPlainText } = require('../html-plain-text');

function registerArchiveRoutes(app, ctx) {
  const {
    authenticateToken,
    requireUser,
    getValidAccessToken,
    getAccessibleCustomer
  } = ctx;

  function archiveErrorStatus(err) {
    if (!err) return 500;
    if (err.code === 'GMAIL_NOT_CONNECTED' || err.code === 'AIRTABLE_CONFIG') return 400;
    if (err.code === 'NOT_FOUND' || err.code === 'KORNING_MISSING_UPPDRAG') return 404;
    if (
      err.code === 'MEJLARKIV_SETUP' ||
      err.code === 'AIRTABLE_TABLE_MISSING' ||
      err.code === 'AIRTABLE_ATTACHMENT_FIELD'
    ) {
      return 503;
    }
    return 500;
  }

  function archiveErrorMessage(err) {
    return archiveStore.formatArchiveStoreError(err);
  }

  async function loadMessageSummary(user, messageId) {
    const { accessToken } = await getValidAccessToken(user);
    const raw = await api.getMessage(accessToken, messageId, 'full');
    return { accessToken, summary: api.summarizeMessage(raw), raw };
  }

  async function requireCustomerAccess(user, customerId, res) {
    const id = String(customerId || '').trim();
    if (!id) {
      res.status(400).json({ success: false, error: 'customerId saknas' });
      return null;
    }
    if (typeof getAccessibleCustomer !== 'function') {
      res.status(500).json({ success: false, error: 'Kundaccess saknas' });
      return null;
    }
    const customer = await getAccessibleCustomer(user, id);
    if (!customer) {
      res.status(403).json({ success: false, error: 'Ingen behörighet till kunden' });
      return null;
    }
    return customer;
  }

  function normalizeSaveTargets(body) {
    const targets = [];
    const list = Array.isArray(body.targets) ? body.targets : body.target ? [body.target] : [];
    for (const t of list) {
      if (!t || typeof t !== 'object') continue;
      targets.push({
        type: String(t.type || 'dokumentation').toLowerCase(),
        customerId: t.customerId || body.customerId || null,
        uppdragId: t.uppdragId || t.recordId || null,
        runId: t.runId || null,
        recordId: t.recordId || null,
        uppdragName: t.uppdragName || t.uppdragLabel || null,
        runName: t.runName || t.runLabel || t.periodLabel || null,
        attachmentIds: Array.isArray(t.attachmentIds) ? t.attachmentIds : null,
        includeEmail: t.includeEmail === true
      });
    }
    if (!targets.length && body.customerId) {
      targets.push({
        type: String(body.targetType || 'dokumentation').toLowerCase(),
        customerId: body.customerId,
        uppdragId: body.uppdragId || null,
        runId: body.runId || null,
        uppdragName: body.uppdragName || null,
        runName: body.runName || null,
        includeEmail: body.includeEmail !== false,
        attachmentIds: Array.isArray(body.attachmentIds) ? body.attachmentIds : null
      });
    }
    return targets;
  }

  app.get('/api/gmail/messages/:id/archive', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const messageId = String(req.params.id || '').trim();
      const customerId = String(req.query.customerId || '').trim();
      if (customerId) {
        const ok = await requireCustomerAccess(user, customerId, res);
        if (!ok) return;
      }
      const record = await archiveStore.findByGmailMessageId(messageId, customerId || undefined);
      if (!record) return res.json({ success: true, archive: null });
      if (!customerId) {
        const ok = await requireCustomerAccess(user, record.customerId, res);
        if (!ok) return;
      }
      if (!archiveAccess.canViewArchivedMail(user, record)) {
        return res.status(403).json({ success: false, error: 'Privat mejl – ingen behörighet' });
      }
      res.json({ success: true, archive: archiveAccess.presentArchivedMail(user, record) });
    } catch (err) {
      console.error('gmail/archive get:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  app.get('/api/gmail/archive', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const customerId = String(req.query.customerId || '').trim();
      const customer = await requireCustomerAccess(user, customerId, res);
      if (!customer) return;
      const rows = await archiveStore.listByCustomerId(customerId);
      const visible = rows
        .filter((r) => archiveAccess.canViewArchivedMail(user, r))
        .map((r) => archiveAccess.presentArchivedMail(user, r));
      res.json({ success: true, customerId, archives: visible });
    } catch (err) {
      console.error('gmail/archive list:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  /** Delade mejl till inloggad användare – syns även utan Gmail-koppling. */
  app.get('/api/gmail/archive/shared-with-me', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const rows = await archiveStore.listSharedWithUser(user.id);
      const visible = [];
      for (const row of rows) {
        if (!archiveAccess.canViewArchivedMail(user, row)) continue;
        if (!archiveAccess.isSharedWith(user, row)) continue;
        if (typeof getAccessibleCustomer === 'function') {
          const customer = await getAccessibleCustomer(user, row.customerId);
          if (!customer) continue;
          const presented = archiveAccess.presentArchivedMail(user, row);
          const namn = customer.namn || customer.name || '';
          visible.push({
            ...presented,
            customerName: String(namn || '').trim()
          });
        } else {
          visible.push(archiveAccess.presentArchivedMail(user, row));
        }
      }
      visible.sort((a, b) => {
        const da = Date.parse(a.date || '') || 0;
        const db = Date.parse(b.date || '') || 0;
        return db - da;
      });
      res.json({ success: true, archives: visible });
    } catch (err) {
      console.error('gmail/archive shared-with-me:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  app.get('/api/gmail/archive/:archiveId', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const record = await archiveStore.getById(req.params.archiveId);
      if (!record) return res.status(404).json({ success: false, error: 'Hittades inte' });
      const customer = await requireCustomerAccess(user, record.customerId, res);
      if (!customer) return;
      if (!archiveAccess.canViewArchivedMail(user, record)) {
        return res.status(403).json({ success: false, error: 'Privat mejl – ingen behörighet' });
      }
      res.json({ success: true, archive: archiveAccess.presentArchivedMail(user, record) });
    } catch (err) {
      console.error('gmail/archive one:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  app.post('/api/gmail/messages/:id/save', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const messageId = String(req.params.id || '').trim();
      const body = req.body || {};
      const customerId = String(body.customerId || '').trim();
      const customer = await requireCustomerAccess(user, customerId, res);
      if (!customer) return;

      const { accessToken, summary } = await loadMessageSummary(user, messageId);
      const targets = normalizeSaveTargets(body);
      if (!targets.length) {
        return res.status(400).json({ success: false, error: 'Ange minst ett sparmål' });
      }

      const saveAttachments = body.saveAttachments !== false;
      const includeEmail = body.includeEmail !== false;
      const allAtt = summary.attachments || [];
      const results = [];
      const savedTo = [];
      const attachmentMeta = [];
      const destinations = [];

      function rememberDestination(saved) {
        const dest = archiveSave.formatSaveDestination(saved);
        if (dest && !destinations.includes(dest)) destinations.push(dest);
        return dest;
      }

      function pushSavedEntry(kind, saved, extra = {}) {
        const dest = rememberDestination(saved);
        results.push({ kind, ...saved, destination: dest });
        savedTo.push({
          type: saved.type,
          customerId: saved.customerId || customerId,
          uppdragId: saved.uppdragId || null,
          runId: saved.runId || null,
          uppdragName: saved.uppdragName || extra.uppdragName || null,
          runName: saved.runName || saved.runLabel || extra.runName || null,
          runLabel: saved.runLabel || saved.runName || null,
          deadline: saved.deadline || null,
          fieldName: saved.fieldName || null,
          writePath: saved.writePath || null,
          filename: saved.filename,
          at: new Date().toISOString(),
          ...extra
        });
      }

      for (const target of targets) {
        const t = { ...target, customerId: target.customerId || customerId };
        const targetIncludeEmail =
          target.includeEmail === true ||
          (target.includeEmail !== false && includeEmail && !Array.isArray(target.attachmentIds));

        if (targetIncludeEmail) {
          try {
            const snap = archiveSave.buildEmailSnapshotHtml(summary);
            const fname = archiveSave.buildEmailSnapshotFilename(summary);
            const saved = await archiveSave.saveBufferToTarget(Buffer.from(snap, 'utf8'), fname, 'text/html; charset=utf-8', t);
            pushSavedEntry('email', saved, {
              uppdragName: t.uppdragName || null,
              runName: t.runName || null
            });
          } catch (err) {
            results.push({ kind: 'email', error: err.message, target: t });
          }
        }

        const shouldSaveAtts =
          saveAttachments || (Array.isArray(target.attachmentIds) && target.attachmentIds.length > 0);
        if (shouldSaveAtts && allAtt.length) {
          let selected = allAtt;
          if (Array.isArray(target.attachmentIds) && target.attachmentIds.length) {
            const set = new Set(target.attachmentIds.map(String));
            selected = allAtt.filter((a) => set.has(String(a.attachmentId)));
          } else if (Array.isArray(body.attachmentIds) && body.attachmentIds.length && !target.attachmentIds) {
            const set = new Set(body.attachmentIds.map(String));
            selected = allAtt.filter((a) => set.has(String(a.attachmentId)));
          }
          for (const att of selected) {
            try {
              const buf = await api.getAttachment(accessToken, messageId, att.attachmentId);
              if (!buf.length) {
                results.push({ kind: 'attachment', filename: att.filename, error: 'Tom fil' });
                continue;
              }
              if (buf.length > 10 * 1024 * 1024) {
                results.push({ kind: 'attachment', filename: att.filename, error: 'Filen är för stor (max 10 MB)' });
                continue;
              }
              const saved = await archiveSave.saveBufferToTarget(buf, att.filename, att.mimeType, t);
              pushSavedEntry('attachment', saved, {
                gmailAttachmentId: att.attachmentId,
                uppdragName: t.uppdragName || null,
                runName: t.runName || null
              });
              attachmentMeta.push({
                filename: att.filename,
                mimeType: att.mimeType,
                size: att.size,
                gmailAttachmentId: att.attachmentId
              });
            } catch (err) {
              results.push({ kind: 'attachment', filename: att.filename, error: err.message });
            }
          }
        }
      }

      const errors = results.filter((r) => r.error);
      const okCount = results.filter((r) => !r.error).length;
      const firstErr = errors[0] && errors[0].error;

      if (!okCount) {
        return res.status(errors.length ? 500 : 400).json({
          success: false,
          results,
          errors: errors.length ? errors : undefined,
          error: firstErr || 'Inget sparades – kontrollera att mejl eller bilagor är valda.',
          destinations: []
        });
      }

      const visibility = body.visibility ? archiveAccess.normalizeVisibility(body.visibility) : undefined;
      const existing = await archiveStore.findByGmailMessageId(messageId, customerId);
      const archive = await archiveStore.upsertFromMessage({
        user,
        customerId,
        message: summary,
        visibility,
        savedTo: [...((existing && existing.savedTo) || []), ...savedTo],
        attachmentMeta: [...((existing && existing.attachmentMeta) || []), ...attachmentMeta]
      });

      res.json({
        success: errors.length === 0,
        partial: errors.length > 0,
        results,
        errors: errors.length ? errors : undefined,
        error: errors.length ? firstErr : undefined,
        destinations,
        destinationLabel: destinations.join('; ') || null,
        archive: archiveAccess.presentArchivedMail(user, archive),
        attachments: allAtt
      });
    } catch (err) {
      console.error('gmail/save:', err.response?.data || err.message);
      res.status(archiveErrorStatus(err)).json({
        success: false,
        error: archiveErrorMessage(err),
        hint:
          err.code === 'MEJLARKIV_SETUP'
            ? 'Kör node scripts/setup-mejlarkiv.js eller POST /api/setup/airtable-mejlarkiv'
            : undefined
      });
    }
  });

  app.post('/api/gmail/messages/:id/visibility', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const messageId = String(req.params.id || '').trim();
      const body = req.body || {};
      const customerId = String(body.customerId || '').trim();
      const customer = await requireCustomerAccess(user, customerId, res);
      if (!customer) return;
      const visibility = archiveAccess.normalizeVisibility(body.visibility);
      let record = await archiveStore.findByGmailMessageId(messageId, customerId);
      if (!record) {
        // Auto-skapa Mejlarkiv-post (skapar tabell vid behov) och sätt synlighet.
        const { summary } = await loadMessageSummary(user, messageId);
        record = await archiveStore.upsertFromMessage({ user, customerId, message: summary, visibility });
      } else {
        if (!archiveAccess.isOwner(user, record) && !access.isClientFlowAdmin(user.role)) {
          return res.status(403).json({ success: false, error: 'Endast ägare kan ändra synlighet' });
        }
        record = await archiveStore.updateRecord(record.id, { visibility });
      }
      res.json({ success: true, archive: archiveAccess.presentArchivedMail(user, record) });
    } catch (err) {
      console.error('gmail/visibility:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  app.post('/api/gmail/messages/:id/share', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const messageId = String(req.params.id || '').trim();
      const body = req.body || {};
      const customerId = String(body.customerId || '').trim();
      const customer = await requireCustomerAccess(user, customerId, res);
      if (!customer) return;
      const addIds = archiveAccess.parseSharedWith(body.userIds || body.sharedWith || body.add);
      const removeIds = new Set(archiveAccess.parseSharedWith(body.remove));
      let record = await archiveStore.findByGmailMessageId(messageId, customerId);
      if (!record) {
        const { summary } = await loadMessageSummary(user, messageId);
        record = await archiveStore.upsertFromMessage({
          user,
          customerId,
          message: summary,
          visibility: archiveAccess.VISIBILITY_BYRA,
          sharedWith: addIds
        });
      } else {
        if (!archiveAccess.isOwner(user, record) && !access.isClientFlowAdmin(user.role)) {
          return res.status(403).json({ success: false, error: 'Endast ägare kan dela mejl' });
        }
        let shared = archiveAccess.parseSharedWith(record.sharedWith);
        if (addIds.length) shared = [...new Set([...shared, ...addIds])];
        if (removeIds.size) shared = shared.filter((id) => !removeIds.has(id));
        record = await archiveStore.updateRecord(record.id, { sharedWith: shared });
      }
      res.json({ success: true, archive: archiveAccess.presentArchivedMail(user, record) });
    } catch (err) {
      console.error('gmail/share:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  app.post('/api/gmail/messages/:id/mask', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      const messageId = String(req.params.id || '').trim();
      const body = req.body || {};
      const customerId = String(body.customerId || '').trim();
      const customer = await requireCustomerAccess(user, customerId, res);
      if (!customer) return;
      let added = archiveAccess.normalizeMaskedRanges(body.ranges || body.maskedRanges || []);
      if (!added.length && body.start != null && body.end != null) {
        added = archiveAccess.normalizeMaskedRanges([
          { start: body.start, end: body.end, field: body.field || 'text' }
        ]);
      }
      if (!added.length) {
        return res.status(400).json({ success: false, error: 'Ange ranges att maska' });
      }
      let record = await archiveStore.findByGmailMessageId(messageId, customerId);
      if (!record) {
        const { summary } = await loadMessageSummary(user, messageId);
        record = await archiveStore.upsertFromMessage({ user, customerId, message: summary });
      }
      if (!archiveAccess.isOwner(user, record) && !access.isClientFlowAdmin(user.role)) {
        return res.status(403).json({ success: false, error: 'Endast ägare kan maska mejl' });
      }
      const maskedRanges = archiveAccess.mergeMaskedRanges(record.maskedRanges, added);
      const patch = { maskedRanges };
      // Säkerställ bodyText när mejlet bara har HTML, så text-ranges träffar rätt.
      const clientBodyText = String(body.bodyText || '').trim();
      if (!String(record.bodyText || '').trim()) {
        patch.bodyText =
          clientBodyText ||
          (record.bodyHtml ? htmlToPlainText(record.bodyHtml) : '') ||
          '';
      }
      record = await archiveStore.updateRecord(record.id, patch);
      res.json({ success: true, archive: archiveAccess.presentArchivedMail(user, record) });
    } catch (err) {
      console.error('gmail/mask:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });

  app.post('/api/setup/airtable-mejlarkiv', authenticateToken, async (req, res) => {
    try {
      const user = await requireUser(req, res);
      if (!user) return;
      if (!access.isClientFlowAdmin(user.role) && !access.isLedare(user.role)) {
        return res.status(403).json({ success: false, error: 'Endast Ledare eller Admin' });
      }
      const result = await archiveStore.ensureMejlarkivTable();
      if (!result.ok) return res.status(503).json({ success: false, error: result.error });
      res.json({
        success: true,
        message: result.created ? 'Tabellen Mejlarkiv skapades.' : 'Tabellen Mejlarkiv finns redan.',
        ...result
      });
    } catch (err) {
      console.error('setup mejlarkiv:', err.message);
      res.status(archiveErrorStatus(err)).json({ success: false, error: archiveErrorMessage(err) });
    }
  });
}

module.exports = { registerArchiveRoutes };
