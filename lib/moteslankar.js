/**
 * Möteslänkar – återanvändbara mötestyper + publik bokning med Google-busy.
 * Airtable-tabell: "Möteslänk"
 */
const crypto = require('crypto');
const axios = require('axios');
const Availability = require('./moteslankar-availability');

const TABLE_NAME = 'Möteslänk';
const TABLE_ENV = 'AIRTABLE_TABLE_MOTESLANK_ID';

const PRIORITY_LABELS = {
  1: 'Låg',
  2: 'Normal',
  3: 'Hög',
  4: 'Högsta'
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

function parseJson(raw, fallback) {
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) return raw;
  const s = String(raw || '').trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

function slugify(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || `mote-${crypto.randomBytes(3).toString('hex')}`;
}

function newShareToken() {
  return crypto.randomBytes(18).toString('hex');
}

function normalizeDurations(raw) {
  const arr = Array.isArray(raw) ? raw : parseJson(raw, []);
  const nums = (Array.isArray(arr) ? arr : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 15 && n <= 480);
  const uniq = [...new Set(nums.map((n) => Math.round(n)))].sort((a, b) => a - b);
  return uniq.length ? uniq : [30, 60];
}

function normalizeLocations(raw) {
  const arr = Array.isArray(raw) ? raw : parseJson(raw, []);
  const out = [];
  for (const item of Array.isArray(arr) ? arr : []) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || 'meet').trim().toLowerCase();
    if (!['meet', 'phone', 'place'].includes(type)) continue;
    const label = String(item.label || '').trim()
      || (type === 'meet' ? 'Google Meet' : type === 'phone' ? 'Telefon' : 'På plats');
    const value = String(item.value || '').trim();
    out.push({
      id: String(item.id || crypto.randomBytes(4).toString('hex')),
      type,
      label,
      value
    });
  }
  return out.length ? out : [{ id: 'meet', type: 'meet', label: 'Google Meet', value: '' }];
}

