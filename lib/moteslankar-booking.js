/**
 * Beroenden för möteslänkar: Google-busy, delningsposter och bokning → Mötesbokning + kalender.
 */
const axios = require('axios');
const Availability = require('./moteslankar-availability');
const motesbokning = require('./motesbokning');
const gmailPkg = require('./gmail');

const {
  STATUS,
  SLOT_STATUS,
  airtableToken,
  airtableBaseId,
  escapeFormula,
  serializeSlots,
  newToken,
  createInvite,
  updateInvite,
  findByToken,
  getTableId,
  ensureTableAndFields,
  recordToInvite
} = motesbokning;

/** Fält som lagts till senare – saknas ofta tills setup körts. */
const EXTENDED_INVITE_FIELDS = ['Möteslänk ID', 'Länk-slug', 'Källa'];

function airtableErrorMessage(err) {
  const ae = err?.response?.data?.error;
  if (ae && typeof ae === 'object') {
    if (ae.message) return String(ae.message);
    if (ae.type) return String(ae.type);
  }
  if (typeof err?.response?.data === 'string' && err.response.data) return err.response.data;
  return err?.message || 'Airtable-fel';
}

/** Parse "Unknown field name: \"X\"" / similar from Airtable 422 body. */
function unknownFieldNamesFromError(err) {
  const msg = airtableErrorMessage(err);
  const names = new Set();
  const re = /Unknown field name:\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(msg))) names.add(m[1]);
  if (/INVALID_MULTIPLE_CHOICE|insufficient permissions/i.test(msg)) {
    for (const key of EXTENDED_INVITE_FIELDS) names.add(key);
  }
  return [...names];
}

function omitEmptyEmail(fields) {
  const out = { ...(fields || {}) };
  if (!String(out['Bokare e-post'] || '').trim()) {
    delete out['Bokare e-post'];
  }
  return out;
}

function withoutKeys(fields, keys) {
  const out = omitEmptyEmail(fields);
  for (const key of keys || []) delete out[key];
  return out;
}

function withoutExtended(fields) {
  return withoutKeys(fields, EXTENDED_INVITE_FIELDS);
}

async function inviteWriteResilient(label, ctx, writeOnce, fields) {
  let attempt = omitEmptyEmail(fields);
  const dropped = new Set();
  for (let i = 0; i < 4; i += 1) {
    try {
      return await writeOnce(attempt);
    } catch (err) {
      if (err.response?.status !== 422) throw err;
      console.warn(`${label} 422:`, airtableErrorMessage(err));
      if (i === 0) {
        try {
          await ensureTableAndFields(ctx);
        } catch (setupErr) {
          console.warn('ensure Mötesbokning vid 422:', setupErr.message);
        }
        continue;
      }
      const unknown = unknownFieldNamesFromError(err);
      const toDrop = unknown.length ? unknown : EXTENDED_INVITE_FIELDS;
      let changed = false;
      for (const key of toDrop) {
        if (Object.prototype.hasOwnProperty.call(attempt, key) && !dropped.has(key)) {
          dropped.add(key);
          changed = true;
        }
      }
      if (!changed) {
        const stripped = withoutExtended(attempt);
        if (Object.keys(stripped).length >= Object.keys(attempt).length) throw err;
        attempt = stripped;
        continue;
      }
      attempt = withoutKeys(attempt, [...dropped]);
    }
  }
  return writeOnce(withoutExtended(attempt));
}

async function createInviteResilient(ctx, fields) {
  return inviteWriteResilient(
    'createInvite',
    ctx,
    (payload) => createInvite({ ...ctx, fields: payload }),
    fields
  );
}

async function updateInviteResilient(ctx, id, fields) {
  return inviteWriteResilient(
    'updateInvite',
    ctx,
    (payload) => updateInvite({ ...ctx, id, fields: payload }),
    fields
  );
}

async function ctx() {
  const token = airtableToken();
  const baseId = airtableBaseId();
  if (!token) {
    const err = new Error('AIRTABLE_ACCESS_TOKEN saknas');
    err.code = 'NO_TOKEN';
    throw err;
  }
  let tableId = await getTableId(token, baseId);
  if (!tableId) {
    const ensured = await ensureTableAndFields({ token, baseId });
    tableId = ensured.tableId;
  }
  return { token, baseId, tableId };
}

