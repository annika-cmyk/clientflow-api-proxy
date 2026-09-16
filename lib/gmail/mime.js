'use strict';

/**
 * Bygger Gmail raw MIME (base64url) med UTF-8 och valfria inline-bilder (cid).
 */
function buildRawMime({ from, to, subject, text, html, inReplyTo, references, inlineImages }) {
  const images = Array.isArray(inlineImages)
    ? inlineImages.filter((img) => img && img.cid && img.dataBase64)
    : [];
  const hasHtml = !!String(html || '').trim();
  const altBoundary = `cf_alt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const relBoundary = `cf_rel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  function encodeBase64Body(content) {
    return Buffer.from(String(content || ''), 'utf8')
      .toString('base64')
      .replace(/(.{76})/g, '$1\r\n');
  }

  function pushUtf8Part(lines, contentType, content) {
    lines.push(`Content-Type: ${contentType}; charset="UTF-8"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(encodeBase64Body(content));
  }

  const lines = [];
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Subject: ${subject}`);
  lines.push('MIME-Version: 1.0');
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);

  if (!hasHtml) {
    pushUtf8Part(lines, 'text/plain', text || '');
    const raw = lines.join('\r\n');
    return Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  const altParts = [];
  altParts.push(`--${altBoundary}`);
  pushUtf8Part(altParts, 'text/plain', text || '');
  altParts.push(`--${altBoundary}`);
  pushUtf8Part(altParts, 'text/html', html);
  altParts.push(`--${altBoundary}--`);

  if (images.length) {
    lines.push(`Content-Type: multipart/related; boundary="${relBoundary}"`);
    lines.push('');
    lines.push(`--${relBoundary}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
    lines.push(...altParts);
    images.forEach((img) => {
      const cid = String(img.cid).replace(/^<|>$/g, '');
      const ctype = String(img.contentType || 'application/octet-stream').split(';')[0].trim()
        || 'application/octet-stream';
      const b64 = String(img.dataBase64).replace(/\s+/g, '').replace(/(.{76})/g, '$1\r\n');
      lines.push(`--${relBoundary}`);
      lines.push(`Content-Type: ${ctype}`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-ID: <${cid}>`);
      lines.push(`Content-Disposition: inline; filename="${cid.replace(/[^a-z0-9._-]+/gi, '_')}"`);
      lines.push('');
      lines.push(b64);
    });
    lines.push(`--${relBoundary}--`);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    lines.push('');
    lines.push(...altParts);
  }

  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

module.exports = { buildRawMime };
