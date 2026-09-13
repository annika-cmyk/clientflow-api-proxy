/**
 * Snapshot av ett mejl som sparas till Dokumentation / Uppdrag / Uppdragskörning.
 * Nya sparningar är HTML; äldre .txt-dumpar parsas bakåtkompatibelt.
 */
'use strict';

const SNAPSHOT_MARKER = 'clientflow-email-snapshot';
const HEADER_LABELS = ['Ämne', 'Från', 'Till', 'Kopia', 'Datum', 'Gmail-id'];

function safeFilename(name, fallback = 'fil') {
  const raw = String(name || fallback)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return raw || fallback;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tillåt enkel mejl-HTML i body (inga script/iframe/on*-handlers). */
function sanitizeEmailBodyHtml(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed[\s\S]*?>/gi, '');
  s = s.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '');
  s = s.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  s = s.replace(/javascript:/gi, '');
  return s.trim();
}

function looksLikeEmailSnapshotFilename(filename) {
  const name = String(filename || '').toLowerCase();
  if (!name) return false;
  // Deadline-prefix från körning: "2028-06-15 - 2026-09-11_Ämne.html"
  const base = name.replace(/^\d{4}-\d{2}-\d{2}\s+-\s+/, '');
  if (/\.html?$/.test(base) && (base.includes('_') || /mejl/.test(base))) return true;
  if (/\.txt$/.test(base) && /^\d{4}-\d{2}-\d{2}_/.test(base)) return true;
  if (/\.txt$/.test(base) && /mejl/.test(base)) return true;
  return false;
}

function looksLikeEmailSnapshotText(text) {
  const t = String(text || '').replace(/^\uFEFF/, '').trimStart();
  if (!t) return false;
  if (t.includes(`data-${SNAPSHOT_MARKER}`) || t.includes(`id="${SNAPSHOT_MARKER}"`)) return true;
  // Legacy plain-text dump
  return /^Ämne:\s/m.test(t) && /^Från:\s/m.test(t) && (/\n---\n/.test(t) || /^Datum:\s/m.test(t));
}

function parseEmailSnapshotText(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  const headers = {};
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '---') {
      i += 1;
      break;
    }
    if (!line.trim()) {
      if (headers.subject != null) {
        while (i < lines.length && lines[i].trim() === '') i += 1;
        if (i < lines.length && lines[i].trim() === '---') i += 1;
        break;
      }
      continue;
    }
    const m = line.match(/^(Ämne|Från|Till|Kopia|Datum|Gmail-id):\s?(.*)$/);
    if (!m) {
      if (Object.keys(headers).length) break;
      continue;
    }
    const keyMap = {
      Ämne: 'subject',
      Från: 'from',
      Till: 'to',
      Kopia: 'cc',
      Datum: 'date',
      'Gmail-id': 'id'
    };
    headers[keyMap[m[1]]] = m[2] || '';
  }
  const body = lines.slice(i).join('\n').replace(/^\n+/, '');
  return {
    subject: headers.subject || '',
    from: headers.from || '',
    to: headers.to || '',
    cc: headers.cc || '',
    date: headers.date || '',
    id: headers.id || '',
    bodyText: body,
    bodyHtml: ''
  };
}

function messagePlainBody(message) {
  return (
    message.text ||
    message.bodyText ||
    stripHtml(message.html || message.bodyHtml || '') ||
    message.snippet ||
    ''
  );
}

function messageHtmlBody(message) {
  const html = message.html || message.bodyHtml || '';
  if (html && String(html).trim()) return sanitizeEmailBodyHtml(html);
  const plain = messagePlainBody(message);
  if (!plain) return '';
  return `<pre class="cf-email-plain">${escapeHtml(plain)}</pre>`;
}

function buildEmailSnapshotFilename(message) {
  const subj = safeFilename(message.subject || 'mejl', 'mejl').replace(/\s+/g, '_');
  const datePart = (message.date || '').slice(0, 10).replace(/[^\d-]/g, '') || 'datum';
  return `${datePart}_${subj}.html`;
}

function buildEmailSnapshotText(message) {
  return [
    `Ämne: ${message.subject || ''}`,
    `Från: ${message.from || ''}`,
    `Till: ${message.to || ''}`,
    `Kopia: ${message.cc || ''}`,
    `Datum: ${message.date || ''}`,
    `Gmail-id: ${message.id || ''}`,
    '',
    '---',
    '',
    messagePlainBody(message)
  ].join('\n');
}

