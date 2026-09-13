/**
 * Mejl-tilläggsroutes: sidfot, BankID-skyddade utskick, compose-hjälp.
 */
const signature = require('./signature');
const signatureStore = require('./signature-store');
const protectedStore = require('./protected-store');
const composeHtml = require('./compose-html');
const samarbeteBankid = require('../samarbete-bankid');
const samarbeteFragor = require('../samarbete-fragor');

function publicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (req) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    if (host) return `${proto}://${host}`;
  }
  return 'https://www.app.clientflow.se';
}

function createMejlExtras(deps) {
  const { authenticateToken, getAirtableUser } = deps;

  async function requireUser(req, res) {
    const user = await getAirtableUser(req.user.email);
    if (!user || !user.id) {
      res.status(401).json({ success: false, error: 'Användare hittades inte' });
      return null;
    }
    return user;
  }

  function registerRoutes(app) {
    app.get('/api/mejl/signature', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        let settings = signature.normalizeSettings({});
        try {
          settings = await signatureStore.loadSignature(user.id);
        } catch (err) {
          console.warn('mejl/signature load:', err.message);
        }
        if (!settings.name && user.name) settings.name = String(user.name).trim();
        if (!settings.email && (user.email || req.user.email)) {
          settings.email = String(user.email || req.user.email).trim();
        }
        res.json({
          success: true,
          settings,
          layouts: signature.LAYOUTS,
          previewHtml: signature.renderSignatureHtml(settings)
        });
      } catch (err) {
        console.error('GET /api/mejl/signature:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.put('/api/mejl/signature', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const saved = await signatureStore.saveSignature(
          user.id,
          req.body && req.body.settings ? req.body.settings : req.body
        );
        res.json({
          success: true,
          settings: saved,
          previewHtml: signature.renderSignatureHtml(saved)
        });
      } catch (err) {
        console.error('PUT /api/mejl/signature:', err.message);
        const clientCodes = new Set([
          'IMAGE_TOO_LARGE',
          'SIGNATURE_TOO_LARGE',
          'SIGNATURE_SAVE_FAILED'
        ]);
        const status = clientCodes.has(err.code) ? 400 : 500;
        const message =
          err.message && !/^Request failed with status code \d+$/i.test(err.message)
            ? err.message
            : 'Kunde inte spara sidfoten. Kontrollera bilderna och försök igen.';
        res.status(status).json({ success: false, error: message, code: err.code || null });
      }
    });

    app.post('/api/mejl/signature/preview', authenticateToken, async (req, res) => {
      try {
        const settings = signature.normalizeSettings(
          req.body && req.body.settings ? req.body.settings : req.body
        );
        res.json({
          success: true,
          previewHtml: signature.renderSignatureHtml(settings),
          previewText: signature.plainTextSignature(settings)
        });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/mejl/protected', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const body = req.body || {};
        const created = protectedStore.createProtectedMessage({
          protectedText: body.protectedText || body.text || '',
          files: body.files || [],
          subject: body.subject || '',
          customerId: body.customerId || '',
          createdByUserId: user.id,
          createdByEmail: user.email || req.user.email
        });
        const url = `${publicBaseUrl(req)}/mejl-skyddad.html?token=${encodeURIComponent(created.token)}`;
        res.json({
          success: true,
          token: created.token,
          url,
          expiresAt: created.expiresAt,
          fileCount: created.fileCount,
          hasText: created.hasText
        });
      } catch (err) {
        console.error('POST /api/mejl/protected:', err.message);
        const status = err.code ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    app.get('/api/mejl/protected/:token', async (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        const record = protectedStore.getProtectedMessage(token);
        if (!record) {
          return res.status(404).json({
            success: false,
            error: 'Skyddat innehåll hittades inte eller har gått ut'
          });
        }
        const session = samarbeteBankid.readSessionFromRequest(req);
        const verified = samarbeteBankid.sessionMatchesToken(session, token);
        const meta = protectedStore.publicMeta(record);
        if (!verified) {
          return res.json({
            success: true,
            locked: true,
            bankIdMode: samarbeteBankid.mode(),
            meta: {
              subject: meta.subject,
              hasText: meta.hasText,
              fileCount: (meta.files || []).length,
              expiresAt: meta.expiresAt
            }
          });
        }
        res.json({
          success: true,
          locked: false,
          bankIdMode: samarbeteBankid.mode(),
          verifiedName: session.name || '',
          protectedText: record.protectedText || '',
          files: meta.files,
          subject: meta.subject,
          expiresAt: meta.expiresAt
        });
      } catch (err) {
        console.error('GET /api/mejl/protected/:token:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/mejl/protected/:token/files/:fileId', async (req, res) => {
      try {
        const token = String(req.params.token || '').trim();
        const session = samarbeteBankid.readSessionFromRequest(req);
        if (!samarbeteBankid.sessionMatchesToken(session, token)) {
          return res.status(401).json({ success: false, error: 'BankID krävs för nedladdning' });
        }
        const file = protectedStore.getFile(token, req.params.fileId);
        if (!file) {
          return res.status(404).json({ success: false, error: 'Filen hittades inte' });
        }
        const buf = Buffer.from(file.contentBase64, 'base64');
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${String(file.name || 'fil').replace(/"/g, '')}"`
        );
        res.send(buf);
      } catch (err) {
        console.error('GET /api/mejl/protected/.../files:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/mejl/bankid/start', async (req, res) => {
      try {
        const token = String((req.body && req.body.token) || '').trim();
        if (!token || !protectedStore.getProtectedMessage(token)) {
          return res.status(404).json({ success: false, error: 'Skyddat innehåll hittades inte' });
        }
        const endUserIp =
          (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
          req.ip ||
          '';
        const started = samarbeteBankid.startBankId({
          samarbeteToken: token,
          endUserIp
        });
        res.json({ success: true, ...started });
      } catch (err) {
        const status = err.code === 'BANKID_DISABLED' ? 503 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    app.post('/api/mejl/bankid/collect', async (req, res) => {
      try {
        const orderRef = String((req.body && req.body.orderRef) || '').trim();
        const token = String((req.body && req.body.token) || '').trim();
        const result = samarbeteBankid.pollBankId(orderRef);
        if (result.status === 'complete' && result.sessionToken) {
          if (
            token &&
            !samarbeteBankid.sessionMatchesToken(
              samarbeteBankid.verifySession(result.sessionToken),
              token
            )
          ) {
            return res.status(400).json({ success: false, error: 'Session matchar inte' });
          }
          samarbeteBankid.setSessionCookie(res, result.sessionToken);
        }
        res.json({ success: true, ...result });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/mejl/compose-prepare', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const body = req.body || {};
        const publicText = String(body.publicText || body.text || '').trim();
        const protectedText = String(body.protectedText || '').trim();
        const protectedFiles = Array.isArray(body.protectedFiles) ? body.protectedFiles : [];
        const questions = Array.isArray(body.questions) ? body.questions : null;
        const samarbeteTitle = questions
          ? samarbeteFragor.encodeQuestions(questions)
          : String(body.samarbeteTitle || '').trim();
        const samarbeteUrl = String(body.samarbeteUrl || '').trim();

        let signatureSettings = null;
        try {
          signatureSettings = await signatureStore.loadSignature(user.id);
        } catch (_) {
          signatureSettings = signature.normalizeSettings({});
        }

        let protectedUrl = '';
        let protectedMeta = null;
        if (protectedText || protectedFiles.length) {
          const created = protectedStore.createProtectedMessage({
            protectedText,
            files: protectedFiles,
            subject: body.subject || '',
            customerId: body.customerId || '',
            createdByUserId: user.id,
            createdByEmail: user.email || req.user.email
          });
          protectedUrl = `${publicBaseUrl(req)}/mejl-skyddad.html?token=${encodeURIComponent(created.token)}`;
          protectedMeta = created;
        }

        const html = composeHtml.buildOutgoingHtml({
          publicText,
          protectedUrl,
          protectedHasText: !!(protectedMeta && protectedMeta.hasText),
          protectedFileCount: (protectedMeta && protectedMeta.fileCount) || 0,
          samarbeteUrl,
          samarbeteTitle,
          signatureSettings
        });
        const text = composeHtml.buildOutgoingText({
          publicText,
          protectedUrl,
          samarbeteUrl,
          signatureSettings
        });

        res.json({
          success: true,
          html,
          text,
          protectedUrl: protectedUrl || null,
          protectedToken: protectedMeta ? protectedMeta.token : null,
          signatureAttached: !!signature.renderSignatureHtml(signatureSettings),
          samarbeteTitle: samarbeteTitle || null
        });
      } catch (err) {
        console.error('POST /api/mejl/compose-prepare:', err.message);
        const status = err.code ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });
  }

  return { registerRoutes, signature, signatureStore, protectedStore, composeHtml };
}

module.exports = {
  createMejlExtras,
  signature,
  signatureStore,
  protectedStore,
  composeHtml
};
