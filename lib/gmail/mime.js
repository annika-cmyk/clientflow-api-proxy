'use strict';

/**
 * Bygger Gmail raw MIME (base64url) med UTF-8, valfria inline-bilder (cid)
 * och vanliga bilagor (Content-Disposition: attachment).
 *
 * Ämne och display-namn i From/To måste vara ASCII eller RFC 2047-kodade;
 * rå UTF-8 i Subject ger mojibake (å/ä/ö → Ã¶ m.m.) hos mottagare.
 */

const MAX_ATTACHMENTS = 10;
/** Gmail tillåter ~25 MB totalt; lämna utrymme för body/sidfot. */
const MAX_ATTACHMENT_BYTES_EACH = 15 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES_TOTAL = 20 * 1024 * 1024;

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

function sanitizeFilename(name) {
  const cleaned = String(name || 'fil')
    .replace(/[\r\n\0]/g, '')
    .replace(/["\\]/g, '_')
    .trim();
  return cleaned || 'fil';
}

/**
 * Content-Disposition för bilaga. ASCII: filename="…".
 * Icke-ASCII: ASCII-fallback + RFC 2231 filename*=UTF-8''…
 */
function encodeContentDispositionFilename(filename) {
  const safe = sanitizeFilename(filename);
  if (isAscii(safe)) {
    return `attachment; filename="${safe}"`;
  }
  const asciiFallback = safe.replace(/[^\x20-\x7E]/g, '_').slice(0, 80) || 'fil';
  const star = encodeURIComponent(safe).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${star}`;
}

function encodeBase64Body(content) {
  return Buffer.from(String(content || ''), 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');
}

function wrapBase64Lines(b64) {
  return String(b64 || '')
    .replace(/\s+/g, '')
    .replace(/(.{76})/g, '$1\r\n');
}

/**
 * Normaliserar och validerar bilagor från API/klient.
 * Accepterar { filename|name, mimeType|contentType, contentBase64|dataBase64 }.
 * @returns {{ filename: string, contentType: string, dataBase64: string, byteLength: number }[]}
 */
function normalizeAttachments(rawList) {
  if (!Array.isArray(rawList) || !rawList.length) return [];
  if (rawList.length > MAX_ATTACHMENTS) {
    const err = new Error(`Högst ${MAX_ATTACHMENTS} bilagor per mejl`);
    err.code = 'ATTACHMENTS_TOO_MANY';
    throw err;
  }
  const out = [];
  let totalBytes = 0;
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const filename = sanitizeFilename(item.filename || item.name);
    const contentType = String(item.contentType || item.mimeType || 'application/octet-stream')
      .split(';')[0]
      .trim() || 'application/octet-stream';
    const dataBase64 = String(item.contentBase64 || item.dataBase64 || '').replace(/\s+/g, '');
    if (!dataBase64) continue;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
      const err = new Error(`Ogiltig bilaga: ${filename}`);
      err.code = 'ATTACHMENT_INVALID';
      throw err;
    }
    const byteLength = Buffer.byteLength(dataBase64, 'base64');
    if (byteLength <= 0) continue;
    if (byteLength > MAX_ATTACHMENT_BYTES_EACH) {
      const err = new Error(`Bilagan «${filename}» är för stor (max 15 MB)`);
      err.code = 'ATTACHMENT_TOO_LARGE';
      throw err;
    }
    totalBytes += byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
      const err = new Error('Bilagorna är för stora tillsammans (max 20 MB)');
      err.code = 'ATTACHMENTS_TOO_LARGE';
      throw err;
    }
    out.push({ filename, contentType, dataBase64, byteLength });
  }
  return out;
}

function buildRawMime({ from, to, subject, text, html, inReplyTo, references, inlineImages, attachments }) {
  const images = Array.isArray(inlineImages)
    ? inlineImages.filter((img) => img && img.cid && img.dataBase64)
    : [];
  const files = normalizeAttachments(attachments);
  const hasHtml = !!String(html || '').trim();
  const altBoundary = `cf_alt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const relBoundary = `cf_rel_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const mixedBoundary = `cf_mix_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  function pushUtf8Part(lines, contentType, content) {
    lines.push(`Content-Type: ${contentType}; charset="UTF-8"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(encodeBase64Body(content));
  }

  function buildBodyPartLines() {
    const lines = [];
    if (!hasHtml) {
      pushUtf8Part(lines, 'text/plain', text || '');
      return lines;
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
        const b64 = wrapBase64Lines(img.dataBase64);
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
    return lines;
  }

  const headerLines = [];
  headerLines.push(`From: ${encodeAddressHeader(from)}`);
  headerLines.push(`To: ${encodeAddressHeader(to)}`);
  headerLines.push(`Subject: ${encodeSubject(subject)}`);
  headerLines.push('MIME-Version: 1.0');
  if (inReplyTo) headerLines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headerLines.push(`References: ${references}`);

  let bodyLines;
  if (!files.length) {
    // Bakåtkompatibel struktur utan multipart/mixed
    if (!hasHtml) {
      bodyLines = [];
      pushUtf8Part(bodyLines, 'text/plain', text || '');
    } else {
      bodyLines = buildBodyPartLines();
    }
  } else {
    bodyLines = [];
    bodyLines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
    bodyLines.push('');
    bodyLines.push(`--${mixedBoundary}`);
    bodyLines.push(...buildBodyPartLines());
    for (const file of files) {
      bodyLines.push(`--${mixedBoundary}`);
      bodyLines.push(`Content-Type: ${file.contentType}; name="${sanitizeFilename(file.filename).replace(/"/g, '')}"`);
      bodyLines.push('Content-Transfer-Encoding: base64');
      bodyLines.push(`Content-Disposition: ${encodeContentDispositionFilename(file.filename)}`);
      bodyLines.push('');
      bodyLines.push(wrapBase64Lines(file.dataBase64));
    }
    bodyLines.push(`--${mixedBoundary}--`);
  }

  const raw = [...headerLines, ...bodyLines].join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

module.exports = {
  buildRawMime,
  normalizeAttachments,
  encodeContentDispositionFilename,
  encodeRfc2047,
  encodeSubject,
  encodeAddressHeader,
  isAscii,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES_EACH,
  MAX_ATTACHMENT_BYTES_TOTAL
};
