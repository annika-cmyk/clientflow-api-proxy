'use strict';

/**
 * Fireflies → ClientFlow: webhook sparar mötesanteckning på kund.
 *
 * Env:
 * - FIREFLIES_API_KEY          GraphQL API-nyckel
 * - FIREFLIES_WEBHOOK_SECRET   Signing secret (valfritt men rekommenderat)
 * - FIREFLIES_OWNER_EMAIL      Fallback ClientFlow-användare om organizer_email saknas i CF
 */

const { verifyWebhookSignature } = require('./signature');
const { fetchTranscript } = require('./client');
const { matchCustomerFromTranscript, collectParticipantEmails } = require('./match');
const { buildNotePayload } = require('./note');
const { upsertFirefliesNote } = require('./store');

function createFirefliesIntegration(deps = {}) {
  const {
    getAirtableUser,
    listAccessibleCustomers
  } = deps;

  function firefliesApiKey() {
    return String(process.env.FIREFLIES_API_KEY || '').trim();
  }
  function webhookSecret() {
    return String(process.env.FIREFLIES_WEBHOOK_SECRET || '').trim();
  }
  function ownerEmailFallback() {
    return String(process.env.FIREFLIES_OWNER_EMAIL || '')
      .trim()
      .toLowerCase();
  }

  function readRawBody(req) {
    if (req.rawBody && Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
    // Fallback om verify-hook saknas (mindre säkert vid key-order-skillnader)
    return Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  }

  async function resolveOwnerUser(transcript) {
    const organizer = String((transcript && transcript.organizer_email) || '')
      .trim()
      .toLowerCase();
    const fallback = ownerEmailFallback();
    const candidates = [organizer, fallback].filter(Boolean);
    if (!candidates.length || typeof getAirtableUser !== 'function') return null;

    for (const email of candidates) {
      try {
        const user = await getAirtableUser(email);
        if (user && (user.email || user.id || user.byraId)) {
          return {
            ...user,
            email: user.email || email,
            byraId: user.byraId || user.byra_id || ''
          };
        }
      } catch (_) {
        /* try next */
      }
    }
    return null;
  }

  async function processSummarizedMeeting(meetingId) {
    const apiKey = firefliesApiKey();
    if (!apiKey) {
      const err = new Error('FIREFLIES_API_KEY saknas');
      err.code = 'FIREFLIES_CONFIG';
      throw err;
    }

    const transcript = await fetchTranscript(apiKey, meetingId);
    const user = await resolveOwnerUser(transcript);
    if (!user) {
      return {
        ok: false,
        skipped: true,
        reason: 'no_owner_user',
        message:
          'Kunde inte koppla mötet till en ClientFlow-användare (organizer_email / FIREFLIES_OWNER_EMAIL).'
      };
    }

    let customers = [];
    if (typeof listAccessibleCustomers === 'function') {
      customers = (await listAccessibleCustomers(user)) || [];
    }

    const ignoreEmails = [user.email, ownerEmailFallback()].filter(Boolean);
    const matched = matchCustomerFromTranscript({
      transcript,
      customers,
      ignoreEmails
    });

    if (!matched || !matched.customer) {
      return {
        ok: false,
        skipped: true,
        reason: 'no_customer_match',
        message:
          'Ingen unik kundmatch via deltagarnas e-post. Lägg kundens e-post på kundkortet eller boka mötet via ClientFlow.',
        participants: collectParticipantEmails(transcript),
        meetingId: transcript.id,
        title: transcript.title || ''
      };
    }

    const notePayload = buildNotePayload(transcript, matched.customer, user, {
      meetingId: transcript.id,
      matchedEmail: matched.matchedEmail
    });
    if (!notePayload.byraId && user.byraId) notePayload.byraId = user.byraId;

    const result = await upsertFirefliesNote(notePayload, user, transcript.id);
    return {
      ok: true,
      created: result.created,
      noteId: result.record && result.record.id,
      customerId: matched.customer.id,
      customerName: matched.customer.namn || matched.customer.name || '',
      meetingId: transcript.id,
      title: transcript.title || ''
    };
  }

  function registerRoutes(app) {
    app.post('/api/integrations/fireflies/webhook', async (req, res) => {
      try {
        const secret = webhookSecret();
        if (secret) {
          const signature = req.headers['x-hub-signature'] || '';
          const raw = readRawBody(req);
          if (!verifyWebhookSignature(raw, signature, secret)) {
            return res.status(401).json({ success: false, error: 'Ogiltig signatur' });
          }
        }

        const body = req.body || {};
        const event = String(body.event || body.eventType || '').trim();
        const meetingId = String(body.meeting_id || body.meetingId || '').trim();

        // Fireflies "Send Test Event"
        if (event === 'test' || meetingId.startsWith('test_')) {
          return res.status(200).json({ success: true, ok: true, test: true });
        }

        if (!meetingId) {
          return res.status(400).json({ success: false, error: 'meeting_id saknas' });
        }

        // Vi sparar när sammanfattningen är klar (mötesanteckning).
        if (event && event !== 'meeting.summarized') {
          return res.status(200).json({
            success: true,
            ignored: true,
            event,
            message: 'Ignorerat — endast meeting.summarized skapar anteckning'
          });
        }

        if (!firefliesApiKey()) {
          return res.status(503).json({
            success: false,
            error: 'FIREFLIES_API_KEY är inte konfigurerad'
          });
        }

        const result = await processSummarizedMeeting(meetingId);
        const status = result.ok ? 200 : result.skipped ? 200 : 500;
        return res.status(status).json({ success: !!result.ok, ...result });
      } catch (err) {
        console.error('Fireflies webhook:', err.message);
        const code = err.code || null;
        const status =
          code === 'FIREFLIES_CONFIG'
            ? 503
            : code === 'FIREFLIES_NOT_FOUND'
              ? 404
              : code === 'FIREFLIES_BAD_REQUEST'
                ? 400
                : 500;
        return res.status(status).json({
          success: false,
          error: err.message || 'Fireflies-webhookfel',
          code
        });
      }
    });

    // Enkel health för setup/docs
    app.get('/api/integrations/fireflies/status', (req, res) => {
      res.json({
        success: true,
        configured: {
          apiKey: !!firefliesApiKey(),
          webhookSecret: !!webhookSecret(),
          ownerEmail: !!ownerEmailFallback()
        },
        webhookPath: '/api/integrations/fireflies/webhook'
      });
    });
  }

  return {
    registerRoutes,
    processSummarizedMeeting,
    verifyWebhookSignature,
    fetchTranscript,
    matchCustomerFromTranscript,
    buildNotePayload
  };
}

module.exports = {
  createFirefliesIntegration,
  verifyWebhookSignature,
  fetchTranscript: require('./client').fetchTranscript,
  matchCustomerFromTranscript: require('./match').matchCustomerFromTranscript,
  buildNotePayload: require('./note').buildNotePayload
};
