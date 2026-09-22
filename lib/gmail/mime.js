'use strict';

/**
 * Bygger Gmail raw MIME (base64url) med UTF-8 och valfria inline-bilder (cid).
 *
 * Ämne och display-namn i From/To måste vara ASCII eller RFC 2047-kodade;
 * rå UTF-8 i Subject ger mojibake (å/ä/ö → Ã¶ m.m.) hos mottagare.
 */

function isAscii(str) {
  return /^[\x00-\x7F]*$/.test(String(str ?? ''));
}

/**
 * RFC 2047 encoded-word (UTF-8 / Base64). Delar upp långa värden så varje
 * encoded-word håller sig under 75 tecken, utan att klippa mitt i en UTF-8-sekvens.
 */
function encodeRfc2047(str) {
  const s = String(str ?? '');
  if (!s || isAscii(s)) return s;
  // =?UTF-8?B?<b64>?=  → overhead 12; max b64 ≈ 60 (45 råa bytes)
  const maxBytes = 45;
  const parts = [];
  let buf = Buffer.alloc(0);
  for (const ch of s) {
    const next = Buffer.from(ch, 'utf8');
    if (buf.length && buf.length + next.length > maxBytes) {
      parts.push(`=?UTF-8?B?${buf.toString('base64')}?=`);
      buf = next;
    } else {
      buf = Buffer.concat([buf, next]);
    }
  }
  if (buf.length) {
    parts.push(`=?UTF-8?B?${buf.toString('base64')}?=`);
  }
  return parts.join(' ');
}

/**
 * Kodar Subject (hela värdet) enligt RFC 2047 vid icke-ASCII.
 */
function encodeSubject(subject) {
  return encodeRfc2047(String(subject ?? ''));
}

/**
 * Kodar From/To: display-namn med åäö blir RFC 2047; e-postadressen lämnas orörd.
 * Stödjer `Name <a@b.c>`, `"Name" <a@b.c>` och bara `a@b.c`.
 */
function encodeAddressHeader(value) {
  const s = String(value ?? '').trim();
  if (!s || isAscii(s)) return s;
  const m = s.match(/^(?:"([^"]*)"|([^<]*?))\s*<([^>]+)>\s*$/);
  if (m) {
    const name = (m[1] != null ? m[1] : m[2] || '').trim();
    const email = m[3].trim();
    if (!name) return email;
    if (isAscii(name)) {
      return /[\s,<>();:\\"]/.test(name) ? `"${name}" <${email}>` : `${name} <${email}>`;
    }
    return `${encodeRfc2047(name)} <${email}>`;
  }
  return encodeRfc2047(s);
}

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
  lines.push(`From: ${encodeAddressHeader(from)}`);
  lines.push(`To: ${encodeAddressHeader(to)}`);
  lines.push(`Subject: ${encodeSubject(subject)}`);
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

module.exports = {
  buildRawMime,
  encodeRfc2047,
  encodeSubject,
  encodeAddressHeader,
  isAscii
};
