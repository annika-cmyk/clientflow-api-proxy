'use strict';

const axios = require('axios');
const { extractFirefliesIdFromNotes } = require('./note');

const NOTES_TABLE = 'tblXswCwopx7l02Mu';

function airtableBaseId() {
  return process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
}

function airtableToken() {
  return process.env.AIRTABLE_ACCESS_TOKEN;
}

function escAirtable(value) {
  return String(value || '').replace(/'/g, "\\'");
}

/**
 * Hitta befintlig mötesanteckning med samma Fireflies-id (idempotens / uppdatering).
 */
async function findNoteByFirefliesId(firefliesId, byraId) {
  const id = String(firefliesId || '').trim();
  const token = airtableToken();
  if (!id || !token) return null;

  const needle = `Fireflies-id: ${id}`;
  const parts = [`FIND('${escAirtable(needle)}', {Notes})`];
  if (byraId) {
    parts.push(`{Byrå ID}='${escAirtable(String(byraId).trim())}'`);
  }
  const formula = parts.length > 1 ? `AND(${parts.join(',')})` : parts[0];
  const url = `https://api.airtable.com/v0/${airtableBaseId()}/${NOTES_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=5`;
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    const records = res.data.records || [];
    return (
      records.find((r) => extractFirefliesIdFromNotes(r.fields && r.fields.Notes) === id) ||
      records[0] ||
      null
    );
  } catch (err) {
    console.warn('fireflies findNoteByFirefliesId:', err.response?.data?.error?.message || err.message);
    return null;
  }
}

function toAirtableFields(notePayload, user) {
  const p = notePayload || {};
  const fields = {
    'Typ av anteckning': Array.isArray(p.typAvAnteckning)
      ? p.typAvAnteckning
      : p.typAvAnteckning
        ? [p.typAvAnteckning]
        : ['Mötesanteckningar'],
    Datum: p.datum || new Date().toISOString().slice(0, 10),
    Notes: p.notes || ''
  };
  if (p.byraId) fields['Byrå ID'] = String(p.byraId).trim();
  if (p.orgnr) fields.Orgnr = String(p.orgnr).trim();
  if (p.foretagsnamn) fields['Företagsnamn'] = String(p.foretagsnamn).trim();
  if (p.person) fields.Person = String(p.person).trim();
  else if (user && user.name) fields.Person = String(user.name).trim();

  if (user && user.name) fields.Name = String(user.name).trim();
  if (user && user.id) {
    const uid = parseInt(user.id, 10);
    if (!Number.isNaN(uid)) fields.UserID = uid;
  }

  for (let i = 1; i <= 8; i += 1) {
    const todo = p[`ToDo${i}`];
    const status = p[`Status${i}`];
    if (todo && String(todo).trim()) fields[`ToDo${i}`] = String(todo).trim();
    if (status && String(status).trim()) fields[`Status${i}`] = String(status).trim();
  }

  const cleaned = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v) && !v.length) continue;
    cleaned[k] = v;
  }
  return cleaned;
}

async function createNote(notePayload, user) {
  const token = airtableToken();
  if (!token) {
    const err = new Error('AIRTABLE_ACCESS_TOKEN saknas');
    err.code = 'AIRTABLE_CONFIG';
    throw err;
  }
  const fields = toAirtableFields(notePayload, user);
  const url = `https://api.airtable.com/v0/${airtableBaseId()}/${NOTES_TABLE}`;
  const res = await axios.post(
    url,
    { fields },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return res.data;
}

async function updateNote(recordId, notePayload, user) {
  const token = airtableToken();
  const id = String(recordId || '').trim();
  if (!token || !id) {
    const err = new Error('Saknar token eller recordId');
    err.code = 'AIRTABLE_CONFIG';
    throw err;
  }
  const fields = toAirtableFields(notePayload, user);
  const url = `https://api.airtable.com/v0/${airtableBaseId()}/${NOTES_TABLE}/${encodeURIComponent(id)}`;
  const res = await axios.patch(
    url,
    { fields },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );
  return res.data;
}

async function upsertFirefliesNote(notePayload, user, firefliesId) {
  const existing = await findNoteByFirefliesId(firefliesId, notePayload && notePayload.byraId);
  if (existing && existing.id) {
    const updated = await updateNote(existing.id, notePayload, user);
    return { record: updated, created: false };
  }
  const created = await createNote(notePayload, user);
  return { record: created, created: true };
}

module.exports = {
  NOTES_TABLE,
  findNoteByFirefliesId,
  toAirtableFields,
  createNote,
  updateNote,
  upsertFirefliesNote
};