function normalizeWeekdays(raw) {
  const arr = Array.isArray(raw) ? raw : parseJson(raw, [0, 1, 2, 3, 4]);
  const nums = (Array.isArray(arr) ? arr : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : [0, 1, 2, 3, 4];
}

/** Serialiserbart schema utan startMin/endMin (bara HH:mm). */
function serializeSchedule(schedule) {
  const out = {};
  const src = schedule && typeof schedule === 'object' ? schedule : {};
  for (let d = 0; d <= 6; d++) {
    const key = String(d);
    const list = src[key] || src[d];
    if (!Array.isArray(list) || !list.length) continue;
    const intervals = list
      .map((iv) => ({
        start: String(iv.start || '').trim(),
        end: String(iv.end || '').trim()
      }))
      .filter((iv) => /^\d{1,2}:\d{2}$/.test(iv.start) && /^\d{1,2}:\d{2}$/.test(iv.end));
    if (intervals.length) out[key] = intervals;
  }
  return out;
}

function clampPriority(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.min(4, Math.max(1, Math.round(n)));
}

function recordToLink(rec) {
  const f = rec?.fields || {};
  const durations = normalizeDurations(f['Durationer (JSON)']);
  const locations = normalizeLocations(f['Platser (JSON)']);
  const legacyWeekdays = normalizeWeekdays(f['Veckodagar (JSON)']);
  const dayStart = String(f['Arbetsstart'] || '08:00').trim() || '08:00';
  const dayEnd = String(f['Arbetsslut'] || '17:00').trim() || '17:00';
  const schedule = Availability.normalizeSchedule(f['Schema (JSON)'], {
    weekdays: legacyWeekdays,
    dayStart,
    dayEnd
  });
  const weekdays = Availability.scheduleWeekdays(schedule).length
    ? Availability.scheduleWeekdays(schedule)
    : legacyWeekdays;
  // Första intervallets tider som legacy-fält (bakåtkompatibilitet)
  const firstDay = weekdays[0] != null ? schedule[String(weekdays[0])] : null;
  const firstIv = firstDay && firstDay[0];
  const priority = clampPriority(f['Prioritet']);
  const slug = String(f['Slug'] || '').trim();
  return {
    id: rec.id,
    byraId: String(f['Byrå ID'] || '').trim(),
    hostEmail: String(f['Host e-post'] || '').trim(),
    title: String(f['Titel'] || 'Möte').trim() || 'Möte',
    slug,
    description: String(f['Beskrivning'] || '').trim(),
    durations,
    locations,
    priority,
    priorityLabel: PRIORITY_LABELS[priority] || 'Normal',
    bufferBeforeMin: Math.max(0, Number(f['Buffer före (min)']) || 0),
    bufferAfterMin: Math.max(0, Number(f['Buffer efter (min)']) || 0),
    noticeHours: Math.max(0, Number(f['Min varsel (t)']) || 2),
    windowDays: Math.min(120, Math.max(1, Number(f['Bokningsfönster (dagar)']) || 28)),
    weekdays,
    dayStart: firstIv ? firstIv.start : dayStart,
    dayEnd: firstIv ? firstIv.end : dayEnd,
    schedule: serializeSchedule(schedule),
    defaultAgenda: String(f['Standardagenda'] || '').trim(),
    reminder1h: String(f['Påminnelse 1h'] || 'Ja').trim() !== 'Nej',
    icon: String(f['Ikon'] || 'bolt').trim() || 'bolt',
    color: String(f['Färg'] || '#13505c').trim() || '#13505c',
    visible: String(f['Synlig'] || 'Ja').trim() !== 'Nej',
    createdAt: String(f['Skapad'] || rec.createdTime || '').trim(),
    updatedAt: String(f['Uppdaterad'] || '').trim()
  };
}

function linkPublicUrl(slug, req, extra) {
  const qs = new URLSearchParams({ lank: slug, ...(extra || {}) });
  return `${publicAppBase(req)}/boka-mote.html?${qs.toString()}`;
}

function sharePublicUrl(token, req) {
  return `${publicAppBase(req)}/boka-mote.html?dela=${encodeURIComponent(token)}`;
}

const REQUIRED_FIELDS = [
  { name: 'Byrå ID', type: 'singleLineText' },
  { name: 'Host e-post', type: 'singleLineText' },
  { name: 'Titel', type: 'singleLineText' },
  { name: 'Slug', type: 'singleLineText' },
  { name: 'Beskrivning', type: 'multilineText' },
  { name: 'Durationer (JSON)', type: 'multilineText', description: 'JSON-array minuter t.ex. [30,60]' },
  { name: 'Platser (JSON)', type: 'multilineText', description: 'JSON [{id,type,label,value}] meet|phone|place' },
  { name: 'Prioritet', type: 'number', options: { precision: 0 }, description: '1=låg … 4=högsta' },
  { name: 'Buffer före (min)', type: 'number', options: { precision: 0 } },
  { name: 'Buffer efter (min)', type: 'number', options: { precision: 0 } },
  { name: 'Min varsel (t)', type: 'number', options: { precision: 1 } },
  { name: 'Bokningsfönster (dagar)', type: 'number', options: { precision: 0 } },
  { name: 'Veckodagar (JSON)', type: 'multilineText', description: 'JSON [0..6] mån=0' },
  { name: 'Arbetsstart', type: 'singleLineText', description: 'HH:mm' },
  { name: 'Arbetsslut', type: 'singleLineText', description: 'HH:mm' },
  {
    name: 'Schema (JSON)',
    type: 'multilineText',
    description: 'Per dag: {"0":[{"start":"09:00","end":"12:00"},{"start":"13:00","end":"17:00"}]} mån=0'
  },
  { name: 'Standardagenda', type: 'multilineText' },
  {
    name: 'Påminnelse 1h',
    type: 'singleSelect',
    options: { choices: [{ name: 'Ja' }, { name: 'Nej' }] },
    description: 'Skicka automatisk mejl-påminnelse 1 timme före mötet till värd och bokare'
  },
  { name: 'Ikon', type: 'singleLineText' },
  { name: 'Färg', type: 'singleLineText' },
  {
    name: 'Synlig',
    type: 'singleSelect',
    options: { choices: [{ name: 'Ja' }, { name: 'Nej' }] }
  },
  {
    name: 'Skapad',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  {
    name: 'Uppdaterad',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  }
];

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
        description: 'Återanvändbara möteslänkar / mötestyper (ClientFlow)',
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
      console.warn('Möteslänk fält:', field.name, err.response?.data || err.message);
    }
  }
  return { tableId: table.id, alreadyExists: true, createdFields };
}

