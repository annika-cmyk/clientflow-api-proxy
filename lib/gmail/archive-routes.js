/**
 * HTTP-routes för Mejlarkiv (spara/dela/privat/maska).
 */
const api = require('./api');
const archiveAccess = require('./archive-access');
const archiveStore = require('./archive-store');
const archiveSave = require('./archive-save');
const access = require('../access');

function registerArchiveRoutes(app, ctx) {
  const {
    authenticateToken,
    requireUser,
    getValidAccessToken,
    getAccessibleCustomer
  } = ctx;

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
      const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
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
      res.status(500).json({ success: false, error: err.message });
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
      res.status(500).json({ success: false, error: err.message });
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

      for (const target of targets) {
        const t = { ...target, customerId: target.customerId || customerId };
        const targetIncludeEmail =
          target.includeEmail === true ||
          (target.includeEmail !== false && includeEmail && !Array.isArray(target.attachmentIds));

        if (targetIncludeEmail) {
          try {
            const text = archiveSave.buildEmailSnapshotText(summary);
            const fname = archiveSave.buildEmailSnapshotFilename(summary);
            const saved = await archiveSave.saveBufferToTarget(Buffer.from(text, 'utf8'), fname, 'text/plain', t);
            results.push({ kind: 'email', ...saved });
            savedTo.push({
              type: saved.type,
              customerId: saved.customerId || customerId,
              uppdragId: saved.uppdragId || null,
              runId: saved.runId || null,
              filename: saved.filename,
              at: new Date().toISOString()
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
              results.push({ kind: 'attachment', ...saved });
              savedTo.push({
                type: saved.type,
                customerId: saved.customerId || customerId,
                uppdragId: saved.uppdragId || null,
                runId: saved.runId || null,
                filename: saved.filename,
                gmailAttachmentId: att.attachmentId,
                at: new Date().toISOString()
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

      const errors = results.filter((r) => r.error);
      res.json({
        success: errors.length === 0 || results.some((r) => !r.error),
        results,
        errors: errors.length ? errors : undefined,
        archive: archiveAccess.presentArchivedMail(user, archive),
        attachments: allAtt
      });
    } catch (err) {
      console.error('gmail/save:', err.response?.data || err.message);
      const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
      res.status(status).json({ success: false, error: err.response?.data?.error?.message || err.message });
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
      const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
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
      const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
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
      record = await archiveStore.updateRecord(record.id, { maskedRanges });
      res.json({ success: true, archive: archiveAccess.presentArchivedMail(user, record) });
    } catch (err) {
      console.error('gmail/mask:', err.message);
      const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
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
      if (!result.ok) return res.status(500).json({ success: false, error: result.error });
      res.json({
        success: true,
        message: result.created ? 'Tabellen Mejlarkiv skapades.' : 'Tabellen Mejlarkiv finns redan.',
        ...result
      });
    } catch (err) {
      console.error('setup mejlarkiv:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

module.exports = { registerArchiveRoutes };