function createMoteslankarBookingDeps(deps) {
  const { getAirtableUser, gmailIntegration, onMeetingBooked } = deps;

  async function listBusyForHost(hostEmail, fromIso, toIso) {
    const email = String(hostEmail || '').trim();
    if (!email) return [];
    const user = await getAirtableUser(email);
    if (!user) return [];
    try {
      const { accessToken, tokens } = await gmailIntegration.getValidAccessToken(user);
      if (!gmailPkg.oauth.tokenHasCalendarScope(tokens)) return [];
      const events = await gmailPkg.calendarApi.listEvents(accessToken, {
        timeMin: fromIso,
        timeMax: toIso
      });
      return Availability.busyFromGoogleEvents(events);
    } catch (err) {
      console.warn('listBusyForHost:', err.message);
      return [];
    }
  }

  async function listBookedBusyForHost(hostEmail, fromIso, toIso) {
    const email = String(hostEmail || '').trim();
    if (!email) return [];
    try {
      const c = await ctx();
      const from = String(fromIso || '').slice(0, 10);
      const to = String(toIso || '').slice(0, 10);
      const formula = `AND({Skapad av}='${escapeFormula(email)}',{Status}='${STATUS.BOOKED}')`;
      const records = [];
      let offset;
      do {
        const res = await axios.get(`https://api.airtable.com/v0/${c.baseId}/${c.tableId}`, {
          headers: { Authorization: `Bearer ${c.token}` },
          params: { filterByFormula: formula, pageSize: 100, ...(offset ? { offset } : {}) },
          timeout: 20000
        });
        records.push(...(res.data?.records || []));
        offset = res.data?.offset;
      } while (offset);

      const fromMs = from ? Date.parse(`${from}T00:00:00Z`) : 0;
      const toMs = to ? Date.parse(`${to}T23:59:59Z`) : Number.MAX_SAFE_INTEGER;
      const out = [];
      for (const rec of records) {
        const inv = recordToInvite(rec);
        const s = Date.parse(inv.bookedStart);
        const e = Date.parse(inv.bookedEnd);
        if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
        if (e < fromMs || s > toMs) continue;
        out.push({ start: inv.bookedStart, end: inv.bookedEnd });
      }
      return out;
    } catch (err) {
      console.warn('listBookedBusyForHost:', err.message);
      return [];
    }
  }

  const ONLY_SUGGESTED_PREFIX = 'CF_ONLY_SUGGESTED\n';

  function normalizeSuggestedSlots(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const item of list) {
      const start = String(item?.start || '').trim();
      const end = String(item?.end || '').trim();
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(endMs > startMs)) continue;
      out.push({
        id: String(item?.id || `sug-${startMs.toString(36)}`),
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        status: SLOT_STATUS.FREE
      });
    }
    return out.sort((a, b) => String(a.start).localeCompare(String(b.start))).slice(0, 40);
  }

  async function createShareRecord({
    link,
    hostEmail,
    byraId,
    agenda,
    customerId,
    customerName,
    token,
    suggestedSlots,
    onlySuggested
  }) {
    const c = await ctx();
    const shareToken = String(token || newToken()).trim();
    const slots = normalizeSuggestedSlots(suggestedSlots);
    const desc = String(link.description || '').trim();
    const message = onlySuggested ? `${ONLY_SUGGESTED_PREFIX}${desc}` : desc;
    const invite = await createInviteResilient(c, {
      'Byrå ID': String(byraId || link.byraId || '').trim(),
      'Kund ID': String(customerId || '').trim(),
      Kundnamn: String(customerName || '').trim(),
      Titel: String(link.title || 'Möte').trim() || 'Möte',
      Meddelande: message,
      Plats: '',
      Mötestyp: 'Distans',
      Token: shareToken,
      Status: STATUS.OPEN,
      Luckor: serializeSlots(slots),
      Anteckning: String(agenda || '').trim().slice(0, 5000),
      'Möteslänk ID': String(link.id || '').trim(),
      'Länk-slug': String(link.slug || '').trim(),
      Källa: 'Delning',
      Skapad: new Date().toISOString(),
      'Skapad av': String(hostEmail || '').trim()
    });
    return {
      id: invite.id,
      token: invite.token,
      status: invite.status,
      agenda: invite.note,
      customerId: invite.customerId,
      customerName: invite.customerName,
      linkId: invite.linkId,
      linkSlug: invite.linkSlug,
      byraId: invite.byraId,
      suggestedSlots: (invite.slots || []).map((s) => ({ start: s.start, end: s.end, id: s.id })),
      onlySuggested: String(invite.message || '').startsWith(ONLY_SUGGESTED_PREFIX.trim())
    };
  }

  async function findShareByToken(shareToken) {
    const tok = String(shareToken || '').trim();
    if (!tok) return null;
    const c = await ctx();
    const invite = await findByToken({ ...c, bookingToken: tok });
    if (!invite || invite.source !== 'Delning') return null;
    const onlySuggested = String(invite.message || '').startsWith(ONLY_SUGGESTED_PREFIX.trim());
    return {
      id: invite.id,
      token: invite.token,
      status: invite.status,
      agenda: invite.note,
      customerId: invite.customerId,
      customerName: invite.customerName,
      linkId: invite.linkId,
      linkSlug: invite.linkSlug,
      byraId: invite.byraId,
      hostEmail: invite.createdBy,
      suggestedSlots: (invite.slots || []).map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end
      })),
      onlySuggested
    };
  }

  async function createBookingFromLink({
    link,
    start,
    end,
    bookerName,
    bookerEmail,
    agenda,
    location,
    meetingType,
    shareToken,
    customerId,
    customerName
  }) {
    const c = await ctx();
    const startIso = new Date(Date.parse(start)).toISOString();
    const endIso = new Date(Date.parse(end)).toISOString();
    const slotId = `slot-${Date.parse(startIso).toString(36)}`;
    const slots = [{
      id: slotId,
      start: startIso,
      end: endIso,
      status: SLOT_STATUS.BOOKED
    }];

    let share = null;
    if (shareToken) {
      share = await findShareByToken(shareToken);
    }

    const fields = {
      'Byrå ID': String(link.byraId || share?.byraId || '').trim(),
      'Kund ID': String(customerId || share?.customerId || '').trim(),
      Kundnamn: String(customerName || share?.customerName || '').trim(),
      Titel: String(link.title || 'Möte').trim() || 'Möte',
      Meddelande: String(link.description || '').trim(),
      Plats: String(location || '').trim(),
      Mötestyp: ['Distans', 'På plats', 'Telefon'].includes(String(meetingType || ''))
        ? String(meetingType)
        : 'Distans',
      Status: STATUS.BOOKED,
      Luckor: serializeSlots(slots),
      'Bokare namn': String(bookerName || '').trim().slice(0, 200),
      'Bokare e-post': String(bookerEmail || '').trim().slice(0, 200),
      Anteckning: String(agenda || '').trim().slice(0, 5000),
      'Bokad lucka-id': slotId,
      'Bokad start': startIso,
      'Bokad slut': endIso,
      'Möteslänk ID': String(link.id || '').trim(),
      'Länk-slug': String(link.slug || '').trim(),
      Källa: share ? 'Delning' : 'Möteslänk',
      'Skapad av': String(link.hostEmail || share?.hostEmail || '').trim()
    };

    let invite;
    if (share?.id) {
      invite = await updateInviteResilient(c, share.id, {
        ...fields,
        Token: share.token
      });
    } else {
      invite = await createInviteResilient(c, {
        ...fields,
        Token: newToken(),
        Skapad: new Date().toISOString()
      });
    }

    if (typeof onMeetingBooked === 'function') {
      try {
        await onMeetingBooked(invite);
      } catch (err) {
        console.warn('moteslankar onMeetingBooked:', err.message);
      }
    }

    return invite;
  }

  return {
    listBusyForHost,
    listBookedBusyForHost,
    createShareRecord,
    findShareByToken,
    createBookingFromLink
  };
}

module.exports = {
  createMoteslankarBookingDeps,
  // Exporteras för tester
  omitEmptyEmail,
  withoutExtended,
  unknownFieldNamesFromError,
  airtableErrorMessage,
  EXTENDED_INVITE_FIELDS
};
