/**
 * Mötesbokning – inbjudan med tidsluckor + publik token-länk.
 * Airtable-tabell: "Mötesbokning"
 */
const crypto = require('crypto');
const axios = require('axios');

const TABLE_NAME = 'Mötesbokning';
const TABLE_ENV = 'AIRTABLE_TABLE_MOTESBOKNING_ID';

const STATUS = {
  OPEN: 'Öppen',
  BOOKED: 'Bokad',
  CLOSED: 'Stängd',
  CANCELLED: 'Avbokad'
};

const SLOT_STATUS = {
  FREE: 'Ledig',
  BOOKED: 'Bokad'
};

function airtableToken() {
  return String(process.env.AIRTABLE_ACCESS_TOKEN || '').trim();
}

function airtableBaseId() {
  return String(process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50').trim();
}

function publicAppBase(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = (req && (req.get('x-forwarded-host') || req.get('host'))) || '';
  const proto = (req && (req.get('x-forwarded-proto') || req.protocol)) || 'https';
  if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    return `${proto}://${host}`;
  }
  return 'https://www.app.clientflow.se';
}

function escapeFormula(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function newSlotId() {
  return crypto.randomBytes(6).toString('hex');
}

function parseSlots(raw) {
  if (Array.isArray(raw)) return raw;
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function serializeSlots(slots) {
  return JSON.stringify(Array.isArray(slots) ? slots : []);
}

function normalizeSlot(input) {
  const start = String(input?.start || input?.Start || '').trim();
  const end = String(input?.end || input?.Slut || '').trim();
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return {
    id: String(input?.id || newSlotId()),
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    status: input?.status === SLOT_STATUS.BOOKED ? SLOT_STATUS.BOOKED : SLOT_STATUS.FREE
  };
}

function normalizeSlots(list) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeSlot)
    .filter(Boolean)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

function recordToInvite(rec) {
  const f = rec?.fields || {};
  return {
    id: rec.id,
    byraId: String(f['Byrå ID'] || '').trim(),
    customerId: String(f['Kund ID'] || '').trim(),
    customerName: String(f['Kundnamn'] || '').trim(),
    title: String(f['Titel'] || 'Möte').trim() || 'Möte',
    message: String(f['Meddelande'] || '').trim(),
    location: String(f['Plats'] || '').trim(),
    meetingType: String(f['Mötestyp'] || 'Distans').trim() || 'Distans',
    token: String(f['Token'] || '').trim(),
    status: String(f['Status'] || STATUS.OPEN).trim() || STATUS.OPEN,
    slots: normalizeSlots(parseSlots(f['Luckor'])),
    bookerName: String(f['Bokare namn'] || '').trim(),
    bookerEmail: String(f['Bokare e-post'] || '').trim(),
    note: String(f['Anteckning'] || '').trim(),
    bookedSlotId: String(f['Bokad lucka-id'] || '').trim(),
    bookedStart: String(f['Bokad start'] || '').trim(),
    bookedEnd: String(f['Bokad slut'] || '').trim(),
    createdAt: String(f['Skapad'] || rec.createdTime || '').trim(),
    createdBy: String(f['Skapad av'] || '').trim()
  };
}

function bookingUrl(token, req) {
  return `${publicAppBase(req)}/boka-mote.html?token=${encodeURIComponent(token)}`;
}

async function getTableId(token, baseId) {
  const envId = String(process.env[TABLE_ENV] || '').trim();
  if (envId) return envId;
  const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000
  });
  const t = (res.data?.tables || []).find((x) => String(x.name || '').trim() === TABLE_NAME);
  return t ? t.id : null;
}