function buildEmailSnapshotHtml(message) {
  const subject = String(message.subject || '(utan ämne)');
  const from = String(message.from || '');
  const to = String(message.to || '');
  const cc = String(message.cc || '');
  const date = String(message.date || '');
  const id = String(message.id || '');
  const body = messageHtmlBody(message);

  const metaRows = [
    ['Från', from],
    ['Till', to],
    cc ? ['Kopia', cc] : null,
    ['Datum', date]
  ]
    .filter(Boolean)
    .map(
      ([label, value]) =>
        `<div class="cf-email-meta-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
<meta name="${SNAPSHOT_MARKER}" content="1">
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: #f1f5f9;
    color: #0f172a;
    line-height: 1.5;
  }
  .cf-email-wrap {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.25rem 1rem 2rem;
  }
  .cf-email-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .cf-email-header {
    padding: 1.1rem 1.25rem 1rem;
    border-bottom: 1px solid #e2e8f0;
    background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
  }
  .cf-email-subject {
    margin: 0 0 0.85rem;
    font-size: 1.25rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: #0f172a;
  }
  .cf-email-meta { margin: 0; display: grid; gap: 0.35rem; }
  .cf-email-meta-row { display: grid; grid-template-columns: 4.5rem 1fr; gap: 0.5rem; font-size: 0.9rem; }
  .cf-email-meta-row dt { margin: 0; color: #64748b; font-weight: 600; }
  .cf-email-meta-row dd { margin: 0; color: #334155; word-break: break-word; }
  .cf-email-body {
    padding: 1.15rem 1.25rem 1.35rem;
    font-size: 0.95rem;
    color: #334155;
  }
  .cf-email-body img { max-width: 100%; height: auto; }
  .cf-email-plain {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: inherit;
  }
  .cf-email-footer {
    margin-top: 0.75rem;
    padding: 0 0.25rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }
</style>
</head>
<body>
  <div class="cf-email-wrap" id="${SNAPSHOT_MARKER}" data-${SNAPSHOT_MARKER}="1">
    <article class="cf-email-card">
      <header class="cf-email-header">
        <h1 class="cf-email-subject">${escapeHtml(subject)}</h1>
        <dl class="cf-email-meta">
          ${metaRows}
        </dl>
      </header>
      <div class="cf-email-body">
        ${body || '<p><em>(Tomt mejl)</em></p>'}
      </div>
    </article>
    ${id ? `<p class="cf-email-footer">Gmail-id: ${escapeHtml(id)}</p>` : ''}
  </div>
</body>
</html>`;
}

/**
 * Renderar legacy .txt-snapshot till samma layout som HTML-sparningar.
 * Används i dokumentförhandsvisning.
 */
function renderEmailSnapshotPreviewHtml(parsed) {
  const subject = parsed.subject || '(utan ämne)';
  const rows = [
    ['Från', parsed.from],
    ['Till', parsed.to],
    parsed.cc ? ['Kopia', parsed.cc] : null,
    ['Datum', parsed.date]
  ]
    .filter(Boolean)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(
      ([label, value]) =>
        `<div class="document-email-meta-row"><span class="document-email-meta-label">${escapeHtml(label)}</span><span class="document-email-meta-value">${escapeHtml(value)}</span></div>`
    )
    .join('');

  const bodyHtml = parsed.bodyHtml
    ? sanitizeEmailBodyHtml(parsed.bodyHtml)
    : `<pre class="document-email-plain">${escapeHtml(parsed.bodyText || '')}</pre>`;

  return `<article class="document-email-snapshot" data-${SNAPSHOT_MARKER}="1">
  <header class="document-email-header">
    <h4 class="document-email-subject">${escapeHtml(subject)}</h4>
    <div class="document-email-meta">${rows}</div>
  </header>
  <div class="document-email-body">${bodyHtml || '<p class="section-desc">(Tomt mejl)</p>'}</div>
</article>`;
}

module.exports = {
  SNAPSHOT_MARKER,
  HEADER_LABELS,
  safeFilename,
  escapeHtml,
  stripHtml,
  sanitizeEmailBodyHtml,
  looksLikeEmailSnapshotFilename,
  looksLikeEmailSnapshotText,
  parseEmailSnapshotText,
  buildEmailSnapshotFilename,
  buildEmailSnapshotText,
  buildEmailSnapshotHtml,
  renderEmailSnapshotPreviewHtml,
  messagePlainBody,
  messageHtmlBody
};
