'use strict';

/**
 * Bygg mötesanteckningstext + ToDo från Fireflies-transcript.
 */

function asLines(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v == null ? '' : v).trim())
      .filter(Boolean);
  }
  const s = String(value).trim();
  if (!s) return [];
  // Fireflies action_items kan vara en sträng med bullets/newlines
  return s
    .split(/\r?\n|•|\u2022|(?:^|\s)[-*]\s+/)
    .map((x) => x.replace(/^[\s\-•*\d.]+/, '').trim())
    .filter(Boolean);
}

function formatMeetingDate(raw) {
  if (raw == null || raw === '') return new Date().toISOString().slice(0, 10);
  // Fireflies date is often ms epoch
  const n = Number(raw);
  if (Number.isFinite(n) && n > 1e11) {
    return new Date(n).toISOString().slice(0, 10);
  }
  if (Number.isFinite(n) && n > 1e9) {
    return new Date(n * 1000).toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function buildNoteBody(transcript, opts = {}) {
  const t = transcript || {};
  const summary = t.summary || {};
  const title = String(t.title || 'Möte').trim() || 'Möte';
  const date = formatMeetingDate(t.date);
  const overview =
    String(summary.overview || summary.short_summary || '').trim() ||
    String(opts.fallbackOverview || '').trim();
  const bullets = asLines(summary.shorthand_bullet);
  const actions = asLines(summary.action_items);
  const url = String(t.transcript_url || '').trim();
  const id = String(t.id || opts.meetingId || '').trim();

  const parts = [`Möte: ${title}`, `Datum: ${date}`];
  if (opts.matchedEmail) {
    parts.push(`Matchad deltagare: ${opts.matchedEmail}`);
  }
  parts.push('');
  if (overview) {
    parts.push('Sammanfattning');
    parts.push(overview);
    parts.push('');
  }
  if (bullets.length) {
    parts.push('Punkter');
    bullets.slice(0, 20).forEach((b) => parts.push(`• ${b}`));
    parts.push('');
  }
  if (actions.length) {
    parts.push('Åtgärder');
    actions.slice(0, 12).forEach((a) => parts.push(`• ${a}`));
    parts.push('');
  }
  if (url) parts.push(`Fireflies: ${url}`);
  if (id) parts.push(`Fireflies-id: ${id}`);
  return parts.join('\n').trim();
}

function buildTodosFromActions(transcript) {
  const actions = asLines(transcript && transcript.summary && transcript.summary.action_items);
  const out = {};
  actions.slice(0, 8).forEach((text, i) => {
    out[`ToDo${i + 1}`] = text.slice(0, 500);
    out[`Status${i + 1}`] = 'Ej påbörjad';
  });
  return out;
}

/**
 * @returns {{ typAvAnteckning: string[], datum: string, notes: string, foretagsnamn: string, byraId: string, orgnr: string, person: string, ToDo1?: string, ... }}
 */
function buildNotePayload(transcript, customer, user, opts = {}) {
  const todos = buildTodosFromActions(transcript);
  return {
    typAvAnteckning: ['Mötesanteckningar'],
    datum: formatMeetingDate(transcript && transcript.date),
    notes: buildNoteBody(transcript, {
      meetingId: opts.meetingId,
      matchedEmail: opts.matchedEmail
    }),
    foretagsnamn: String((customer && (customer.namn || customer.name)) || '').trim(),
    byraId: String((user && user.byraId) || (opts && opts.byraId) || '').trim(),
    orgnr: String((customer && customer.orgnr) || '').trim(),
    person: String((user && user.name) || '').trim(),
    ...todos
  };
}

function extractFirefliesIdFromNotes(notes) {
  const m = String(notes || '').match(/Fireflies-id:\s*([A-Za-z0-9_-]+)/i);
  return m ? m[1] : '';
}

module.exports = {
  asLines,
  formatMeetingDate,
  buildNoteBody,
  buildTodosFromActions,
  buildNotePayload,
  extractFirefliesIdFromNotes
};
