/**
 * Hitta maskeringsintervall för markerad mejltext.
 * Hanterar whitespace-/radbrytningsskillnader mellan HTML-vy och plain text.
 */
const { htmlToPlainText } = require('../html-plain-text');

function normalizeWsChar(ch) {
  if (!ch) return '';
  if (/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]/.test(ch)) return ' ';
  if (ch === '\u00ad') return '';
  return ch;
}

/**
 * Bygg whitespace-normaliserad sträng + karta till originalindex.
 * Flera whitespace → ett mellanslag. Leading/trailing trimmas.
 */
function buildNormalizedIndex(str) {
  // Behåll originalindex (ingen CRLF→LF först) så start/end träffar rätt i källan.
  const s = String(str || '');
  const chars = [];
  const map = [];
  let i = 0;
  while (i < s.length) {
    const n = normalizeWsChar(s[i]);
    if (n === '') {
      i += 1;
      continue;
    }
    if (n === ' ') {
      if (chars.length && chars[chars.length - 1] !== ' ') {
        chars.push(' ');
        map.push(i);
      }
      i += 1;
      while (i < s.length && normalizeWsChar(s[i]) === ' ') i += 1;
      continue;
    }
    chars.push(n);
    map.push(i);
    i += 1;
  }
  while (chars.length && chars[0] === ' ') {
    chars.shift();
    map.shift();
  }
  while (chars.length && chars[chars.length - 1] === ' ') {
    chars.pop();
    map.pop();
  }
  return { norm: chars.join(''), map, original: s };
}

/**
 * Hitta needle i haystack med exakt match först, annars whitespace-normaliserat.
 * Returnerar { start, end } (end exklusiv) i original-haystack, eller null.
 */
function findNormalizedRange(haystack, needle) {
  const src = String(haystack || '');
  const sel = String(needle || '');
  if (!sel.trim()) return null;

  const exact = src.indexOf(sel);
  if (exact >= 0) return { start: exact, end: exact + sel.length };

  const hay = buildNormalizedIndex(src);
  const ned = buildNormalizedIndex(sel);
  if (!ned.norm || !hay.norm) return null;
  const at = hay.norm.indexOf(ned.norm);
  if (at < 0) return null;
  const start = hay.map[at];
  const last = at + ned.norm.length - 1;
  if (start == null || hay.map[last] == null) return null;
  return { start, end: hay.map[last] + 1 };
}

function decodeHtmlEntity(ent) {
  const lower = ent.toLowerCase();
  if (lower === '&nbsp;') return ' ';
  if (lower === '&amp;') return '&';
  if (lower === '&lt;') return '<';
  if (lower === '&gt;') return '>';
  if (lower === '&quot;') return '"';
  if (lower === '&apos;' || lower === '&#39;') return "'";
  const dec = /^&#(\d+);$/.exec(ent);
  if (dec) {
    const code = Number(dec[1]);
    return Number.isFinite(code) ? String.fromCharCode(code) : null;
  }
  const hex = /^&#x([0-9a-f]+);$/i.exec(ent);
  if (hex) {
    const code = parseInt(hex[1], 16);
    return Number.isFinite(code) ? String.fromCharCode(code) : null;
  }
  return null;
}

/**
 * Bygg synlig text från HTML + karta textindex → HTML-intervall [htmlStart, htmlEnd).
 */
