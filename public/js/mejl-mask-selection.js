/**
 * Browser: mask-selection matching (speglar lib/gmail/mask-selection.js).
 */
(function (global) {
  function htmlToPlainText(s) {
    if (global.HtmlPlainText && typeof global.HtmlPlainText.htmlToPlainText === 'function') {
      return global.HtmlPlainText.htmlToPlainText(s);
    }
    if (s == null || s === '') return '';
    var t = String(s);
    var looksLikeHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(t) || /&(?:nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(t);
    if (!looksLikeHtml) return t;
    t = t.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    t = t.replace(/<\s*\/\s*(p|div|tr|h[1-6]|section|article|ul|ol)\s*>/gi, '\n');
    t = t.replace(/<\s*(p|div|tr|h[1-6]|section|article)(\s[^>]*)?>/gi, '\n');
    t = t.replace(/<\s*li(\s[^>]*)?>/gi, '\n• ');
    t = t.replace(/<\s*\/\s*li\s*>/gi, '');
    t = t.replace(/<[^>]+>/g, '');
    t = t
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, function (_, n) {
        var code = Number(n);
        return Number.isFinite(code) ? String.fromCharCode(code) : '';
      })
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) {
        var code = parseInt(h, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : '';
      });
    t = t.replace(/\u00a0/g, ' ');
    t = t.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
    t = t.replace(/[ \t]{2,}/g, ' ');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  function normalizeWsChar(ch) {
    if (!ch) return '';
    if (/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]/.test(ch)) return ' ';
    if (ch === '\u00ad') return '';
    return ch;
  }

  function buildNormalizedIndex(str) {
    var s = String(str || '');
    var chars = [];
    var map = [];
    var i = 0;
    while (i < s.length) {
      var n = normalizeWsChar(s[i]);
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
    return { norm: chars.join(''), map: map, original: s };
  }

  function findNormalizedRange(haystack, needle) {
    var src = String(haystack || '');
    var sel = String(needle || '');
    if (!sel.trim()) return null;
    var exact = src.indexOf(sel);
    if (exact >= 0) return { start: exact, end: exact + sel.length };
    var hay = buildNormalizedIndex(src);
    var ned = buildNormalizedIndex(sel);
    if (!ned.norm || !hay.norm) return null;
    var at = hay.norm.indexOf(ned.norm);
    if (at < 0) return null;
    var start = hay.map[at];
    var last = at + ned.norm.length - 1;
    if (start == null || hay.map[last] == null) return null;
    return { start: start, end: hay.map[last] + 1 };
  }

  function decodeHtmlEntity(ent) {
    var lower = ent.toLowerCase();
    if (lower === '&nbsp;') return ' ';
    if (lower === '&amp;') return '&';
    if (lower === '&lt;') return '<';
    if (lower === '&gt;') return '>';
    if (lower === '&quot;') return '"';
    if (lower === '&apos;' || lower === '&#39;') return "'";
    var dec = /^&#(\d+);$/.exec(ent);
    if (dec) {
      var code = Number(dec[1]);
      return Number.isFinite(code) ? String.fromCharCode(code) : null;
    }
    var hex = /^&#x([0-9a-f]+);$/i.exec(ent);
    if (hex) {
      var code2 = parseInt(hex[1], 16);
      return Number.isFinite(code2) ? String.fromCharCode(code2) : null;
    }
    return null;
  }

  function buildHtmlTextMap(html) {
    var src = String(html || '');
    var textChars = [];
    var spans = [];
    var i = 0;
    while (i < src.length) {
      if (src[i] === '<') {
        var close = src.indexOf('>', i);
        if (close < 0) break;
        var tag = src.slice(i, close + 1);
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
        var semi = src.indexOf(';', i);
        if (semi > i && semi - i < 12) {
          var ent = src.slice(i, semi + 1);
          var decoded = decodeHtmlEntity(ent);
          if (decoded != null) {
            for (var c = 0; c < decoded.length; c += 1) {
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
    return { text: textChars.join(''), spans: spans, html: src };
  }

  function findNormalizedRangeInHtml(html, needle) {
    var mapped = buildHtmlTextMap(html);
    if (!mapped.text.trim()) return null;
    var range = findNormalizedRange(mapped.text, needle);
    if (!range) return null;
    var startSpan = mapped.spans[range.start];
    var endSpan = mapped.spans[Math.min(range.end, mapped.spans.length) - 1];
    if (!startSpan || !endSpan) return null;
    return { start: startSpan.start, end: endSpan.end };
  }

  function resolveMaskRanges(opts) {
    var selectedText = String((opts && opts.selectedText) || '');
    if (!selectedText.trim()) {
      return { ranges: [], bodyText: '', error: 'empty' };
    }

    var plainText = String((opts && opts.plainText) || '');
    var html = String((opts && opts.html) || '');
    var displayedText = String((opts && opts.displayedText) || '');
    var fromHtml = html ? htmlToPlainText(html) : '';

    var bodyText = plainText;
    if (!bodyText.trim()) bodyText = fromHtml || displayedText || '';

    var textCandidates = [];
    if (bodyText) textCandidates.push(bodyText);
    if (displayedText && displayedText !== bodyText) textCandidates.push(displayedText);
    if (fromHtml && fromHtml !== bodyText && fromHtml !== displayedText) textCandidates.push(fromHtml);

    var textRange = null;
    var matchedSource = bodyText;
    for (var ci = 0; ci < textCandidates.length; ci += 1) {
      var found = findNormalizedRange(textCandidates[ci], selectedText);
      if (found) {
        textRange = found;
        matchedSource = textCandidates[ci];
        break;
      }
    }

    if (textRange && matchedSource !== bodyText && bodyText) {
      var slice = matchedSource.slice(textRange.start, textRange.end);
      var mapped = findNormalizedRange(bodyText, slice) || findNormalizedRange(bodyText, selectedText);
      if (mapped) {
        textRange = mapped;
        matchedSource = bodyText;
      } else if (!plainText.trim() && matchedSource === fromHtml) {
        bodyText = fromHtml;
      }
    } else if (textRange && matchedSource !== bodyText && !bodyText.trim()) {
      bodyText = matchedSource;
    }

    var ranges = [];
    if (textRange) {
      ranges.push({ start: textRange.start, end: textRange.end, field: 'text' });
    }

    if (html) {
      var htmlRange = findNormalizedRangeInHtml(html, selectedText);
      if (htmlRange) {
        ranges.push({ start: htmlRange.start, end: htmlRange.end, field: 'html' });
      }
    }

    if (!ranges.length) {
      return { ranges: [], bodyText: bodyText, error: 'not_found' };
    }

    return { ranges: ranges, bodyText: bodyText };
  }

  global.MejlMaskSelection = {
    findNormalizedRange: findNormalizedRange,
    findNormalizedRangeInHtml: findNormalizedRangeInHtml,
    resolveMaskRanges: resolveMaskRanges
  };
})(typeof window !== 'undefined' ? window : globalThis);
