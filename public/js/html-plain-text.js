(function (global) {
  function htmlToPlainText(s) {
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

  global.HtmlPlainText = { htmlToPlainText: htmlToPlainText };
})(typeof window !== 'undefined' ? window : globalThis);