function bodyToFields(body, { byraId, hostEmail, existingSlug }) {
  const title = String(body.title || body.Titel || 'Möte').trim() || 'Möte';
  let slug = slugify(body.slug || existingSlug || title);
  const durations = normalizeDurations(body.durations);
  const locations = normalizeLocations(body.locations);
  const dayStart = String(body.dayStart || '08:00').trim() || '08:00';
  const dayEnd = String(body.dayEnd || '17:00').trim() || '17:00';
  const legacyWeekdays = normalizeWeekdays(body.weekdays);
  const schedule = Availability.normalizeSchedule(body.schedule, {
    weekdays: legacyWeekdays,
    dayStart,
    dayEnd
  });
  const weekdays = Availability.scheduleWeekdays(schedule).length
    ? Availability.scheduleWeekdays(schedule)
    : legacyWeekdays;
  const firstDay = weekdays[0] != null ? schedule[String(weekdays[0])] : null;
  const firstIv = firstDay && firstDay[0];
  const priority = clampPriority(body.priority);
  const visible = body.visible === false || body.visible === 'Nej' ? 'Nej' : 'Ja';
  const nowIso = new Date().toISOString();

  return {
    'Byrå ID': byraId,
    'Host e-post': String(hostEmail || body.hostEmail || '').trim(),
    Titel: title,
    Slug: slug,
    Beskrivning: String(body.description || '').trim(),
    'Durationer (JSON)': JSON.stringify(durations),
    'Platser (JSON)': JSON.stringify(locations),
    Prioritet: priority,
    'Buffer före (min)': Math.max(0, Number(body.bufferBeforeMin) || 0),
    'Buffer efter (min)': Math.max(0, Number(body.bufferAfterMin) || 0),
    'Min varsel (t)': Math.max(0, Number(body.noticeHours) || 2),
    'Bokningsfönster (dagar)': Math.min(120, Math.max(1, Number(body.windowDays) || 28)),
    'Veckodagar (JSON)': JSON.stringify(weekdays),
    Arbetsstart: firstIv ? firstIv.start : dayStart,
    Arbetsslut: firstIv ? firstIv.end : dayEnd,
    'Schema (JSON)': JSON.stringify(serializeSchedule(schedule)),
    Standardagenda: String(body.defaultAgenda || '').trim(),
    'Påminnelse 1h': body.reminder1h === false || body.reminder1h === 'Nej' || body.reminder1h === 0 || body.reminder1h === '0'
      ? 'Nej'
      : 'Ja',
    Ikon: String(body.icon || 'bolt').trim() || 'bolt',
    Färg: String(body.color || '#13505c').trim() || '#13505c',
    Synlig: visible,
    Uppdaterad: nowIso
  };
}

async function listLinks({ token, baseId, tableId, byraId, hostEmail }) {
  const parts = [`{Byrå ID}='${escapeFormula(byraId)}'`];
  if (hostEmail) parts.push(`{Host e-post}='${escapeFormula(hostEmail)}'`);
  const formula = parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
  const records = [];
  let offset;
  do {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { filterByFormula: formula, pageSize: 100, ...(offset ? { offset } : {}) },
      timeout: 20000
    });
    records.push(...(res.data?.records || []));
    offset = res.data?.offset;
  } while (offset);
  return records.map(recordToLink).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return String(a.title).localeCompare(String(b.title), 'sv');
  });
}

