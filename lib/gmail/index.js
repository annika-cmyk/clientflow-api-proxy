/**
 * Gmail-integration: OAuth, inkorg under etiketten KUNDER, skicka som användaren.
 */
const oauth = require('./oauth');
const api = require('./api');
const store = require('./store');
const match = require('./match');
const { resolveCustomerForSend } = require('./customers');

const KUNDER_ROOT = () => String(process.env.GMAIL_KUNDER_LABEL || 'KUNDER').trim() || 'KUNDER';

function stateSecret() {
  return String(process.env.GMAIL_TOKEN_SECRET || process.env.JWT_SECRET || 'clientflow-gmail').trim();
}

function publicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (req) {
    const host = req.get('x-forwarded-host') || req.get('host');
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    if (host) return `${proto}://${host}`;
  }
  return '';
}

function wantsJson(req) {
  const accept = String(req.get('accept') || '');
  const xhr = String(req.get('x-requested-with') || '').toLowerCase() === 'xmlhttprequest';
  return xhr || accept.includes('application/json');
}

function createGmailIntegration(deps) {
  const {
    authenticateToken,
    getAirtableUser,
    listAccessibleCustomers,
    getAccessibleCustomer
  } = deps;

  async function requireUser(req, res) {
    const user = await getAirtableUser(req.user.email);
    if (!user || !user.id) {
      res.status(401).json({ success: false, error: 'Användare hittades inte' });
      return null;
    }
    return user;
  }

  async function getValidAccessToken(user) {
    const tokens = await store.loadTokens(user.id);
    if (!tokens || !tokens.refreshToken) {
      const err = new Error('Gmail är inte kopplad');
      err.code = 'GMAIL_NOT_CONNECTED';
      throw err;
    }
    const expiresAt = Number(tokens.expiresAt || 0);
    const stillValid = tokens.accessToken && expiresAt > Date.now() + 60 * 1000;
    if (stillValid) {
      return { accessToken: tokens.accessToken, tokens };
    }
    const refreshed = await oauth.refreshAccessToken(tokens.refreshToken);
    const next = {
      ...tokens,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + (Number(refreshed.expires_in || 3600) * 1000),
      refreshToken: refreshed.refresh_token || tokens.refreshToken,
      email: tokens.email
    };
    await store.saveTokens(user.id, next);
    return { accessToken: next.accessToken, tokens: next };
  }

  async function resolveCustomers(user) {
    if (typeof listAccessibleCustomers === 'function') {
      return listAccessibleCustomers(user);
    }
    return [];
  }

  function registerRoutes(app) {
    app.get('/api/gmail/status', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const missingEnv = oauth.listMissingOAuthEnv();
        const envPresence = oauth.getOAuthEnvPresence();
        const configured = missingEnv.length === 0;
        let connected = false;
        let email = '';
        let kunderLabel = KUNDER_ROOT();
        if (configured) {
          const tokens = await store.loadTokens(user.id);
          connected = !!(tokens && tokens.refreshToken);
          email = (tokens && tokens.email) || '';
        }
        const missingList = missingEnv.join(', ');
        const setKeys = Object.entries(envPresence.present)
          .filter(([, set]) => set)
          .map(([key]) => key);
        const lengthHint = Object.entries(envPresence.lengths || {})
          .map(([key, len]) => `${key}=${len}`)
          .join(', ');
        const setHint = setKeys.length
          ? ` Satta (utan värde): ${setKeys.join(', ')}.`
          : '';
        const requestHost = String(req.get('x-forwarded-host') || req.get('host') || '').trim();
        const serviceHint =
          'Env måste ligga på Render-tjänsten clientflow-api-proxy-1 (den som www.app.clientflow.se pekar på) – inte den äldre clientflow-api-proxy utan -1.';
        res.json({
          success: true,
          configured,
          connected,
          email,
          kunderLabel,
          missingEnv,
          /** Boolean per kanonisk nyckel – inga secret-värden. */
          envPresent: envPresence.present,
          /** Teckenlängd per kanonisk nyckel (0 = saknad/tom) – inga secret-värden. */
          envLengths: envPresence.lengths,
          /** Vilket alias (om något) som gav värde – bara nyckelnamn. */
          envResolvedFrom: envPresence.resolvedFrom,
          /** Host som svarade – hjälper felsöka fel Render-tjänst. */
          requestHost,
          expectedService: 'clientflow-api-proxy-1',
          redirectHint: configured
            ? null
            : `Gmail-kopplingen är inte klar på servern. Saknade miljövariabler: ${missingList}.${setHint} Längder: ${lengthHint}. Host: ${requestHost || '?'}. ${serviceHint} Se docs/GMAIL_SETUP.md.`
        });
      } catch (err) {
        console.error('gmail/status:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/gmail/connect', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        if (!oauth.isOAuthConfigured()) {
          const missingEnv = oauth.listMissingOAuthEnv();
          const error =
            `Gmail-integration är inte konfigurerad. Saknas: ${missingEnv.join(', ')}.`;
          if (String(req.query.redirect || '') === '0' || wantsJson(req)) {
            return res.status(503).json({ success: false, error, missingEnv });
          }
          const base = publicBaseUrl(req) || '';
          return res.redirect(
            `${base}/mejl.html?gmail=error&reason=${encodeURIComponent(error)}`
          );
        }
        await store.ensureGmailField();
        const state = oauth.createSignedState(
          { userId: user.id, email: user.email },
          stateSecret()
        );
        const url = oauth.buildAuthUrl(state);
        if (String(req.query.redirect || '') === '0') {
          return res.json({ success: true, url });
        }
        return res.redirect(url);
      } catch (err) {
        console.error('gmail/connect:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/gmail/oauth/callback', async (req, res) => {
      const base = publicBaseUrl(req) || '';
      const mejlUrl = `${base}/mejl.html`;
      try {
        const { code, state, error } = req.query;
        if (error) {
          return res.redirect(`${mejlUrl}?gmail=error&reason=${encodeURIComponent(String(error))}`);
        }
        const payload = oauth.verifySignedState(state, stateSecret());
        if (!payload.userId) {
          return res.redirect(`${mejlUrl}?gmail=error&reason=missing_user`);
        }
        const tokenRes = await oauth.exchangeCode(code);
        if (!tokenRes.refresh_token && !tokenRes.access_token) {
          return res.redirect(`${mejlUrl}?gmail=error&reason=no_tokens`);
        }
        let email = '';
        try {
          const profile = await api.getProfile(tokenRes.access_token);
          email = profile.emailAddress || '';
        } catch (_) {
          email = payload.email || '';
        }
        const existing = await store.loadTokens(payload.userId);
        const tokens = {
          refreshToken: tokenRes.refresh_token || (existing && existing.refreshToken) || '',
          accessToken: tokenRes.access_token,
          expiresAt: Date.now() + (Number(tokenRes.expires_in || 3600) * 1000),
          email,
          kunderLabelId: (existing && existing.kunderLabelId) || null
        };
        if (!tokens.refreshToken) {
          return res.redirect(`${mejlUrl}?gmail=error&reason=missing_refresh`);
        }
        await store.saveTokens(payload.userId, tokens);
        return res.redirect(`${mejlUrl}?gmail=connected`);
      } catch (err) {
        console.error('gmail/oauth/callback:', err.message);
        return res.redirect(`${mejlUrl}?gmail=error&reason=${encodeURIComponent(err.message)}`);
      }
    });

    app.post('/api/gmail/disconnect', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const tokens = await store.loadTokens(user.id);
        if (tokens) {
          await oauth.revokeToken(tokens.accessToken || tokens.refreshToken);
        }
        await store.clearTokens(user.id);
        res.json({ success: true });
      } catch (err) {
        console.error('gmail/disconnect:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/gmail/labels', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const { accessToken } = await getValidAccessToken(user);
        const labels = await api.listLabels(accessToken);
        const customers = await resolveCustomers(user);
        const matched = match.matchLabelsToCustomers(labels, customers, {
          kunderRoot: KUNDER_ROOT()
        });
        const kunderLabel = match.findKunderLabel(labels, KUNDER_ROOT());
        res.json({
          success: true,
          kunderLabel,
          ...matched,
          labelCount: labels.length
        });
      } catch (err) {
        const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    /** Sample From/To/Cc under unmatched KUNDER-etiketter för e-postmatch. */
    async function collectMessageEmailsByLabel(accessToken, unmatchedLabels, opts = {}) {
      const maxLabels = opts.maxLabels == null ? 40 : opts.maxLabels;
      const maxMessages = opts.maxMessages == null ? 5 : opts.maxMessages;
      const messageEmailsByLabelId = {};
      for (const u of (unmatchedLabels || []).slice(0, maxLabels)) {
        if (!u || !u.labelId) continue;
        try {
          const listed = await api.listMessages(accessToken, {
            labelIds: [u.labelId],
            maxResults: maxMessages
          });
          const emails = new Set();
          for (const item of (listed.messages || []).slice(0, maxMessages)) {
            try {
              const raw = await api.getMessage(accessToken, item.id, 'metadata');
              const summary = api.summarizeMessage(raw);
              for (const e of match.collectMessageEmails(summary)) emails.add(e);
            } catch (_) {
              /* hoppa över enstaka mejl */
            }
          }
          if (emails.size) messageEmailsByLabelId[u.labelId] = [...emails];
        } catch (_) {
          /* hoppa över etikett */
        }
      }
      return messageEmailsByLabelId;
    }

    app.get('/api/gmail/inbox', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const { accessToken } = await getValidAccessToken(user);
        const labels = await api.listLabels(accessToken);
        const customers = await resolveCustomers(user);
        let { matches, unmatchedLabels } = match.matchLabelsToCustomers(labels, customers, {
          kunderRoot: KUNDER_ROOT()
        });

        // Andra pass: e-postmatch (From/To/Cc ↔ kundkort/kontakt) för etiketter utan stark namnmatch.
        const hasCustomerEmails = (customers || []).some(
          (c) => (c.email && String(c.email).includes('@')) || (c.emails && c.emails.length)
        );
        if ((unmatchedLabels || []).length && hasCustomerEmails) {
          const messageEmailsByLabelId = await collectMessageEmailsByLabel(
            accessToken,
            unmatchedLabels
          );
          if (Object.keys(messageEmailsByLabelId).length) {
            const again = match.matchLabelsToCustomers(labels, customers, {
              kunderRoot: KUNDER_ROOT(),
              messageEmailsByLabelId
            });
            matches = again.matches;
            unmatchedLabels = again.unmatchedLabels;
          }
        }

        const customerIdFilter = String(req.query.customerId || '').trim();
        const activeMatches = customerIdFilter
          ? matches.filter((m) => m.customerId === customerIdFilter)
          : matches;
        if (!activeMatches.length) {
          const unmatchedPreview = (unmatchedLabels || [])
            .slice(0, 8)
            .map((u) => u.labelLeaf || u.labelName)
            .filter(Boolean);
          let note = customerIdFilter
            ? 'Ingen Gmail-etikett eller mejladress matchade den kunden under KUNDER.'
            : 'Inga kundetiketter under KUNDER matchade era kunder ännu.';
          if (!customerIdFilter && unmatchedPreview.length) {
            note =
              `Hittade ${unmatchedLabels.length} etikett(er) under KUNDER men ingen matchade en kund` +
              ` (t.ex. ${unmatchedPreview.join(', ')}). Kontrollera att etikettnamnet liknar kundnamnet` +
              ` och/eller att mejladressen finns på kundkortet (företag eller kontaktperson).`;
          } else if (!customerIdFilter && !(unmatchedLabels || []).length) {
            note =
              'Inga underetiketter hittades under KUNDER i Gmail. Skapa t.ex. KUNDER/Kundnamn AB och märk mejlen.';
          }
          return res.json({
            success: true,
            messages: [],
            matches: activeMatches,
            unmatchedLabels: unmatchedLabels || [],
            note
          });
        }

        const maxPerLabel = Math.min(Number(req.query.limit) || 25, 50);
        const byId = new Map();
        for (const m of activeMatches) {
          const listed = await api.listMessages(accessToken, {
            labelIds: [m.labelId],
            maxResults: maxPerLabel
          });
          for (const item of listed.messages) {
            if (byId.has(item.id)) {
              const existing = byId.get(item.id);
              if (!existing.customerIds.includes(m.customerId)) {
                existing.customerIds.push(m.customerId);
                existing.customerNames.push(m.customerName);
              }
              continue;
            }
            byId.set(item.id, {
              id: item.id,
              threadId: item.threadId,
              customerIds: [m.customerId],
              customerNames: [m.customerName],
              labelId: m.labelId,
              labelName: m.labelName
            });
          }
        }

        const messageIds = [...byId.keys()].slice(0, 40);
        const detailed = [];
        for (const id of messageIds) {
          const raw = await api.getMessage(accessToken, id, 'metadata');
          const summary = api.summarizeMessage(raw);
          const meta = byId.get(id);
          detailed.push({
            ...summary,
            text: undefined,
            html: undefined,
            customerId: meta.customerIds[0],
            customerIds: meta.customerIds,
            customerName: meta.customerNames[0],
            customerNames: meta.customerNames,
            labelId: meta.labelId,
            labelName: meta.labelName
          });
        }
        detailed.sort((a, b) => (b.internalDate || 0) - (a.internalDate || 0));
        res.json({
          success: true,
          messages: detailed,
          matches: activeMatches,
          unmatchedLabels: unmatchedLabels || []
        });
      } catch (err) {
        console.error('gmail/inbox:', err.message);
        const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    app.get('/api/gmail/messages/:id', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const { accessToken } = await getValidAccessToken(user);
        const raw = await api.getMessage(accessToken, req.params.id, 'full');
        const summary = api.summarizeMessage(raw);
        res.json({ success: true, message: summary });
      } catch (err) {
        const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    app.post('/api/gmail/send', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const { accessToken, tokens } = await getValidAccessToken(user);
        const to = String(req.body.to || '').trim();
        const subject = String(req.body.subject || '').trim();
        const text = String(req.body.text || req.body.body || '').trim();
        const html = req.body.html ? String(req.body.html) : '';
        const customerId = String(req.body.customerId || '').trim();
        const threadId = String(req.body.threadId || '').trim() || undefined;
        const inReplyTo = String(req.body.inReplyTo || '').trim() || undefined;
        if (!to || !to.includes('@')) {
          return res.status(400).json({ success: false, error: 'Ange en giltig mottagaradress' });
        }
        if (!subject) {
          return res.status(400).json({ success: false, error: 'Ämne saknas' });
        }
        if (!text && !html) {
          return res.status(400).json({ success: false, error: 'Meddelandetext saknas' });
        }

        let labelIds = [];
        if (customerId) {
          // Samma access som Mejl-dropdown (/api/kunddata): direkt ID-koll, inte bara list-find
          // (listan kunde bli tom vid fel fields[] → falsk 403 trots synlig kund).
          const customer = await resolveCustomerForSend(user, customerId, {
            getAccessibleCustomer,
            listAccessibleCustomers
          });
          if (!customer) {
            return res.status(403).json({ success: false, error: 'Ingen behörighet till kunden' });
          }
          const labels = await api.listLabels(accessToken);
          const { matches } = match.matchLabelsToCustomers(labels, [customer], {
            kunderRoot: KUNDER_ROOT()
          });
          if (matches[0]) {
            labelIds = [matches[0].labelId];
          } else {
            const kunder = match.findKunderLabel(labels, KUNDER_ROOT());
            const labelName = kunder
              ? `${KUNDER_ROOT()}/${customer.namn}`
              : `${KUNDER_ROOT()}/${customer.namn}`;
            try {
              const created = await api.createLabel(accessToken, labelName);
              if (created && created.id) labelIds = [created.id];
            } catch (err) {
              console.warn('Gmail: kunde inte skapa kundetikett:', err.message);
            }
          }
        }

        const from = tokens.email || user.email;
        const result = await api.sendMessage(accessToken, {
          from,
          to,
          subject,
          text,
          html: html || undefined,
          threadId,
          inReplyTo,
          labelIds
        });
        res.json({
          success: true,
          messageId: result.id,
          threadId: result.threadId,
          from
        });
      } catch (err) {
        console.error('gmail/send:', err.response?.data || err.message);
        const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Kunde inte skicka mejl';
        res.status(status).json({ success: false, error: msg, code: err.code || null });
      }
    });
  }

  /**
   * Skicka via användarens Gmail om kopplad; annars returnerar null så anroparen kan falla tillbaka till SMTP.
   */
  async function sendAsUser(user, mail) {
    if (!user || !user.id) return null;
    try {
      const tokens = await store.loadTokens(user.id);
      if (!tokens || !tokens.refreshToken) return null;
      const { accessToken, tokens: fresh } = await getValidAccessToken(user);
      const from = fresh.email || user.email;
      const result = await api.sendMessage(accessToken, {
        from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        labelIds: mail.labelIds || []
      });
      return { sent: true, via: 'gmail', messageId: result.id, from };
    } catch (err) {
      console.warn('gmail.sendAsUser misslyckades:', err.message);
      return { sent: false, via: 'gmail', error: err.message };
    }
  }

  return {
    registerRoutes,
    sendAsUser,
    getValidAccessToken,
    ensureGmailField: store.ensureGmailField,
    isConfigured: oauth.isOAuthConfigured
  };
}

module.exports = {
  createGmailIntegration,
  match,
  oauth,
  api,
  store,
  customers: require('./customers')
};
