/**
 * Host-initierad mötesinbjudan från kalendern (fast tid + mottagare).
 * Bygger Airtable-fält för en redan bokad Mötesbokning-post.
 */
const crypto = require('crypto');

const STATUS_BOOKED = 'Bokad';
const SLOT_BOOKED = 'Bokad';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeMeetingType(raw) {
  const t = String(raw || '').trim();
  if (t === 'På plats' || t === 'Telefon' || t === 'Distans') return t;
  return 'Distans';
}

function defaultLocationForType(meetingType, location) {
  const loc = String(location || '').trim();
  if (loc) return loc;
  if (meetingType === 'På plats') return 'På plats';
  if (meetingType === 'Telefon') return 'Telefon';
  return 'Google Meet';
}

/**
 * Validera och normalisera payload från kalender-UI / API.
 * @throws {Error} med .code = 'VALIDATION' vid ogiltig input
 */
function parseScheduleInviteInput(body = {}) {
  const bookerEmail = String(body.bookerEmail || body.email || '').trim().toLowerCase();
  const bookerName = String(body.bookerName || body.name || '').trim();
  const startRaw = String(body.start || body.bookedStart || '').trim();
  const endRaw = String(body.end || body.bookedEnd || '').trim();
  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);

  if (!bookerEmail || !EMAIL_RE.test(bookerEmail)) {
    const err = new Error('Giltig mottagar-e-post krävs');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!bookerName) {
    const err = new Error('Mottagarens namn krävs');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(endMs > startMs)) {
    const err = new Error('Ogiltig start/slut');
    err.code = 'VALIDATION';
    throw err;
  }

  const meetingType = normalizeMeetingType(body.meetingType);
  const title = String(body.title || 'Möte').trim() || 'Möte';
  const note = String(body.note || body.agenda || body.message || '').trim();
  const location = defaultLocationForType(meetingType, body.location);
  const bookerPhone = String(body.bookerPhone || '').trim().slice(0, 60);
  const hostPhone = String(body.hostPhone || '').trim().slice(0, 60);
  const customerId = String(body.customerId || '').trim();
  const customerName = String(body.customerName || bookerName).trim();

  return {
    bookerEmail,
    bookerName: bookerName.slice(0, 200),
    bookerPhone,
    hostPhone,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    meetingType,
    title: title.slice(0, 200),
    note: note.slice(0, 5000),
    location: location.slice(0, 1024),
    customerId,
    customerName: customerName.slice(0, 200)
  };
}

/**
 * Airtable-fält för en bokad inbjudan skapad från kalendern.
 */
function buildScheduleInviteFields(input, { byraId, hostEmail } = {}) {
  const parsed = input && input.start && input.bookerEmail
    ? input
    : parseScheduleInviteInput(input);
  const slotId = `slot-${Date.parse(parsed.start).toString(36)}`;
  const slots = [{
    id: slotId,
    start: parsed.start,
    end: parsed.end,
    status: SLOT_BOOKED
  }];
  const token = newToken();
  const fields = {
    'Byrå ID': String(byraId || '').trim(),
    'Kund ID': parsed.customerId,
    Kundnamn: parsed.customerName,
    Titel: parsed.title,
    Meddelande: '',
    Plats: parsed.location,
    Mötestyp: parsed.meetingType,
    Token: token,
    Status: STATUS_BOOKED,
    Luckor: JSON.stringify(slots),
    'Bokare namn': parsed.bookerName,
    'Bokare e-post': parsed.bookerEmail,
    Anteckning: parsed.note,
    'Bokad lucka-id': slotId,
    'Bokad start': parsed.start,
    'Bokad slut': parsed.end,
    Källa: 'Inbjudan',
    Skapad: new Date().toISOString(),
    'Skapad av': String(hostEmail || '').trim()
  };
  if (parsed.bookerPhone) fields['Bokare telefon'] = parsed.bookerPhone;
  if (parsed.hostPhone) fields['Värd telefon'] = parsed.hostPhone;
  return { fields, token, slotId, parsed };
}

/** True när Distans/Meet ska skapas på Google-händelsen. */
function shouldCreateMeet(meetingType, location) {
  const type = String(meetingType || '').trim();
  if (type === 'På plats' || type === 'Telefon') return false;
  if (type === 'Distans') return true;
  const loc = String(location || '');
  return /google\s*meet|distans|meet\.google/i.test(loc);
}

module.exports = {
  EMAIL_RE,
  STATUS_BOOKED,
  normalizeMeetingType,
  defaultLocationForType,
  parseScheduleInviteInput,
  buildScheduleInviteFields,
  shouldCreateMeet
};