async function findBySlug({ token, baseId, tableId, slug, byraId }) {
  const parts = [`{Slug}='${escapeFormula(slug)}'`];
  if (byraId) parts.push(`{Byrå ID}='${escapeFormula(byraId)}'`);
  const formula = parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
  const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { filterByFormula: formula, maxRecords: 1 },
    timeout: 15000
  });
  const rec = (res.data?.records || [])[0];
  return rec ? recordToLink(rec) : null;
}

async function getLink({ token, baseId, tableId, id }) {
  const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return recordToLink(res.data);
}

async function createLink({ token, baseId, tableId, fields }) {
  const withCreated = { ...fields, Skapad: fields.Skapad || new Date().toISOString() };
  const res = await axios.post(
    `https://api.airtable.com/v0/${baseId}/${tableId}`,
    { fields: withCreated },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return recordToLink(res.data);
}

async function updateLink({ token, baseId, tableId, id, fields }) {
  const res = await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${id}`,
    { fields },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return recordToLink(res.data);
}

async function deleteLink({ token, baseId, tableId, id }) {
  await axios.delete(`https://api.airtable.com/v0/${baseId}/${tableId}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return { ok: true };
}

function createMoteslankar(deps) {
  const {
    authenticateToken,
    getAirtableUser,
    listBusyForHost,
    createBookingFromLink,
    findShareByToken,
    createShareRecord,
    listBookedBusyForHost
  } = deps;

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
    let tableId = await getTableId(token, baseId);
    if (!tableId) {
      try {
        const ensured = await ensureTableAndFields({ token, baseId });
        tableId = ensured.tableId;
      } catch (err) {
        res.status(503).json({
          error: 'Tabellen Möteslänk saknas',
          needsSetup: true,
          detail: err.message
        });
        return null;
      }
    }
    return { token, baseId, tableId };
  }

  async function buildAvailability(link, { from, to, durationMin }) {
    const duration = Number(durationMin) || link.durations[0] || 30;
    if (!link.durations.includes(duration) && link.durations.length) {
      // tillåt närmaste
    }
    const now = new Date();
    const fromIso = String(from || '').slice(0, 10)
      || now.toISOString().slice(0, 10);
    let toIso = String(to || '').slice(0, 10);
    if (!toIso) {
      const end = new Date(now.getTime() + link.windowDays * 86400000);
      toIso = end.toISOString().slice(0, 10);
    }

    let busy = [];
    try {
      if (typeof listBusyForHost === 'function') {
        const gBusy = await listBusyForHost(link.hostEmail, fromIso, toIso);
        busy = busy.concat(gBusy || []);
      }
    } catch (err) {
      console.warn('möteslänk google busy:', err.message);
    }
    try {
      if (typeof listBookedBusyForHost === 'function') {
        const bBusy = await listBookedBusyForHost(link.hostEmail, fromIso, toIso);
        busy = busy.concat(bBusy || []);
      }
    } catch (err) {
      console.warn('möteslänk booked busy:', err.message);
    }

    return Availability.generateSlots({
      rangeStartIso: fromIso,
      rangeEndIso: toIso,
      durationMin: duration,
      schedule: link.schedule,
      weekdays: link.weekdays,
      dayStart: link.dayStart,
      dayEnd: link.dayEnd,
      bufferBeforeMin: link.bufferBeforeMin,
      bufferAfterMin: link.bufferAfterMin,
      noticeHours: link.noticeHours,
      busy,
      now
    });
  }

  function registerRoutes(app) {
    app.post('/api/setup/airtable-moteslankar', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const token = airtableToken();
        const baseId = airtableBaseId();
        if (!token) return res.status(500).json({ error: 'AIRTABLE_ACCESS_TOKEN saknas' });
        const result = await ensureTableAndFields({ token, baseId });
        return res.json({ success: true, ...result });
      } catch (err) {
        console.error('setup moteslankar:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/motesbokning/links', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const mine = String(req.query.mine || '') === '1';
        const links = await listLinks({
          ...ctx,
          byraId: String(user.byraId || '').trim(),
          hostEmail: mine ? user.email : ''
        });
        const withUrls = links.map((l) => ({
          ...l,
          url: linkPublicUrl(l.slug, req)
        }));
        return res.json({ links: withUrls });
      } catch (err) {
        console.error('list moteslankar:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message, needsSetup: /saknas|UNKNOWN/i.test(err.message) });
      }
    });

    app.post('/api/motesbokning/links', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const byraId = String(user.byraId || '').trim();
        const fields = bodyToFields(req.body || {}, {
          byraId,
          hostEmail: user.email
        });
        // Unik slug inom byrå
        let slug = fields.Slug;
        let n = 0;
        while (await findBySlug({ ...ctx, slug, byraId })) {
          n += 1;
          slug = `${fields.Slug}-${n}`;
          fields.Slug = slug;
          if (n > 20) break;
        }
        const link = await createLink({ ...ctx, fields });
        return res.status(201).json({ link: { ...link, url: linkPublicUrl(link.slug, req) } });
      } catch (err) {
        console.error('create moteslank:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    app.patch('/api/motesbokning/links/:id', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const existing = await getLink({ ...ctx, id: req.params.id });
        if (!existing || existing.byraId !== String(user.byraId || '').trim()) {
          return res.status(404).json({ error: 'Länken hittades inte' });
        }
        const fields = bodyToFields(req.body || {}, {
          byraId: existing.byraId,
          hostEmail: existing.hostEmail || user.email,
          existingSlug: existing.slug
        });
        delete fields.Skapad;
        const link = await updateLink({ ...ctx, id: existing.id, fields });
        return res.json({ link: { ...link, url: linkPublicUrl(link.slug, req) } });
      } catch (err) {
        console.error('patch moteslank:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    app.delete('/api/motesbokning/links/:id', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const existing = await getLink({ ...ctx, id: req.params.id });
        if (!existing || existing.byraId !== String(user.byraId || '').trim()) {
          return res.status(404).json({ error: 'Länken hittades inte' });
        }
        await deleteLink({ ...ctx, id: existing.id });
        return res.json({ ok: true });
      } catch (err) {
        console.error('delete moteslank:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    /** Lediga luckor för en länk (för att välja förslag i Anpassa inbjudan). */
    app.get('/api/motesbokning/links/:id/availability', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const link = await getLink({ ...ctx, id: req.params.id });
        if (!link || link.byraId !== String(user.byraId || '').trim()) {
          return res.status(404).json({ error: 'Länken hittades inte' });
        }
        const duration = Number(req.query.duration) || link.durations[0] || 30;
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        const slots = await buildAvailability(link, { from, to, durationMin: duration });
        const byDay = {};
        for (const s of slots) {
          if (!byDay[s.date]) byDay[s.date] = [];
          byDay[s.date].push(s);
        }
        return res.json({
          duration,
          days: Object.keys(byDay).sort(),
          slotsByDay: byDay,
          slots
        });
      } catch (err) {
        console.error('link availability:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    /** Anpassa inbjudan: delningslänk med agenda och valfria tidsförslag. */
    app.post('/api/motesbokning/links/:id/share', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const link = await getLink({ ...ctx, id: req.params.id });
        if (!link || link.byraId !== String(user.byraId || '').trim()) {
          return res.status(404).json({ error: 'Länken hittades inte' });
        }
        if (typeof createShareRecord !== 'function') {
          return res.status(503).json({ error: 'Delning är inte konfigurerad' });
        }
        const agenda = String(req.body?.agenda || link.defaultAgenda || '').trim();
        const suggestedSlots = Array.isArray(req.body?.suggestedSlots)
          ? req.body.suggestedSlots
          : [];
        const onlySuggested = req.body?.onlySuggested === true || req.body?.onlySuggested === '1';
        const share = await createShareRecord({
          link,
          hostEmail: user.email,
          byraId: link.byraId,
          agenda,
          customerId: String(req.body?.customerId || '').trim(),
          customerName: String(req.body?.customerName || '').trim(),
          token: newShareToken(),
          suggestedSlots,
          onlySuggested
        });
        return res.status(201).json({
          share,
          url: sharePublicUrl(share.token, req)
        });
      } catch (err) {
        console.error('share moteslank:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/motesbokning/public/link/:slug', async (req, res) => {
      try {
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const slug = String(req.params.slug || '').trim();
        const link = await findBySlug({ ...ctx, slug, byraId: '' });
        if (!link || !link.visible) {
          return res.status(404).json({ error: 'Möteslänken hittades inte' });
        }
        const duration = Number(req.query.duration) || link.durations[0];
        const from = String(req.query.from || '').slice(0, 10);
        const to = String(req.query.to || '').slice(0, 10);
        const slots = await buildAvailability(link, { from, to, durationMin: duration });
        // Gruppera per dag för UI
        const byDay = {};
        for (const s of slots) {
          if (!byDay[s.date]) byDay[s.date] = [];
          byDay[s.date].push(s);
        }
        return res.json({
          link: {
            title: link.title,
            slug: link.slug,
            description: link.description,
            durations: link.durations,
            locations: link.locations,
            priority: link.priority,
            hostEmail: link.hostEmail,
            icon: link.icon,
            color: link.color,
            defaultAgenda: link.defaultAgenda
          },
          duration,
          days: Object.keys(byDay).sort(),
          slotsByDay: byDay,
          slots
        });
      } catch (err) {
        console.error('public link:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/motesbokning/public/share/:token', async (req, res) => {
      try {
        if (typeof findShareByToken !== 'function') {
          return res.status(503).json({ error: 'Delning är inte konfigurerad' });
        }
        const share = await findShareByToken(String(req.params.token || '').trim());
        if (!share || share.status !== 'Öppen') {
          return res.status(404).json({ error: 'Delningslänken är ogiltig eller redan använd' });
        }
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const link = share.linkId
          ? await getLink({ ...ctx, id: share.linkId })
          : await findBySlug({ ...ctx, slug: share.linkSlug, byraId: share.byraId });
        if (!link) return res.status(404).json({ error: 'Möteslänken saknas' });

        const duration = Number(req.query.duration) || link.durations[0];
        let slots = await buildAvailability(link, {
          from: String(req.query.from || '').slice(0, 10),
          to: String(req.query.to || '').slice(0, 10),
          durationMin: duration
        });
        const suggested = Array.isArray(share.suggestedSlots) ? share.suggestedSlots : [];
        const suggestedKeys = new Set(
          suggested.map((s) => `${s.start}|${s.end}`)
        );
        if (share.onlySuggested && suggested.length) {
          // Bara föreslagna som fortfarande är lediga
          slots = slots.filter((s) =>
            suggestedKeys.has(`${s.start}|${s.end}`) ||
            suggested.some((sug) => Math.abs(Date.parse(sug.start) - Date.parse(s.start)) < 60000)
          );
        }
        const byDay = {};
        for (const s of slots) {
          const preferred = suggestedKeys.has(`${s.start}|${s.end}`) ||
            suggested.some((sug) => Math.abs(Date.parse(sug.start) - Date.parse(s.start)) < 60000);
          const row = { ...s, preferred };
          if (!byDay[row.date]) byDay[row.date] = [];
          byDay[row.date].push(row);
        }
        return res.json({
          share: {
            token: share.token,
            agenda: share.agenda || '',
            customerName: share.customerName || '',
            onlySuggested: !!share.onlySuggested,
            suggestedSlots: suggested
          },
          link: {
            title: link.title,
            slug: link.slug,
            description: link.description,
            durations: link.durations,
            locations: link.locations,
            hostEmail: link.hostEmail,
            icon: link.icon,
            color: link.color
          },
          duration,
          days: Object.keys(byDay).sort(),
          slotsByDay: byDay,
          slots: Object.values(byDay).flat()
        });
      } catch (err) {
        console.error('public share:', err.response?.data || err.message);
        return res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/motesbokning/public/link/:slug/book', async (req, res) => {
      try {
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const link = await findBySlug({ ...ctx, slug: String(req.params.slug || '').trim(), byraId: '' });
        if (!link || !link.visible) {
          return res.status(404).json({ error: 'Möteslänken hittades inte' });
        }
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim();
        const start = String(body.start || '').trim();
        const end = String(body.end || '').trim();
        const locationId = String(body.locationId || '').trim();
        const bookerAgenda = String(body.agenda || body.note || '').trim();
        if (!name) return res.status(400).json({ error: 'Namn krävs' });
        if (!start || !end) return res.status(400).json({ error: 'Tid krävs' });

        const loc = link.locations.find((l) => l.id === locationId) || link.locations[0];
        const hostAgenda = String(body.hostAgenda || link.defaultAgenda || '').trim();
        const agendaParts = [];
        if (hostAgenda) agendaParts.push(hostAgenda);
        if (bookerAgenda && bookerAgenda !== hostAgenda) agendaParts.push(bookerAgenda);
        const agenda = agendaParts.join('\n\n');

        // Verifiera att luckan fortfarande är ledig
        const day = start.slice(0, 10);
        const slots = await buildAvailability(link, {
          from: day,
          to: day,
          durationMin: Math.round((Date.parse(end) - Date.parse(start)) / 60000)
        });
        const ok = slots.some((s) => s.start === start || Math.abs(Date.parse(s.start) - Date.parse(start)) < 60000);
        if (!ok) {
          return res.status(409).json({ error: 'Tiden är inte längre ledig. Välj en annan lucka.' });
        }

        if (typeof createBookingFromLink !== 'function') {
          return res.status(503).json({ error: 'Bokning är inte konfigurerad' });
        }

        const invite = await createBookingFromLink({
          link,
          start,
          end,
          bookerName: name,
          bookerEmail: email,
          agenda,
          location: loc
            ? (loc.type === 'meet' ? 'Google Meet' : loc.value || loc.label)
            : '',
          meetingType: loc?.type === 'phone' ? 'Telefon' : loc?.type === 'place' ? 'På plats' : 'Distans',
          shareToken: String(body.shareToken || '').trim()
        });

        const { bookingManageUrl } = require('./motesbokning');
        return res.status(201).json({
          ok: true,
          invite: {
            id: invite.id,
            title: invite.title,
            bookedStart: invite.bookedStart,
            bookedEnd: invite.bookedEnd,
            bookerName: invite.bookerName,
            location: invite.location,
            token: invite.token
          },
          manageUrl: invite.token ? bookingManageUrl(invite.token, req) : ''
        });
      } catch (err) {
        const atErr = err.response?.data?.error;
        const detail = (atErr && (atErr.message || atErr.type)) || err.message;
        console.error('public book link:', err.response?.data || err.message);
        const status = err.response?.status === 422 ? 422 : err.response?.status || 500;
        return res.status(status >= 400 && status < 600 ? status : 500).json({
          error: status === 422
            ? `Kunde inte spara bokningen (${detail}). Prova igen eller kontakta byrån.`
            : (detail || 'Kunde inte boka')
        });
      }
    });
  }

  return {
    TABLE_NAME,
    PRIORITY_LABELS,
    ensureTableAndFields,
    registerRoutes,
    slugify,
    linkPublicUrl,
    sharePublicUrl,
    recordToLink,
    Availability
  };
}

module.exports = {
  createMoteslankar,
  Availability,
  PRIORITY_LABELS,
  slugify
};
