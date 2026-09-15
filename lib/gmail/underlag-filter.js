/**
 * Filtrera bort mejl vars mottagare är underlag@… (t.ex. underlag@rydenredovisning.se).
 * Sådana mejl hör till underlagsflödet, inte den vanliga mejl-inkorgen.
 */
const match = require('./match');

function collectRecipientEmails(message) {
  const headers = [
    (message && message.to) || '',
    (message && message.cc) || '',
    (message && message.deliveredTo) || '',
    (message && message['delivered-to']) || ''
  ];
  const out = new Set();
  for (const h of headers) {
    for (const email of match.extractEmailsFromAddressHeader(h)) {
      out.add(String(email || '').trim().toLowerCase());
    }
  }
  return [...out];
}

function isUnderlagEmail(email) {
  const e = String(email || '')
    .trim()
    .toLowerCase();
  if (!e) return false;
  // underlag@domain — lokaldelen måste vara exakt "underlag"
  return /^underlag@/.test(e);
}

function isUnderlagRecipientMessage(message) {
  return collectRecipientEmails(message).some(isUnderlagEmail);
}

module.exports = {
  collectRecipientEmails,
  isUnderlagEmail,
  isUnderlagRecipientMessage
};
