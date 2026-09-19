/**
 * Stabil djuplänk till ett mejl (mejl.html + Gmail message id).
 * Samma format som MejlTaskLink.mejlReplyUrl utan reply=1.
 * Sparas som text, inte Airtable-url, så relativa länkar går att öppna.
 */
'use strict';

const MEJL_LINK_RE =
  /(?:https?:\/\/[^\s<>"']+)?\/?mejl\.html\?messageId=[A-Za-z0-9%_.~-]+/;

function mejlDeepLink(messageId) {
  const mid = String(messageId || '').trim();
  if (!mid || mid.startsWith('shared:')) return '';
  return 'mejl.html?messageId=' + encodeURIComponent(mid);
}

function extractMejlLink(text) {
  const m = String(text || '').match(MEJL_LINK_RE);
  return m ? m[0] : '';
}

/** Lägg länken på egen rad, utan att skriva över befintlig text. */
function appendMejlLink(text, url) {
  const body = String(text || '').trim();
  const link = String(url || '').trim();
  if (!link) return body;
  if (extractMejlLink(body) === link || body.includes(link)) return body;
  return body ? body + '\n\n' + link : link;
}

/** Ta bort en ensam rad som bara är länken, så ämnet kan visas för sig. */
function stripMejlLinkLine(text, url) {
  const link = String(url || extractMejlLink(text) || '').trim();
  if (!link) return String(text || '').trim();
  return String(text || '')
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      const found = extractMejlLink(t);
      if (!found) return true;
      return t !== found && t !== '/' + found.replace(/^\//, '');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  MEJL_LINK_RE,
  mejlDeepLink,
  extractMejlLink,
  appendMejlLink,
  stripMejlLinkLine
};