const REQUIRED_FIELDS = [
  { name: 'Byrå ID', type: 'singleLineText' },
  { name: 'Kund ID', type: 'singleLineText' },
  { name: 'Kundnamn', type: 'singleLineText' },
  { name: 'Titel', type: 'singleLineText' },
  { name: 'Meddelande', type: 'multilineText' },
  { name: 'Plats', type: 'singleLineText' },
  {
    name: 'Mötestyp',
    type: 'singleSelect',
    options: { choices: [{ name: 'Distans' }, { name: 'På plats' }, { name: 'Telefon' }] }
  },
  { name: 'Token', type: 'singleLineText' },
  {
    name: 'Status',
    type: 'singleSelect',
    options: {
      choices: [
        { name: STATUS.OPEN },
        { name: STATUS.BOOKED },
        { name: STATUS.CLOSED },
        { name: STATUS.CANCELLED }
      ]
    }
  },
  { name: 'Luckor', type: 'multilineText', description: 'JSON-array med tidsluckor' },
  { name: 'Bokare namn', type: 'singleLineText' },
  { name: 'Bokare e-post', type: 'email' },
  { name: 'Anteckning', type: 'multilineText' },
  { name: 'Bokad lucka-id', type: 'singleLineText' },
  {
    name: 'Bokad start',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  {
    name: 'Bokad slut',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  {
    name: 'Skapad',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  { name: 'Skapad av', type: 'singleLineText' }
];

async function ensureTableAndFields({ token, baseId }) {
  const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  const tables = metaRes.data?.tables || [];
  let table = tables.find((t) => String(t.name || '').trim() === TABLE_NAME);
  const createdFields = [];

  if (!table) {
    const createRes = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        name: TABLE_NAME,
        description: 'Mötesinbjudningar med bokningsbara tidsluckor (ClientFlow)',
        fields: REQUIRED_FIELDS
      },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );
    return {
      tableId: createRes.data.id,
      alreadyExists: false,
      createdFields: REQUIRED_FIELDS.map((f) => f.name)
    };
  }

  const existingNames = new Set((table.fields || []).map((f) => String(f.name || '').trim()));
  for (const field of REQUIRED_FIELDS) {
    if (existingNames.has(field.name)) continue;
    try {
      await axios.post(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`,
        field,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
      createdFields.push(field.name);
    } catch (err) {
      console.warn('Mötesbokning fält:', field.name, err.response?.data || err.message);
    }
  }
  return { tableId: table.id, alreadyExists: true, createdFields };
}

async function listInvites({ token, baseId, tableId, byraId, customerId }) {
  const parts = [`{Byrå ID}='${escapeFormula(byraId)}'`];
  if (customerId) parts.push(`{Kund ID}='${escapeFormula(customerId)}'`);
  const formula = parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
  const records = [];
  let offset;
  do {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        filterByFormula: formula,
        pageSize: 100,
        ...(offset ? { offset } : {})
      },
      timeout: 20000
    });
    records.push(...(res.data?.records || []));
    offset = res.data?.offset;
  } while (offset);

  return records
    .map(recordToInvite)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function findByToken({ token, baseId, tableId, bookingToken }) {
  const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      filterByFormula: `{Token}='${escapeFormula(bookingToken)}'`,
      maxRecords: 1
    },
    timeout: 15000
  });
  const rec = (res.data?.records || [])[0];
  return rec ? recordToInvite(rec) : null;
}

async function getInvite({ token, baseId, tableId, id }) {
  const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return recordToInvite(res.data);
}

async function createInvite({ token, baseId, tableId, fields }) {
  const res = await axios.post(
    `https://api.airtable.com/v0/${baseId}/${tableId}`,
    { fields },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return recordToInvite(res.data);
}

async function updateInvite({ token, baseId, tableId, id, fields }) {
  const res = await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${id}`,
    { fields },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return recordToInvite(res.data);
}

function createMotesbokning(deps) {
  const { authenticateToken, getAirtableUser, onMeetingBooked } = deps;

  async function requireUser(req, res) {
    const user = await getAirtableUser(req.user.email);
    if (!user) {
      res.status(401).json({ error: 'Användare hittades inte' });
      return null;
    }
    const byraId = String(user.byraId || '').trim();
    if (!byraId && user.role !== 'ClientFlowAdmin') {
      res.status(403).json({ error: 'Byrå saknas' });
      return null;
    }
    return user;
  }

  async function ctxOrFail(res) {
    const token = airtableToken();
    const baseId = airtableBaseId();
    if (!token) {
      res.status(500).json({ error: 'AIRTABLE_ACCESS_TOKEN saknas' });
      return null;
    }
    let tableId = null;
    try {
      tableId = await getTableId(token, baseId);
    } catch (err) {
      console.warn('getTableId mötesbokning:', err.message);
    }
    if (!tableId) {
      res.status(503).json({
        error: 'Tabellen "Mötesbokning" saknas. Kör setup via knappen på Möten-sidan.',
        needsSetup: true
      });
      return null;
    }
    return { token, baseId, tableId };
  }

  function registerRoutes(app) {
    app.post('/api/setup/airtable-motesbokning', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const token = airtableToken();
        const baseId = airtableBaseId();
        if (!token) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
        const result = await ensureTableAndFields({ token, baseId });
        res.json({
          success: true,
          message: result.alreadyExists
            ? (result.createdFields.length
              ? `Tabellen finns. ${result.createdFields.length} fält lades till.`
              : 'Tabellen "Mötesbokning" finns redan.')
            : 'Tabellen "Mötesbokning" skapades.',
          ...result
        });
      } catch (err) {
        const status = err.response?.status || 500;
        const msg = err.response?.data?.error?.message || err.message;
        console.error('setup airtable-motesbokning:', msg);
        res.status(status).json({
          success: false,
          error: msg || 'Kunde inte skapa tabellen',
          hint: status === 403 || status === 401
            ? 'Kräver Airtable-token med schema.bases:read och schema.bases:write'
            : undefined
        });
      }
    });

    app.get('/api/motesbokning/invites', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const byraId = String(req.query.byraId || user.byraId || '').trim();
        if (!byraId) return res.status(400).json({ error: 'byraId saknas' });
        if (user.role !== 'ClientFlowAdmin' && String(user.byraId) !== byraId) {
          return res.status(403).json({ error: 'Ingen behörighet' });
        }
        const customerId = String(req.query.customerId || '').trim();
        const invites = await listInvites({
          ...ctx,
          byraId,
          customerId: customerId || undefined
        });
        res.json({
          invites: invites.map((inv) => ({
            ...inv,
            bookingUrl: inv.token ? bookingUrl(inv.token, req) : ''
          }))
        });
      } catch (err) {
        console.error('GET /api/motesbokning/invites:', err.message);
        res.status(500).json({ error: err.message || 'Kunde inte hämta möten' });
      }
    });

    app.post('/api/motesbokning/invites', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;

        const body = req.body || {};
        const byraId = String(user.byraId || body.byraId || '').trim();
        if (!byraId) return res.status(400).json({ error: 'byraId saknas' });

        const slots = normalizeSlots(body.slots);
        if (!slots.length) return res.status(400).json({ error: 'Minst en tidslucka krävs' });

        const token = newToken();
        const nowIso = new Date().toISOString();
        const meetingType = ['Distans', 'På plats', 'Telefon'].includes(String(body.meetingType || '').trim())
          ? String(body.meetingType).trim()
          : 'Distans';

        const invite = await createInvite({
          ...ctx,
          fields: {
            'Byrå ID': byraId,
            'Kund ID': String(body.customerId || '').trim(),
            Kundnamn: String(body.customerName || '').trim(),
            Titel: String(body.title || 'Möte').trim() || 'Möte',
            Meddelande: String(body.message || '').trim(),
            Plats: String(body.location || '').trim(),
            Mötestyp: meetingType,
            Token: token,
            Status: STATUS.OPEN,
            Luckor: serializeSlots(slots),
            Skapad: nowIso,
            'Skapad av': String(user.email || req.user.email || '').trim()
          }
        });

        res.status(201).json({
          invite: {
            ...invite,
            bookingUrl: bookingUrl(token, req)
          }
        });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error('POST /api/motesbokning/invites:', msg);
        res.status(err.response?.status || 500).json({ error: msg || 'Kunde inte skapa inbjudan' });
      }
    });

    app.put('/api/motesbokning/invites/:id/close', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const existing = await getInvite({ ...ctx, id: req.params.id });
        if (!existing) return res.status(404).json({ error: 'Hittades inte' });
        if (user.role !== 'ClientFlowAdmin' && existing.byraId !== String(user.byraId || '')) {
          return res.status(403).json({ error: 'Ingen behörighet' });
        }
        const invite = await updateInvite({
          ...ctx,
          id: req.params.id,
          fields: { Status: STATUS.CLOSED }
        });
        res.json({ invite: { ...invite, bookingUrl: invite.token ? bookingUrl(invite.token, req) : '' } });
      } catch (err) {
        console.error('PUT close mötesbokning:', err.message);
        res.status(500).json({ error: err.message || 'Kunde inte stänga' });
      }
    });

    app.put('/api/motesbokning/invites/:id/cancel', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const existing = await getInvite({ ...ctx, id: req.params.id });
        if (!existing) return res.status(404).json({ error: 'Hittades inte' });
        if (user.role !== 'ClientFlowAdmin' && existing.byraId !== String(user.byraId || '')) {
          return res.status(403).json({ error: 'Ingen behörighet' });
        }
        const slots = existing.slots.map((s) => ({ ...s, status: SLOT_STATUS.FREE }));
        const invite = await updateInvite({
          ...ctx,
          id: req.params.id,
          fields: {
            Status: STATUS.CANCELLED,
            Luckor: serializeSlots(slots),
            'Bokare namn': '',
            'Bokare e-post': '',
            Anteckning: '',
            'Bokad lucka-id': '',
            'Bokad start': null,
            'Bokad slut': null
          }
        });
        res.json({ invite: { ...invite, bookingUrl: invite.token ? bookingUrl(invite.token, req) : '' } });
      } catch (err) {
        console.error('PUT cancel mötesbokning:', err.message);
        res.status(500).json({ error: err.message || 'Kunde inte avboka' });
      }
    });

    app.get('/api/motesbokning/public/:token', async (req, res) => {
      try {
        const bookingToken = String(req.params.token || '').trim();
        if (!bookingToken) return res.status(400).json({ error: 'token saknas' });
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const invite = await findByToken({ ...ctx, bookingToken });
        if (!invite) return res.status(404).json({ error: 'Inbjudan hittades inte' });

        if (invite.status === STATUS.CLOSED || invite.status === STATUS.CANCELLED) {
          return res.json({
            title: invite.title,
            message: invite.message,
            location: invite.location,
            meetingType: invite.meetingType,
            status: invite.status,
            slots: [],
            booked: null
          });
        }

        if (invite.status === STATUS.BOOKED) {
          return res.json({
            title: invite.title,
            message: invite.message,
            location: invite.location,
            meetingType: invite.meetingType,
            status: invite.status,
            slots: [],
            booked: {
              start: invite.bookedStart,
              end: invite.bookedEnd,
              bookerName: invite.bookerName
            }
          });
        }

        const freeSlots = invite.slots.filter((s) => s.status !== SLOT_STATUS.BOOKED);
        res.json({
          title: invite.title,
          message: invite.message,
          location: invite.location,
          meetingType: invite.meetingType,
          status: invite.status,
          slots: freeSlots.map((s) => ({ id: s.id, start: s.start, end: s.end })),
          booked: null
        });
      } catch (err) {
        console.error('GET public mötesbokning:', err.message);
        res.status(500).json({ error: err.message || 'Kunde inte hämta inbjudan' });
      }
    });

    app.post('/api/motesbokning/public/:token/book', async (req, res) => {
      try {
        const bookingToken = String(req.params.token || '').trim();
        const slotId = String(req.body?.slotId || '').trim();
        const bookerName = String(req.body?.name || '').trim();
        const bookerEmail = String(req.body?.email || '').trim();
        const note = String(req.body?.note || '').trim();
        if (!bookingToken || !slotId) return res.status(400).json({ error: 'token och slotId krävs' });
        if (!bookerName) return res.status(400).json({ error: 'Namn krävs' });

        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const invite = await findByToken({ ...ctx, bookingToken });
        if (!invite) return res.status(404).json({ error: 'Inbjudan hittades inte' });
        if (invite.status !== STATUS.OPEN) {
          return res.status(409).json({ error: 'Inbjudan är inte öppen för bokning' });
        }

        const slot = invite.slots.find((s) => s.id === slotId);
        if (!slot) return res.status(404).json({ error: 'Tidsluckan hittades inte' });
        if (slot.status === SLOT_STATUS.BOOKED) {
          return res.status(409).json({ error: 'Tidsluckan är redan bokad' });
        }

        const nextSlots = invite.slots.map((s) => (
          s.id === slotId ? { ...s, status: SLOT_STATUS.BOOKED } : s
        ));

        const updated = await updateInvite({
          ...ctx,
          id: invite.id,
          fields: {
            Status: STATUS.BOOKED,
            Luckor: serializeSlots(nextSlots),
            'Bokare namn': bookerName.slice(0, 200),
            'Bokare e-post': bookerEmail.slice(0, 200),
            Anteckning: note.slice(0, 5000),
            'Bokad lucka-id': slotId,
            'Bokad start': slot.start,
            'Bokad slut': slot.end
          }
        });

        if (typeof onMeetingBooked === 'function') {
          try {
            await onMeetingBooked(updated);
          } catch (hookErr) {
            console.warn('motesbokning onMeetingBooked:', hookErr.message);
          }
        }

        res.json({
          success: true,
          booked: {
            start: updated.bookedStart,
            end: updated.bookedEnd,
            title: updated.title,
            location: updated.location,
            meetingType: updated.meetingType,
            bookerName: updated.bookerName
          }
        });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error('POST public book mötesbokning:', msg);
        res.status(500).json({ error: msg || 'Kunde inte boka' });
      }
    });
  }

  return { registerRoutes, TABLE_NAME, STATUS };
}

module.exports = { createMotesbokning, TABLE_NAME, STATUS, normalizeSlots };
