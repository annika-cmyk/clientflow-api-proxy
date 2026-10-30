'use strict';

const { normalizeEmail, extractCustomerEmails } = require('../gmail/customers');
const { scoreEmailMatch, THRESHOLDS } = require('../gmail/match');

/**
 * Samla deltagar-e-post från Fireflies-transcript.
 * @returns {string[]}
 */
function collectParticipantEmails(transcript) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const e = normalizeEmail(raw);
    if (!e || !e.includes('@') || seen.has(e)) return;
    seen.add(e);
    out.push(e);
  };

  const t = transcript || {};
  add(t.organizer_email);

  const participants = t.participants;
  if (Array.isArray(participants)) {
    participants.forEach(add);
  } else if (typeof participants === 'string' && participants.trim()) {
    participants.split(/[,;\s]+/).forEach(add);
  }

  const attendees = Array.isArray(t.meeting_attendees) ? t.meeting_attendees : [];
  attendees.forEach((a) => add(a && a.email));

  return out;
}

/**
 * Hitta unik kund via exakt e-postmatch bland deltagare.
 * Exkluderar organizer + ignoreEmails (byråns egna adresser).
 *
 * @param {object} opts
 * @param {object} opts.transcript
 * @param {Array<{id:string,namn?:string,orgnr?:string,emails?:string[],email?:string,fields?:object}>} opts.customers
 * @param {string[]} [opts.ignoreEmails]
 * @returns {{ customer: object, matchedEmail: string } | null}
 */
function matchCustomerFromTranscript(opts) {
  const transcript = (opts && opts.transcript) || {};
  const customers = Array.isArray(opts && opts.customers) ? opts.customers : [];
  const ignore = new Set(
    (Array.isArray(opts && opts.ignoreEmails) ? opts.ignoreEmails : [])
      .map(normalizeEmail)
      .filter(Boolean)
  );
  const organizer = normalizeEmail(transcript.organizer_email);
  if (organizer) ignore.add(organizer);

  const participantEmails = collectParticipantEmails(transcript).filter((e) => !ignore.has(e));
  if (!participantEmails.length || !customers.length) return null;

  const hits = [];
  for (const customer of customers) {
    if (!customer || !customer.id) continue;
    let emails = Array.isArray(customer.emails) ? customer.emails.slice() : [];
    if (customer.email) emails.push(customer.email);
    if (customer.fields) {
      emails = emails.concat(extractCustomerEmails(customer.fields));
    }
    const mapped = {
      id: customer.id,
      namn: customer.namn,
      orgnr: customer.orgnr,
      emails: [...new Set(emails.map(normalizeEmail).filter(Boolean))]
    };
    const score = scoreEmailMatch(participantEmails, mapped);
    if (score >= THRESHOLDS.EMAIL_EXACT) {
      const custSet = new Set(mapped.emails);
      const matchedEmail = participantEmails.find((e) => custSet.has(e)) || '';
      hits.push({ customer: { ...customer, ...mapped }, matchedEmail, score });
    }
  }

  if (!hits.length) return null;
  // Unik kund — flera träffar på olika kunder = osäkert
  const uniqueIds = [...new Set(hits.map((h) => h.customer.id))];
  if (uniqueIds.length !== 1) return null;
  return { customer: hits[0].customer, matchedEmail: hits[0].matchedEmail };
}

module.exports = {
  collectParticipantEmails,
  matchCustomerFromTranscript
};
