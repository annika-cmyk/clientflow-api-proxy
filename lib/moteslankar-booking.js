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

  async function createShareRecord({
    link,
    hostEmail,
    byraId,
    agenda,
    customerId,
    customerName,
    token
  }) {
    const c = await ctx();
    const shareToken = String(token || newToken()).trim();
    const invite = await createInvite({
      ...c,
      fields: {
        'Byrå ID': String(byraId || link.byraId || '').trim(),
        'Kund ID': String(customerId || '').trim(),
        Kundnamn: String(customerName || '').trim(),
        Titel: String(link.title || 'Möte').trim() || 'Möte',
        Meddelande: String(link.description || '').trim(),
        Plats: '',
        Mötestyp: 'Distans',
        Token: shareToken,
        Status: STATUS.OPEN,
        Luckor: serializeSlots([]),
        Anteckning: String(agenda || '').trim().slice(0, 5000),
        'Möteslänk ID': String(link.id || '').trim(),
        'Länk-slug': String(link.slug || '').trim(),
        Källa: 'Delning',
        Skapad: new Date().toISOString(),
        'Skapad av': String(hostEmail || '').trim()
      }
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
      byraId: invite.byraId
    };
  }

  async function findShareByToken(shareToken) {
    const tok = String(shareToken || '').trim();
    if (!tok) return null;
    const c = await ctx();
    const invite = await findByToken({ ...c, bookingToken: tok });
    if (!invite || invite.source !== 'Delning') return null;
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
      hostEmail: invite.createdBy
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
      invite = await updateInvite({
        ...c,
        id: share.id,
        fields: {
          ...fields,
          Token: share.token
        }
      });
    } else {
      invite = await createInvite({
        ...c,
        fields: {
          ...fields,
          Token: newToken(),
          Skapad: new Date().toISOString()
        }
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

module.exports = { createMoteslankarBookingDeps };
