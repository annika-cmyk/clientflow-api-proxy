/**
 * Gmail-integration: OAuth, inkorg under etiketten KUNDER, skicka som användaren.
 */
const oauth = require('./oauth');
const api = require('./api');
const store = require('./store');
const match = require('./match');
const inbox = require('./inbox');
const labelsEdit = require('./labels-edit');
const labelLinks = require('./label-links');
const archiveStore = require('./archive-store');
const { registerArchiveRoutes } = require('./archive-routes');
const syncCache = require('./sync-cache');
const attachmentServe = require('./attachment-serve');
const { resolveCustomerForSend } = require('./customers');
const { classifyGmailError, needsGmailReconnect } = require('./errors');
const calendarSync = require('./calendar-sync');
const calendarApi = require('./calendar-api');

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

/** Tillåtna relative return-paths efter OAuth (inga open redirects). */
function safeReturnPath(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('//')) return '';
  if (s.includes('..') || s.includes('\\')) return '';
  const pathOnly = s.split('?')[0].split('#')[0];
  const allowed = new Set(['mejl.html', 'kalender.html', 'moten.html']);
  if (!allowed.has(pathOnly)) return '';
  return s.startsWith('/') ? s.slice(1) : s;
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
    let tokens;
    try {
      tokens = await store.loadTokens(user.id);
    } catch (err) {
      console.error('gmail tokens load:', err.message);
      const e = new Error('Kunde inte läsa Gmail-koppling just nu.');
      e.code = 'GMAIL_TOKEN_STORE_ERROR';
      throw e;
    }
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
    let refreshed;
    try {
      refreshed = await oauth.refreshAccessToken(tokens.refreshToken);
    } catch (err) {
      const info = classifyGmailError(err);
      if (needsGmailReconnect(info.code)) {
        try {
          await store.clearTokens(user.id);
        } catch (_) {
          /* ignore */
        }
        const e = new Error(info.message);
        e.code = info.code;
        throw e;
      }
      throw err;
    }
    if (!refreshed || !refreshed.access_token) {
      const e = new Error('Kunde inte förnya Gmail-sessionen. Koppla Gmail igen.');
      e.code = 'GMAIL_REAUTH_REQUIRED';
      throw e;
    }
    const next = {
      ...tokens,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
      refreshToken: refreshed.refresh_token || tokens.refreshToken,
      email: tokens.email,
      scope: refreshed.scope || tokens.scope || ''
    };
    try {
      await store.saveTokens(user.id, next);
    } catch (err) {
      console.warn('gmail: kunde inte spara uppdaterad access token:', err.message);
    }
    return { accessToken: next.accessToken, tokens: next };
  }

  function sendGmailError(res, err, logLabel) {
    const info = classifyGmailError(err);
    console.error(
      `${logLabel}:`,
      info.code || '',
      err && err.message,
      (err && err.response && err.response.status) || ''
    );
    if (res.headersSent) return info;
    res.status(info.status).json({
      success: false,
      error: info.message,
      code: info.code || null
    });
    return info;
  }

  async function resolveCustomers(user) {
    if (typeof listAccessibleCustomers === 'function') {
      return listAccessibleCustomers(user);
    }
    return [];
  }


  async function matchLabelsWithLinks(user, labels, customers, opts = {}) {
    const links = await store.loadLabelLinks(user.id);
    const base = match.matchLabelsToCustomers(labels, customers, opts);
    return labelLinks.applyLinksToMatchResult(base, links, customers, {
      kunderRoot: opts.kunderRoot || KUNDER_ROOT()
    });
  }

  /**
   * Best-effort push av ett tidblock till Google. Skippar tyst om sync är av.
   * Returnerar { skipped|ok|error } – kastar inte vid saknad scope när silent.
   */
  async function pushRunScheduleForUser(user, item, opts = {}) {
    const silent = opts.silent !== false;
    try {
      if (!user?.id) return { skipped: true, reason: 'no_user' };
      const prefs = await calendarSync.loadPrefs(user.id);
      if (!prefs.enabled) return { skipped: true, reason: 'disabled' };
      const { accessToken, tokens } = await getValidAccessToken(user);
      if (!oauth.tokenHasCalendarScope(tokens)) {
        if (silent) return { skipped: true, reason: 'no_calendar_scope' };
        const e = new Error('Kalenderbehörighet saknas. Koppla om Gmail.');
        e.code = 'GMAIL_INSUFFICIENT_SCOPE';
        throw e;
      }
      const runId = String(item?.runId || '').trim();
      if (!runId) return { skipped: true, reason: 'no_run_id' };
      const key = calendarSync.eventKey('run', runId);
      const result = await calendarSync.upsertMappedEvent({
        accessToken,
        prefs,
        key,
        start: item.start || null,
        end: item.end || null,
        summary: item.title || item.summary || 'ClientFlow-körning',
        description: item.description || '',
        location: item.location || ''
      });
      await calendarSync.savePrefs(user.id, result.prefs);
      return { ok: true, eventId: result.eventId || null, deleted: !!result.deleted };
    } catch (err) {
      if (silent) {
        console.warn('google-calendar push run:', err.code || '', err.message);
        return { skipped: true, reason: 'error', error: err.message, code: err.code || null };
      }
      throw err;
    }
  }

  async function pushRunScheduleItems(user, items) {
    const prefs = await calendarSync.loadPrefs(user.id);
    if (!prefs.enabled) {
      return { skipped: true, reason: 'disabled', pushed: 0, deleted: 0 };
    }
    let accessToken;
    let tokens;
    try {
      ({ accessToken, tokens } = await getValidAccessToken(user));
    } catch (err) {
      return {
        error: err.message || 'Gmail är inte kopplad',
        code: err.code || 'GMAIL_NOT_CONNECTED',
        status: err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500,
        needsReconnect: needsGmailReconnect(err.code)
      };
    }
    if (!oauth.tokenHasCalendarScope(tokens)) {
      return {
        error: 'Kalenderbehörighet saknas. Koppla om Gmail och godkänn Google Calendar.',
        code: 'GMAIL_INSUFFICIENT_SCOPE',
        status: 403,
        needsReconnect: true
      };
    }

    let nextPrefs = prefs;
    let pushed = 0;
    let deleted = 0;
    let errors = 0;
    for (const item of items || []) {
      const runId = String(item?.runId || '').trim();
      if (!runId) continue;
      try {
        const result = await calendarSync.upsertMappedEvent({
          accessToken,
          prefs: nextPrefs,
          key: calendarSync.eventKey('run', runId),
          start: item.start || null,
          end: item.end || null,
          summary: item.title || item.summary || 'ClientFlow-körning',
          description: item.description || '',
          location: item.location || ''
        });
        nextPrefs = result.prefs;
        if (result.deleted) deleted += 1;
        else if (result.eventId) pushed += 1;
      } catch (err) {
        errors += 1;
        console.warn('google-calendar sync-runs item:', runId, err.message);
      }
    }
    await calendarSync.savePrefs(user.id, nextPrefs);
    return { pushed, deleted, errors };
  }

  async function pushMeetingForUser(user, meeting) {
    try {
      if (!user?.id) return { skipped: true, reason: 'no_user' };
      const prefs = await calendarSync.loadPrefs(user.id);
      if (!prefs.enabled) return { skipped: true, reason: 'disabled' };
      const { accessToken, tokens } = await getValidAccessToken(user);
      if (!oauth.tokenHasCalendarScope(tokens)) {
        return { skipped: true, reason: 'no_calendar_scope' };
      }
      const meetingId = String(meeting?.id || '').trim();
      if (!meetingId) return { skipped: true, reason: 'no_meeting_id' };
      const key = calendarSync.eventKey('meeting', meetingId);
      const start = meeting.bookedStart || meeting.start || null;
      const end = meeting.bookedEnd || meeting.end || null;
      const clear = meeting.status === 'Avbokad' || meeting.status === 'Stängd' || !start || !end;
      const result = await calendarSync.upsertMappedEvent({
        accessToken,
        prefs,
        key,
        start: clear ? null : start,
        end: clear ? null : end,
        summary: meeting.title || 'Möte',
        description: [
          meeting.customerName ? `Kund: ${meeting.customerName}` : '',
          meeting.bookerName ? `Bokat av: ${meeting.bookerName}` : '',
          meeting.meetingType ? `Typ: ${meeting.meetingType}` : '',
          meeting.note || ''
        ]
          .filter(Boolean)
          .join('\n'),
        location: meeting.location || ''
      });
      await calendarSync.savePrefs(user.id, result.prefs);
      return { ok: true, eventId: result.eventId || null, deleted: !!result.deleted };
    } catch (err) {
      console.warn('google-calendar push meeting:', err.message);
      return { skipped: true, reason: 'error', error: err.message };
    }
  }


  async function pullGoogleEventsForUser(user, { timeMin, timeMax } = {}) {
    const prefs = await calendarSync.loadPrefs(user.id);
    if (!prefs.enabled) {
      return { skipped: true, reason: 'disabled', events: [] };
    }
    let accessToken;
    let tokens;
    try {
      ({ accessToken, tokens } = await getValidAccessToken(user));
    } catch (err) {
      return {
        error: err.message || 'Gmail är inte kopplad',
        code: err.code || 'GMAIL_NOT_CONNECTED',
        status: err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500,
        needsReconnect: needsGmailReconnect(err.code),
        events: []
      };
    }
    if (!oauth.tokenHasCalendarScope(tokens)) {
      return {
        error: 'Kalenderbehörighet saknas. Koppla om Gmail och godkänn Google Calendar.',
        code: 'GMAIL_INSUFFICIENT_SCOPE',
        status: 403,
        needsReconnect: true,
        events: []
      };
    }
    const raw = await calendarApi.listEvents(accessToken, { timeMin, timeMax });
    const events = calendarSync.filterAndMapPulledEvents(raw, prefs);
    return {
      events,
      pulled: events.length,
      scanned: raw.length,
      skippedPushed: Math.max(0, raw.length - events.length)
    };
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
        let hasCalendarScope = false;
        let calendarSyncEnabled = false;
        if (configured) {
          const tokens = await store.loadTokens(user.id);
          connected = !!(tokens && tokens.refreshToken);
          email = (tokens && tokens.email) || '';
          hasCalendarScope = oauth.tokenHasCalendarScope(tokens);
          if (connected) {
            const prefs = await calendarSync.loadPrefs(user.id);
            calendarSyncEnabled = !!prefs.enabled;
          }
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
          hasCalendarScope,
          calendarSyncEnabled,
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
        const returnTo = safeReturnPath(req.query.returnTo);
        const state = oauth.createSignedState(
          { userId: user.id, email: user.email, returnTo: returnTo || '' },
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
        const returnPath = safeReturnPath(payload.returnTo) || 'mejl.html';
        const destBase = `${base}/${returnPath.split('?')[0]}`;
        const destQs = returnPath.includes('?') ? returnPath.slice(returnPath.indexOf('?')) : '';
        const join = destQs ? '&' : '?';
        const successUrl = `${destBase}${destQs}${join}gmail=connected`;
        const errorUrl = (reason) =>
          `${destBase}${destQs}${join}gmail=error&reason=${encodeURIComponent(String(reason || 'error'))}`;

        const tokenRes = await oauth.exchangeCode(code);
        if (!tokenRes.refresh_token && !tokenRes.access_token) {
          return res.redirect(errorUrl('no_tokens'));
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
          kunderLabelId: (existing && existing.kunderLabelId) || null,
          scope: tokenRes.scope || (existing && existing.scope) || ''
        };
        if (!tokens.refreshToken) {
          return res.redirect(errorUrl('missing_refresh'));
        }
        await store.saveTokens(payload.userId, tokens);
        return res.redirect(successUrl);
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
        await store.clearSyncCache(user.id);
        res.json({ success: true });
      } catch (err) {
        console.error('gmail/disconnect:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    /** Status för Google Calendar-push (återanvänder Gmail OAuth). */
    app.get('/api/google-calendar/status', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const configured = oauth.isOAuthConfigured();
        const tokens = configured ? await store.loadTokens(user.id) : null;
        const connected = !!(tokens && tokens.refreshToken);
        const hasCalendarScope = oauth.tokenHasCalendarScope(tokens);
        const prefs = connected ? await calendarSync.loadPrefs(user.id) : calendarSync.emptyPrefs();
        res.json({
          success: true,
          configured,
          connected,
          email: (tokens && tokens.email) || '',
          hasCalendarScope,
          syncEnabled: !!prefs.enabled,
          needsReconnect: connected && !hasCalendarScope,
          reconnectHint: connected && !hasCalendarScope
            ? 'Koppla om Gmail och godkänn kalenderbehörighet för att synka till Google-kalendern.'
            : null
        });
      } catch (err) {
        console.error('google-calendar/status:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/google-calendar/sync-enabled', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const enabled = !!req.body?.enabled;
        const tokens = await store.loadTokens(user.id);
        if (!tokens || !tokens.refreshToken) {
          return res.status(400).json({
            success: false,
            error: 'Koppla Gmail först (Mejl eller Kalender).',
            code: 'GMAIL_NOT_CONNECTED'
          });
        }
        if (enabled && !oauth.tokenHasCalendarScope(tokens)) {
          return res.status(403).json({
            success: false,
            error: 'Kalenderbehörighet saknas. Koppla om Gmail och godkänn Google Calendar.',
            code: 'GMAIL_INSUFFICIENT_SCOPE',
            needsReconnect: true
          });
        }
        const prefs = await calendarSync.loadPrefs(user.id);
        prefs.enabled = enabled;
        await calendarSync.savePrefs(user.id, prefs);
        res.json({ success: true, syncEnabled: enabled });
      } catch (err) {
        console.error('google-calendar/sync-enabled:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    /**
     * Bulk-push av planerade tidblock från klienten (synliga i kalendern).
     * Body: { items: [{ runId, title, description?, start, end }] }
     */
    app.post('/api/google-calendar/sync-runs', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const result = await pushRunScheduleItems(user, items);
        if (result.error) {
          return res.status(result.status || 400).json({
            success: false,
            error: result.error,
            code: result.code || null,
            needsReconnect: !!result.needsReconnect
          });
        }
        res.json({ success: true, ...result });
      } catch (err) {
        sendGmailError(res, err, 'google-calendar/sync-runs');
      }
    });

    app.get('/api/google-calendar/events', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const timeMin = String(req.query.timeMin || '').trim();
        const timeMax = String(req.query.timeMax || '').trim();
        if (!timeMin || !timeMax) {
          return res.status(400).json({
            success: false,
            error: 'timeMin och timeMax krävs (YYYY-MM-DD)'
          });
        }
        const result = await pullGoogleEventsForUser(user, { timeMin, timeMax });
        if (result.error) {
          return res.status(result.status || 400).json({
            success: false,
            error: result.error,
            code: result.code || null,
            needsReconnect: !!result.needsReconnect,
            events: []
          });
        }
        res.json({ success: true, ...result });
      } catch (err) {
        sendGmailError(res, err, 'google-calendar/events');
      }
    });

    app.get('/api/gmail/labels', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const { accessToken } = await getValidAccessToken(user);
        const labels = await api.listLabels(accessToken);
        const customers = await resolveCustomers(user);
        const kunderRoot = KUNDER_ROOT();
        const matched = await matchLabelsWithLinks(user, labels, customers, {
          kunderRoot
        });
        const kunderLabel = match.findKunderLabel(labels, kunderRoot);
        const kunderLabels = labelsEdit.listKunderChildLabels(labels, kunderRoot);
        const classified = (labels || []).map((l) => labelsEdit.classifyLabel(l, kunderRoot));
        res.json({
          success: true,
          kunderRoot,
          kunderLabel: kunderLabel
            ? labelsEdit.classifyLabel(kunderLabel, kunderRoot)
            : null,
          kunderLabels,
          labels: classified,
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

    async function resolveMatchesForInbox(user, accessToken, tokens, labels, customers, opts = {}) {
      const kunderRoot = opts.kunderRoot || KUNDER_ROOT();
      const excludeEmails = [tokens && tokens.email, user.email].filter(Boolean);
      const labelLinksList =
        opts.labelLinksList || (await store.loadLabelLinks(user.id));

      let { matches, unmatchedLabels } = await matchLabelsWithLinks(user, labels, customers, {
        kunderRoot,
        excludeEmails
      });

      const skipEmailPass = opts.skipEmailPass === true;
      const hasCustomerEmails = (customers || []).some(
        (c) => (c.email && String(c.email).includes('@')) || (c.emails && c.emails.length)
      );
      if (!skipEmailPass && (unmatchedLabels || []).length && hasCustomerEmails && accessToken) {
        const messageEmailsByLabelId = await collectMessageEmailsByLabel(
          accessToken,
          unmatchedLabels
        );
        if (Object.keys(messageEmailsByLabelId).length) {
          const again = await matchLabelsWithLinks(user, labels, customers, {
            kunderRoot,
            messageEmailsByLabelId,
            excludeEmails
          });
          matches = again.matches;
          unmatchedLabels = again.unmatchedLabels;
        }
      }

      return { matches, unmatchedLabels, excludeEmails, labelLinksList, kunderRoot };
    }

    function buildInboxResponsePayload({
      folder,
      detailed,
      labels,
      matches,
      unmatchedLabels,
      customers,
      excludeEmails,
      labelLinksList,
      kunderRoot,
      customerIdFilter,
      limit,
      syncMeta
    }) {
      const kunderIds = inbox.kunderLabelIdSet(labels, kunderRoot);
      const messages = inbox.buildInboxMessages(detailed, {
        labels,
        matches,
        customers,
        kunderLabelIds: kunderIds,
        kunderRoot,
        customerIdFilter,
        folder,
        excludeEmails,
        labelLinks: labelLinksList,
        limit
      });

      const matchList = Array.isArray(matches) ? matches : [];
      const filteredMatches = customerIdFilter
        ? matchList.filter((m) => m.customerId === customerIdFilter)
        : matchList;

      if (!messages.length) {
        const unmatchedPreview = (unmatchedLabels || [])
          .slice(0, 8)
          .map((u) => u.labelLeaf || u.labelName)
          .filter(Boolean);
        let note = customerIdFilter
          ? 'Ingen Gmail-etikett eller mejladress matchade den kunden under KUNDER.'
          : folder === 'sent'
            ? 'Inga skickade kundmejl under KUNDER matchade era kunder ännu.'
            : 'Inga kundetiketter under KUNDER matchade era kunder ännu.';
        if (!customerIdFilter && unmatchedPreview.length && !(detailed || []).length) {
          note =
            folder === 'sent'
              ? 'Inga skickade mejl hittades under etiketten KUNDER.'
              : 'Inga mejl hittades under etiketten KUNDER.';
        } else if (!customerIdFilter && unmatchedPreview.length) {
          note =
            'Hittade ' +
            unmatchedLabels.length +
            ' etikett(er) under KUNDER men ingen matchade en kund' +
            ' (t.ex. ' +
            unmatchedPreview.join(', ') +
            '). Kontrollera att etikettnamnet liknar kundnamnet' +
            ' och/eller att mejladressen finns på kundkortet (företag eller kontaktperson).';
        } else if (!(detailed || []).length) {
          note =
            folder === 'sent'
              ? 'Inga skickade mejl hittades under etiketten KUNDER.'
              : 'Inga mejl hittades under etiketten KUNDER.';
        }
        return {
          success: true,
          folder,
          messages: [],
          matches: filteredMatches,
          unmatchedLabels: unmatchedLabels || [],
          note,
          ...syncMeta
        };
      }

      return {
        success: true,
        folder,
        messages,
        matches: filteredMatches,
        unmatchedLabels: unmatchedLabels || [],
        ...syncMeta
      };
    }

    /** Full hämtning under KUNDER + spara cache med historyId. */
    async function fullSyncKunderMessages(accessToken, labels, folder, limit) {
      const kunderRoot = KUNDER_ROOT();
      const kunderLabels = inbox.collectKunderLabels(labels, kunderRoot);
      const byId = new Map();
      const q = inbox.buildKunderSearchQuery(labels, kunderRoot, folder);
      if (q) {
        try {
          const listed = await api.listMessages(accessToken, {
            q,
            maxResults: Math.min(Math.max(limit * 3, 50), 100)
          });
          for (const item of listed.messages || []) {
            if (item && item.id) byId.set(item.id, item);
          }
        } catch (err) {
          console.warn('gmail/inbox q-sök misslyckades, faller tillbaka till labelIds:', err.message);
        }
      }
      if (byId.size < limit) {
        const maxPerLabel = Math.min(Math.max(limit, 25), 50);
        for (const lab of kunderLabels) {
          try {
            const listed = await api.listMessages(accessToken, {
              labelIds: [lab.id],
              maxResults: maxPerLabel
            });
            for (const item of listed.messages || []) {
              if (item && item.id) byId.set(item.id, item);
            }
          } catch (_) {
            /* hoppa över etikett */
          }
        }
      }

      const otherFolder = folder === 'sent' ? 'inbox' : 'sent';
      const qOther = inbox.buildKunderSearchQuery(labels, kunderRoot, otherFolder);
      if (qOther && byId.size < syncCache.MAX_CACHED_MESSAGES) {
        try {
          const listed = await api.listMessages(accessToken, {
            q: qOther,
            maxResults: Math.min(Math.max(limit * 2, 40), 80)
          });
          for (const item of listed.messages || []) {
            if (item && item.id) byId.set(item.id, item);
          }
        } catch (_) {
          /* optional */
        }
      }

      const fetchCap = Math.min(Math.max(byId.size, limit), syncCache.MAX_CACHED_MESSAGES);
      const candidateIds = [...byId.keys()].slice(0, fetchCap);
      const detailed = [];
      for (const id of candidateIds) {
        try {
          const raw = await api.getMessage(accessToken, id, 'metadata');
          const summary = api.summarizeMessage(raw);
          detailed.push({
            ...summary,
            text: undefined,
            html: undefined
          });
        } catch (_) {
          /* hoppa över enstaka mejl */
        }
      }

      let historyId = null;
      try {
        const profile = await api.getProfile(accessToken);
        if (profile && profile.historyId) historyId = String(profile.historyId);
      } catch (err) {
        console.warn('gmail/inbox: kunde inte läsa profile.historyId:', err.message);
      }

      return { detailed, historyId, kunderLabels };
    }

    async function fetchMessageSummaries(accessToken, ids) {
      const out = [];
      for (const id of ids) {
        try {
          const raw = await api.getMessage(accessToken, id, 'metadata');
          const summary = api.summarizeMessage(raw);
          out.push({
            ...summary,
            text: undefined,
            html: undefined
          });
        } catch (_) {
          /* hoppa över */
        }
      }
      return out;
    }

    async function incrementalSyncFromHistory(accessToken, existingCache, labels) {
      const startHistoryId = existingCache && existingCache.historyId;
      if (!startHistoryId) {
        return { fullSyncNeeded: true, cache: existingCache, changed: false };
      }
      let historyResult;
      try {
        historyResult = await api.listHistory(accessToken, {
          startHistoryId,
          historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved']
        });
      } catch (err) {
        if (syncCache.isHistoryExpiredError(err)) {
          return { fullSyncNeeded: true, cache: existingCache, changed: false, reason: 'history_expired' };
        }
        throw err;
      }

      const { addedIds, removedIds, changedIds } = syncCache.collectHistoryMessageIds(
        historyResult.history || []
      );
      const toFetch = new Set([...addedIds, ...changedIds]);
      const updatedMessages = toFetch.size
        ? await fetchMessageSummaries(accessToken, [...toFetch])
        : [];

      const nextHistoryId =
        historyResult.historyId ||
        (existingCache && existingCache.historyId) ||
        null;

      const noChanges =
        !removedIds.size && !updatedMessages.length && String(nextHistoryId) === String(startHistoryId);

      const nextCache = syncCache.mergeHistoryIntoCache(existingCache, {
        removedIds,
        updatedMessages,
        historyId: nextHistoryId,
        labels,
        syncedAt: new Date().toISOString()
      });

      return {
        fullSyncNeeded: false,
        cache: nextCache,
        changed: !noChanges,
        added: addedIds.size,
        removed: removedIds.size,
        updated: changedIds.size
      };
    }

    app.get('/api/gmail/inbox', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const mode = syncCache.normalizeInboxMode(req.query);
        const customerIdFilter = String(req.query.customerId || '').trim();
        const folder = inbox.normalizeFolder(req.query.folder);
        const limit = Math.min(Number(req.query.limit) || 40, 50);
        const customers = await resolveCustomers(user);

        if (mode === 'cache') {
          const cached = await store.loadSyncCache(user.id);
          const hasCache =
            (cached.messages && cached.messages.length) || cached.historyId;
          if (!hasCache) {
            return res.json({
              success: true,
              folder,
              messages: [],
              matches: [],
              unmatchedLabels: [],
              fromCache: true,
              syncState: 'empty',
              syncedAt: null,
              note: null
            });
          }
          const labels = cached.labels && cached.labels.length ? cached.labels : [];
          const tokens = await store.loadTokens(user.id);
          const { matches, unmatchedLabels, excludeEmails, labelLinksList, kunderRoot } =
            await resolveMatchesForInbox(user, null, tokens, labels, customers, {
              skipEmailPass: true
            });
          const payload = buildInboxResponsePayload({
            folder,
            detailed: cached.messages || [],
            labels,
            matches,
            unmatchedLabels,
            customers,
            excludeEmails,
            labelLinksList,
            kunderRoot,
            customerIdFilter,
            limit,
            syncMeta: {
              fromCache: true,
              syncState: 'cached',
              syncMode: 'cache',
              syncedAt: cached.syncedAt || null,
              historyId: cached.historyId || null
            }
          });
          if (payload.messages.length) delete payload.note;
          return res.json(payload);
        }

        const { accessToken, tokens } = await getValidAccessToken(user);
        const labels = await api.listLabels(accessToken);
        const kunderRoot = KUNDER_ROOT();
        const kunderLabels = inbox.collectKunderLabels(labels, kunderRoot);

        const { matches, unmatchedLabels, excludeEmails, labelLinksList } =
          await resolveMatchesForInbox(user, accessToken, tokens, labels, customers);

        if (!kunderLabels.length) {
          return res.json({
            success: true,
            folder,
            messages: [],
            matches,
            unmatchedLabels: unmatchedLabels || [],
            fromCache: false,
            syncState: 'no_labels',
            syncMode: mode,
            note:
              'Inga etiketter under KUNDER hittades i Gmail. Skapa t.ex. KUNDER/Kundnamn AB och märk mejlen.'
          });
        }

        let cached = await store.loadSyncCache(user.id);
        let syncState = 'full';
        let syncMetaExtra = {};

        if (mode === 'full' || !cached.historyId) {
          const { detailed, historyId } = await fullSyncKunderMessages(
            accessToken,
            labels,
            folder,
            limit
          );
          cached = syncCache.buildCacheFromFullSync({
            historyId,
            labels,
            messages: detailed,
            syncedAt: new Date().toISOString()
          });
          await store.saveSyncCache(user.id, cached);
          syncState = cached.historyId ? 'full' : 'full_no_history';
        } else {
          try {
            const inc = await incrementalSyncFromHistory(accessToken, cached, labels);
            if (inc.fullSyncNeeded) {
              const { detailed, historyId } = await fullSyncKunderMessages(
                accessToken,
                labels,
                folder,
                limit
              );
              cached = syncCache.buildCacheFromFullSync({
                historyId,
                labels,
                messages: detailed,
                syncedAt: new Date().toISOString()
              });
              await store.saveSyncCache(user.id, cached);
              syncState = 'full_after_history_expired';
              syncMetaExtra = { historyExpired: true };
            } else {
              cached = inc.cache;
              await store.saveSyncCache(user.id, cached);
              syncState = inc.changed ? 'incremental' : 'incremental_noop';
              syncMetaExtra = {
                added: inc.added || 0,
                removed: inc.removed || 0,
                updated: inc.updated || 0
              };
            }
          } catch (err) {
            console.warn('gmail/inbox incremental misslyckades, kör full sync:', err.message);
            const { detailed, historyId } = await fullSyncKunderMessages(
              accessToken,
              labels,
              folder,
              limit
            );
            cached = syncCache.buildCacheFromFullSync({
              historyId,
              labels,
              messages: detailed,
              syncedAt: new Date().toISOString()
            });
            await store.saveSyncCache(user.id, cached);
            syncState = 'full_after_incremental_error';
            syncMetaExtra = { incrementalError: err.message };
          }
        }

        const payload = buildInboxResponsePayload({
          folder,
          detailed: cached.messages || [],
          labels,
          matches,
          unmatchedLabels,
          customers,
          excludeEmails,
          labelLinksList,
          kunderRoot,
          customerIdFilter,
          limit,
          syncMeta: {
            fromCache: false,
            syncState,
            syncMode: mode,
            syncedAt: cached.syncedAt || null,
            historyId: cached.historyId || null,
            ...syncMetaExtra
          }
        });
        if (payload.messages.length) delete payload.note;
        return res.json(payload);
      } catch (err) {
        sendGmailError(res, err, 'gmail/inbox');
      }
    });

    app.get('/api/gmail/messages/:id', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const { accessToken } = await getValidAccessToken(user);
        const kunderRoot = KUNDER_ROOT();
        const [raw, labels] = await Promise.all([
          api.getMessage(accessToken, req.params.id, 'full'),
          api.listLabels(accessToken)
        ]);
        const summary = api.summarizeMessage(raw);
        const customers = await resolveCustomers(user);
        const matched = await matchLabelsWithLinks(user, labels, customers, { kunderRoot });
        const matches = matched.matches;
        const kunderIds = inbox.kunderLabelIdSet(labels, kunderRoot);
        const resolved = inbox.resolveCustomerForMessage(summary, {
          matches,
          customers,
          kunderLabelIds: kunderIds,
          labels,
          excludeEmails: [user.email].filter(Boolean),
          labelLinks: matched.labelLinks || [],
          kunderRoot
        });
        const messageLabels = labelsEdit.resolveMessageLabels(
          summary.labelIds,
          labels,
          kunderRoot
        );
        const currentKunder = (messageLabels || []).find((l) => l && l.isKunderChild);
        const linkedForLabel = currentKunder
          ? labelLinks.findLinkForLabel(matched.labelLinks || [], currentKunder)
          : null;
        res.json({
          success: true,
          message: {
            ...summary,
            labels: messageLabels,
            customerId: resolved && resolved.customerId,
            customerName: resolved && resolved.customerName,
            labelId: resolved && resolved.labelId,
            labelName: resolved && resolved.labelName,
            labelLeaf:
              resolved && resolved.labelName
                ? match.labelLeafName(resolved.labelName)
                : null,
            matchReason: resolved && resolved.matchReason,
            labelLink: linkedForLabel
              ? {
                  labelId: linkedForLabel.labelId,
                  labelName: linkedForLabel.labelName,
                  kundId: linkedForLabel.kundId
                }
              : null
          },
          kunderLabels: labelsEdit.listKunderChildLabels(labels, kunderRoot),
          kunderRoot,
          labelLinks: matched.labelLinks || []
        });
      } catch (err) {
        const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    /**
     * Hämta bilaga för förhandsgranskning eller nedladdning.
     * Föredragen URL (query – undviker path-trunkering av långa Gmail-id:n):
     *   GET /api/gmail/messages/:id/attachment?attachmentId=...&filename=...
     * Bakåtkompatibel path-variant finns kvar.
     * Query: disposition=inline|attachment (default attachment).
     */
    async function serveGmailAttachment(req, res, {
      messageId,
      attachmentId: requestedId,
      filenameHint,
      mimeHint
    }) {
      const user = await requireUser(req, res);
      if (!user) return;
      const mid = String(messageId || '').trim();
      const requested = String(requestedId || '').trim();
      const hintName = String(filenameHint || '').trim();
      if (!mid || (!requested && !hintName)) {
        return res.status(400).json({
          success: false,
          error: 'Meddelande-id och attachmentId (eller filename) krävs'
        });
      }
      const disposition = attachmentServe.normalizeDisposition(req.query.disposition);
      const { accessToken } = await getValidAccessToken(user);
      const raw = await api.getMessage(accessToken, mid, 'full');
      const summary = api.summarizeMessage(raw);
      const meta = attachmentServe.resolveAttachmentMeta(
        summary.attachments,
        requested,
        hintName
      );
      // Använd färskt id från mejlet när det finns; annars försök requested
      // (Gmail kan fortfarande ha bytes även om MIME-sammanfattningen missar).
      const fetchId = (meta && meta.attachmentId) || requested;
      if (!fetchId) {
        return res.status(404).json({
          success: false,
          error: 'Bilagan hittades inte i mejlet'
        });
      }
      let buf;
      try {
        buf = await api.getAttachment(accessToken, mid, fetchId);
      } catch (attErr) {
        if (attErr.response?.status === 404 && meta && requested && fetchId !== requested) {
          buf = await api.getAttachment(accessToken, mid, requested);
        } else if (attErr.response?.status === 404) {
          return res.status(404).json({
            success: false,
            error: 'Bilagan hittades inte i mejlet'
          });
        } else {
          throw attErr;
        }
      }
      if (!buf || !buf.length) {
        return res.status(404).json({ success: false, error: 'Tom bilaga' });
      }
      if (buf.length > attachmentServe.ATTACHMENT_MAX_BYTES) {
        return res.status(413).json({
          success: false,
          error: 'Filen är för stor att hämta här (max 25 MB)'
        });
      }
      const filename = attachmentServe.safeFilename(
        (meta && meta.filename) || hintName || 'bilaga'
      );
      const mime = attachmentServe.guessMimeType(
        filename,
        (meta && meta.mimeType) || mimeHint
      );
      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        attachmentServe.contentDispositionHeader(filename, disposition)
      );
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(buf);
    }

    function handleAttachmentServeError(res, err) {
      console.error('gmail/attachment:', err.response?.data || err.message);
      const status =
        err.code === 'GMAIL_NOT_CONNECTED'
          ? 400
          : err.response?.status === 404
            ? 404
            : 500;
      const msg =
        err.response?.data?.error?.message ||
        err.message ||
        'Kunde inte hämta bilagan';
      if (!res.headersSent) {
        res.status(status).json({ success: false, error: msg, code: err.code || null });
      }
    }

    app.get('/api/gmail/messages/:id/attachment', authenticateToken, async (req, res) => {
      try {
        await serveGmailAttachment(req, res, {
          messageId: req.params.id,
          attachmentId: req.query.attachmentId,
          filenameHint: req.query.filename,
          mimeHint: req.query.mimeType
        });
      } catch (err) {
        handleAttachmentServeError(res, err);
      }
    });

    app.get(
      '/api/gmail/messages/:id/attachments/:attachmentId',
      authenticateToken,
      async (req, res) => {
        try {
          await serveGmailAttachment(req, res, {
            messageId: req.params.id,
            attachmentId: req.params.attachmentId,
            filenameHint: req.query.filename,
            mimeHint: req.query.mimeType
          });
        } catch (err) {
          handleAttachmentServeError(res, err);
        }
      }
    );

    /**
     * Ändra etiketter på mejl. Body:
     * { add?: string[], remove?: string[], setKunderLabelId?: string,
     *   createKunderLeaf?: string }
     */
    async function modifyMessageLabelsHandler(req, res) {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const messageId = String(req.params.id || '').trim();
        if (!messageId) {
          return res.status(400).json({ success: false, error: 'Meddelande-id saknas' });
        }
        const body = req.body || {};
        const { accessToken } = await getValidAccessToken(user);
        const kunderRoot = KUNDER_ROOT();
        let labels = await api.listLabels(accessToken);
        const currentRaw = await api.getMessage(accessToken, messageId, 'metadata');
        const currentIds = (currentRaw && currentRaw.labelIds) || [];

        let addLabelIds = labelsEdit.normalizeIdList(body.add || body.addLabelIds);
        let removeLabelIds = labelsEdit.normalizeIdList(body.remove || body.removeLabelIds);

        const createLeaf = String(body.createKunderLeaf || body.createLabel || '').trim();
        let setKunderLabelId = String(body.setKunderLabelId || '').trim() || null;

        if (createLeaf) {
          const fullName = labelsEdit.normalizeKunderLabelName(createLeaf, kunderRoot);
          if (!fullName || !match.isUnderKunder(fullName, kunderRoot)) {
            return res.status(400).json({
              success: false,
              error: 'Ange ett kundnamn för ny etikett under KUNDER',
              code: 'INVALID_KUNDER_NAME'
            });
          }
          let existing = labelsEdit.findLabelByName(labels, fullName);
          if (!existing) {
            const created = await api.createLabel(accessToken, fullName);
            if (!created || !created.id) {
              return res.status(500).json({
                success: false,
                error: 'Kunde inte skapa Gmail-etikett'
              });
            }
            existing = { id: created.id, name: created.name || fullName, type: 'user' };
            labels = [...labels, existing];
          }
          setKunderLabelId = existing.id;
        }

        if (setKunderLabelId) {
          const plan = labelsEdit.planKunderLabelSwitch({
            currentLabelIds: currentIds,
            allLabels: labels,
            setLabelId: setKunderLabelId,
            kunderRoot
          });
          addLabelIds = [...new Set([...addLabelIds, ...plan.addLabelIds])];
          removeLabelIds = [...new Set([...removeLabelIds, ...plan.removeLabelIds])];
        }

        const sanitized = labelsEdit.sanitizeModifyIds(addLabelIds, removeLabelIds);
        addLabelIds = sanitized.addLabelIds;
        removeLabelIds = sanitized.removeLabelIds;

        const currentSet = new Set(currentIds.map(String));
        addLabelIds = addLabelIds.filter((id) => !currentSet.has(id));
        removeLabelIds = removeLabelIds.filter((id) => currentSet.has(id));

        let result = currentRaw;
        if (addLabelIds.length || removeLabelIds.length) {
          result = await api.modifyMessageLabels(accessToken, messageId, {
            addLabelIds,
            removeLabelIds
          });
        }

        const nextIds = (result && result.labelIds) || currentIds;
        if (createLeaf) {
          try {
            labels = await api.listLabels(accessToken);
          } catch (_) {
            /* behåll tidigare */
          }
        }
        const customers = await resolveCustomers(user);
        const matched = await matchLabelsWithLinks(user, labels, customers, { kunderRoot });
        const matches = matched.matches;
        const kunderIds = inbox.kunderLabelIdSet(labels, kunderRoot);

        let enriched;
        try {
          const fresh = await api.getMessage(accessToken, messageId, 'metadata');
          enriched = api.summarizeMessage(fresh);
        } catch (_) {
          enriched = api.summarizeMessage({
            ...(result || {}),
            id: messageId,
            labelIds: nextIds,
            payload: { headers: [] },
            snippet: (result && result.snippet) || (currentRaw && currentRaw.snippet) || ''
          });
        }

        const resolved = inbox.resolveCustomerForMessage(enriched, {
          matches,
          customers,
          kunderLabelIds: kunderIds,
          labels,
          excludeEmails: [user.email].filter(Boolean),
          labelLinks: matched.labelLinks || [],
          kunderRoot
        });
        const messageLabels = labelsEdit.resolveMessageLabels(enriched.labelIds, labels, kunderRoot);

        res.json({
          success: true,
          id: messageId,
          labelIds: enriched.labelIds || nextIds,
          labels: messageLabels,
          added: addLabelIds,
          removed: removeLabelIds,
          customerId: resolved && resolved.customerId,
          customerName: resolved && resolved.customerName,
          labelId: resolved && resolved.labelId,
          labelName: resolved && resolved.labelName,
          labelLeaf:
            resolved && resolved.labelName ? match.labelLeafName(resolved.labelName) : null,
          matchReason: resolved && resolved.matchReason,
          kunderLabels: labelsEdit.listKunderChildLabels(labels, kunderRoot),
          kunderRoot,
          labelLinks: matched.labelLinks || []
        });
      } catch (err) {
        console.error('gmail/labels modify:', err.response?.data || err.message);
        const code = err.code || null;
        let status = 500;
        if (code === 'GMAIL_NOT_CONNECTED') status = 400;
        else if (
          code === 'INVALID_LABEL' ||
          code === 'LABEL_NOT_FOUND' ||
          code === 'NOT_KUNDER_CHILD' ||
          code === 'INVALID_KUNDER_NAME'
        ) {
          status = 400;
        } else if (err.response?.status) {
          status = err.response.status;
        }
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Kunde inte ändra etiketter';
        res.status(status).json({ success: false, error: msg, code });
      }
    }

    app.post('/api/gmail/messages/:id/labels', authenticateToken, modifyMessageLabelsHandler);
    app.patch('/api/gmail/messages/:id/labels', authenticateToken, modifyMessageLabelsHandler);


    /**
     * Explicit etikett→kund-kopplingar (ClientFlow), utan att kräva Gmail-ändring.
     */
    app.get('/api/gmail/label-links', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const links = await store.loadLabelLinks(user.id);
        res.json({ success: true, links });
      } catch (err) {
        console.error('gmail/label-links get:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.put('/api/gmail/label-links', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const body = req.body || {};
        const kundId = String(body.kundId || body.customerId || '').trim();
        let labelId = String(body.labelId || '').trim() || null;
        let labelName = String(body.labelName || '').trim() || null;
        if (!kundId) {
          return res.status(400).json({
            success: false,
            error: 'kundId saknas',
            code: 'INVALID_LABEL_LINK'
          });
        }
        if (!labelId && !labelName) {
          return res.status(400).json({
            success: false,
            error: 'labelId eller labelName krävs',
            code: 'INVALID_LABEL_LINK'
          });
        }

        const customer = await resolveCustomerForSend(user, kundId, {
          getAccessibleCustomer,
          listAccessibleCustomers
        });
        if (!customer) {
          return res.status(403).json({ success: false, error: 'Ingen behörighet till kunden' });
        }

        let gmailSynced = null;
        const syncGmail = body.syncGmailLabel === true || body.updateGmailLabel === true;
        const messageId = String(body.messageId || '').trim() || null;

        if ((!labelName || syncGmail) && (labelId || syncGmail)) {
          try {
            const { accessToken } = await getValidAccessToken(user);
            const labels = await api.listLabels(accessToken);
            if (labelId && !labelName) {
              const found = (labels || []).find((l) => l.id === labelId);
              if (found) labelName = found.name;
            }
            if (syncGmail) {
              const kunderRoot = KUNDER_ROOT();
              const desiredName = labelsEdit.normalizeKunderLabelName(customer.namn, kunderRoot);
              let target = labelsEdit.findLabelByName(labels, desiredName);
              if (!target) {
                const created = await api.createLabel(accessToken, desiredName);
                target = created
                  ? { id: created.id, name: created.name || desiredName }
                  : null;
              }
              if (target && messageId) {
                const currentRaw = await api.getMessage(accessToken, messageId, 'metadata');
                const allLabels = target.id
                  ? [...labels, { id: target.id, name: target.name, type: 'user' }]
                  : labels;
                const plan = labelsEdit.planKunderLabelSwitch({
                  currentLabelIds: (currentRaw && currentRaw.labelIds) || [],
                  allLabels,
                  setLabelId: target.id,
                  kunderRoot
                });
                if (plan.addLabelIds.length || plan.removeLabelIds.length) {
                  await api.modifyMessageLabels(accessToken, messageId, {
                    addLabelIds: plan.addLabelIds,
                    removeLabelIds: plan.removeLabelIds
                  });
                }
                labelId = target.id;
                labelName = target.name;
                gmailSynced = { labelId, labelName };
              } else if (target) {
                labelId = target.id;
                labelName = target.name;
                gmailSynced = { labelId, labelName, messageUpdated: false };
              }
            }
          } catch (err) {
            if (syncGmail) {
              const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : 500;
              return res.status(status).json({
                success: false,
                error: err.message || 'Kunde inte synka Gmail-etikett',
                code: err.code || null
              });
            }
          }
        }

        const existing = await store.loadLabelLinks(user.id);
        const next = labelLinks.upsertLink(
          existing,
          { labelId, labelName, kundId: customer.id },
          { byraId: user.byraId || null, userId: user.id }
        );
        const saved = await store.saveLabelLinks(user.id, next);
        const link = labelLinks.findLinkForLabel(saved, {
          id: labelId,
          name: labelName
        });

        res.json({
          success: true,
          link,
          links: saved,
          customerId: customer.id,
          customerName: customer.namn,
          matchReason: 'link',
          gmailSynced
        });
      } catch (err) {
        console.error('gmail/label-links put:', err.message);
        const status = err.code === 'INVALID_LABEL_LINK' ? 400 : 500;
        res.status(status).json({ success: false, error: err.message, code: err.code || null });
      }
    });

    app.delete('/api/gmail/label-links', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const body = req.body || {};
        const labelId = String(body.labelId || req.query.labelId || '').trim() || null;
        const labelName = String(body.labelName || req.query.labelName || '').trim() || null;
        if (!labelId && !labelName) {
          return res.status(400).json({
            success: false,
            error: 'labelId eller labelName krävs',
            code: 'INVALID_LABEL_LINK'
          });
        }
        const existing = await store.loadLabelLinks(user.id);
        const next = labelLinks.removeLink(existing, { labelId, labelName });
        const saved = await store.saveLabelLinks(user.id, next);
        res.json({ success: true, links: saved });
      } catch (err) {
        console.error('gmail/label-links delete:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/gmail/messages/:id/trash', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const messageId = String(req.params.id || '').trim();
        if (!messageId) {
          return res.status(400).json({ success: false, error: 'Meddelande-id saknas' });
        }
        const { accessToken } = await getValidAccessToken(user);
        const result = await api.trashMessage(accessToken, messageId);
        try {
          const cached = await store.loadSyncCache(user.id);
          if (cached && (cached.messages || []).length) {
            const next = syncCache.mergeHistoryIntoCache(cached, {
              removedIds: [messageId],
              historyId: cached.historyId,
              labels: cached.labels,
              syncedAt: cached.syncedAt || new Date().toISOString()
            });
            await store.saveSyncCache(user.id, next);
          }
        } catch (_) {
          /* cache-uppdatering är best-effort */
        }
        res.json({
          success: true,
          id: result && result.id ? result.id : messageId,
          labelIds: (result && result.labelIds) || ['TRASH']
        });
      } catch (err) {
        console.error('gmail/trash:', err.response?.data || err.message);
        const status = err.code === 'GMAIL_NOT_CONNECTED' ? 400 : err.response?.status || 500;
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Kunde inte radera mejlet';
        res.status(status).json({ success: false, error: msg, code: err.code || null });
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
    registerArchiveRoutes(app, {
      authenticateToken,
      requireUser,
      getValidAccessToken,
      getAccessibleCustomer
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
    pushRunScheduleForUser,
    pushRunScheduleItems,
    pushMeetingForUser,
    pullGoogleEventsForUser,
    ensureGmailField: store.ensureGmailField,
    ensureMejlarkivTable: archiveStore.ensureMejlarkivTable,
    isConfigured: oauth.isOAuthConfigured
  };
}

module.exports = {
  createGmailIntegration,
  match,
  inbox,
  labelsEdit,
  oauth,
  api,
  store,
  syncCache,
  archiveStore,
  archiveAccess: require('./archive-access'),
  archiveSave: require('./archive-save'),
  attachmentServe,
  customers: require('./customers'),
  calendarApi,
  calendarSync
};
