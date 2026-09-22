'use strict';

/**
 * Gmail-lik svensk citatrad och uppdelning av svar vs citerad historik.
 * Exempel: Den fre 4 sep. 2026 kl 11:18 skrev Maria Egonsdotter <maria@…>:
 */

const WEEKDAYS_SV = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const MONTHS_SV = [
  'jan.',
  'feb.',
  'mars',
  'apr.',
  'maj',
  'juni',
  'juli',
  'aug.',
  'sep.',
  'okt.',
  'nov.',
  'dec.'
];

const QUOTE_MARKER = '\n---\n';

function parseFromHeader(from) {
  const s = String(from || '').trim();
  if (!s) return { name: '', email: '' };
  const m = s.match(/^(?:"([^"]*)"|([^<]*?))\s*<([^>]+)>\s*$/);
  if (m) {
    return {
      name: (m[1] != null ? m[1] : m[2] || '').trim(),
      email: String(m[3] || '').trim()
    };
  }
  if (s.includes('@') && !/\s/.test(s)) return { name: '', email: s };
  return { name: s, email: '' };
}

function parseQuoteDate(dateInput) {
  if (dateInput == null || dateInput === '') return null;
  if (typeof dateInput === 'number' || /^\d+$/.test(String(dateInput).trim())) {
    const n = Number(dateInput);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(dateInput));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Delar (år, månad 1–12, dag, timme, minut, weekday 0=sön) i Europe/Stockholm. */
function stockholmParts(date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Stockholm',
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : '';
  };
  const weekdayEn = get('weekday').toLowerCase();
  const enToSv = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  };
  const weekday = enToSv[weekdayEn.slice(0, 3)] ?? date.getUTCDay();
  let hour = Number(get('hour'));
  // en-GB + hour12:false kan ge "24" för midnatt
  if (hour === 24) hour = 0;
  return {
    weekday,
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute'))
  };
}

function formatWho({ name, email }) {
  if (name && email) return `${name} <${email}>`;
  return name || email || '';
}

/**
 * @param {{ from?: string, date?: string|number|Date }} opts
 * @returns {string} t.ex. "Den fre 4 sep. 2026 kl 11:18 skrev Maria <a@b.c>:"
 */
function formatGmailAttributionSv(opts = {}) {
  const parsed = parseFromHeader(opts.from);
  const who = formatWho(parsed);
  if (!who) return '';
  const d =
    opts.date instanceof Date && !Number.isNaN(opts.date.getTime())
      ? opts.date
      : parseQuoteDate(opts.date);
  if (!d) return `skrev ${who}:`;
  const p = stockholmParts(d);
  const wd = WEEKDAYS_SV[p.weekday] || WEEKDAYS_SV[0];
  const mon = MONTHS_SV[(p.month || 1) - 1] || 'jan.';
  const mm = String(p.minute).padStart(2, '0');
  return `Den ${wd} ${p.day} ${mon} ${p.year} kl ${p.hour}:${mm} skrev ${who}:`;
}

/**
 * Dela compose-body på första raden som är exakt "---" (omgiven av newlines).
 * @returns {{ reply: string, quote: string, split: boolean }}
 */
function splitReplyAndQuote(rawBody) {
  const s = String(rawBody ?? '');
  const idx = s.indexOf(QUOTE_MARKER);
  if (idx === -1) {
    return { reply: s, quote: '', split: false };
  }
  return {
    reply: s.slice(0, idx),
    quote: s.slice(idx + QUOTE_MARKER.length),
    split: true
  };
}

/**
 * Normalisera svar + citat: explicit quotedText vinner, annars split på ---.
 */
function normalizeReplyQuoteParts({ publicText, quotedText } = {}) {
  const explicitQuote = String(quotedText ?? '').trim();
  if (explicitQuote) {
    return {
      reply: String(publicText ?? ''),
      quote: String(quotedText ?? ''),
      split: false
    };
  }
  const { reply, quote, split } = splitReplyAndQuote(publicText);
  return { reply, quote, split };
}

function quotePlainText(quotedText, attribution) {
  const quote = String(quotedText || '').replace(/\s+$/, '');
  if (!quote && !attribution) return '';
  const lines = [];
  if (attribution) lines.push(attribution);
  if (quote) {
    if (attribution) lines.push('');
    for (const line of quote.split('\n')) {
      lines.push(line ? `> ${line}` : '>');
    }
  }
  return lines.join('\n');
}

function quoteHtml(quotedText, attribution, { escapeHtml, textToHtmlParagraphs }) {
  const quote = String(quotedText || '').trim();
  if (!quote && !attribution) return '';
  const attr = attribution
    ? `<div style="margin:16px 0 8px 0;color:#374151;font-size:13px;line-height:1.45;">${escapeHtml(attribution)}</div>`
    : '';
  if (!quote) return attr;
  const inner = textToHtmlParagraphs(quote);
  return `${attr}<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex;color:#374151;">${inner}</blockquote>`;
}

module.exports = {
  WEEKDAYS_SV,
  MONTHS_SV,
  QUOTE_MARKER,
  parseFromHeader,
  parseQuoteDate,
  formatGmailAttributionSv,
  splitReplyAndQuote,
  normalizeReplyQuoteParts,
  quotePlainText,
  quoteHtml
};