function buildHtmlTextMap(html) {
  const src = String(html || '');
  const textChars = [];
  /** @type {{ start: number, end: number }[]} */
  const spans = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === '<') {
      const close = src.indexOf('>', i);
      if (close < 0) break;
      const tag = src.slice(i, close + 1);
      if (
        /^<\s*br\s*\/?\s*>$/i.test(tag) ||
        /^<\s*\/\s*(p|div|tr|h[1-6]|li|section|article|ul|ol|table|blockquote)\s*>$/i.test(tag) ||
        /^<\s*(p|div|tr|h[1-6]|li|section|article|br)(\s[^>]*)?>$/i.test(tag)
      ) {
        textChars.push('\n');
        spans.push({ start: i, end: close + 1 });
      }
      i = close + 1;
      continue;
    }
    if (src[i] === '&') {
      const semi = src.indexOf(';', i);
      if (semi > i && semi - i < 12) {
        const ent = src.slice(i, semi + 1);
        const decoded = decodeHtmlEntity(ent);
        if (decoded != null) {
          for (let c = 0; c < decoded.length; c += 1) {
            textChars.push(decoded[c]);
            spans.push({ start: i, end: semi + 1 });
          }
          i = semi + 1;
          continue;
        }
      }
    }
    textChars.push(src[i]);
    spans.push({ start: i, end: i + 1 });
    i += 1;
  }
  return { text: textChars.join(''), spans, html: src };
}

/**
 * Hitta needle i HTML (via synlig text) och returnera HTML-källintervall.
 */
function findNormalizedRangeInHtml(html, needle) {
  const mapped = buildHtmlTextMap(html);
  if (!mapped.text.trim()) return null;
  const range = findNormalizedRange(mapped.text, needle);
  if (!range) return null;
  const startSpan = mapped.spans[range.start];
  const endSpan = mapped.spans[Math.min(range.end, mapped.spans.length) - 1];
  if (!startSpan || !endSpan) return null;
  return { start: startSpan.start, end: endSpan.end };
}

/**
 * Bestäm bodyText att maska mot + ranges för text/html.
 * @param {{ selectedText: string, plainText?: string, html?: string, displayedText?: string }} opts
 * @returns {{ ranges: Array<{start:number,end:number,field:string}>, bodyText: string, error?: string }}
 */
function resolveMaskRanges(opts) {
  const selectedText = String((opts && opts.selectedText) || '');
  if (!selectedText.trim()) {
    return { ranges: [], bodyText: '', error: 'empty' };
  }

  const plainText = String((opts && opts.plainText) || '');
  const html = String((opts && opts.html) || '');
  const displayedText = String((opts && opts.displayedText) || '');
  const fromHtml = html ? htmlToPlainText(html) : '';

  let bodyText = plainText;
  if (!bodyText.trim()) bodyText = fromHtml || displayedText || '';

  const textCandidates = [];
  if (bodyText) textCandidates.push(bodyText);
  if (displayedText && displayedText !== bodyText) textCandidates.push(displayedText);
  if (fromHtml && fromHtml !== bodyText && fromHtml !== displayedText) textCandidates.push(fromHtml);

  let textRange = null;
  let matchedSource = bodyText;
  for (const candidate of textCandidates) {
    const found = findNormalizedRange(candidate, selectedText);
    if (found) {
      textRange = found;
      matchedSource = candidate;
      break;
    }
  }

  if (textRange && matchedSource !== bodyText && bodyText) {
    const slice = matchedSource.slice(textRange.start, textRange.end);
    const mapped = findNormalizedRange(bodyText, slice) || findNormalizedRange(bodyText, selectedText);
    if (mapped) {
      textRange = mapped;
      matchedSource = bodyText;
    } else if (!plainText.trim() && matchedSource === fromHtml) {
      bodyText = fromHtml;
    }
  } else if (textRange && matchedSource !== bodyText && !bodyText.trim()) {
    bodyText = matchedSource;
  }

  const ranges = [];
  if (textRange) {
    ranges.push({ start: textRange.start, end: textRange.end, field: 'text' });
  }

  if (html) {
    const htmlRange = findNormalizedRangeInHtml(html, selectedText);
    if (htmlRange) {
      ranges.push({ start: htmlRange.start, end: htmlRange.end, field: 'html' });
    }
  }

  if (!ranges.length) {
    return { ranges: [], bodyText, error: 'not_found' };
  }

  return { ranges, bodyText };
}

module.exports = {
  buildNormalizedIndex,
  findNormalizedRange,
  findNormalizedRangeInHtml,
  buildHtmlTextMap,
  resolveMaskRanges,
  htmlToPlainText
};
