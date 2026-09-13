/**
 * Sammanfattning av Mejlarkiv Saved To → destinationer för UI / API.
 */

function normalizeSaveType(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'korning' || t === 'run' || t === 'uppdragskorning') return 'korning';
  if (t === 'uppdrag') return 'uppdrag';
  if (t === 'dokumentation' || t === 'docs' || t === 'kund' || t === 'customer') return 'dokumentation';
  return t || 'dokumentation';
}

function destinationLabel(type) {
  if (type === 'korning') return 'Uppdragskörning';
  if (type === 'uppdrag') return 'Uppdrag';
  return 'Dokumentation';
}

function destinationHref({ type, customerId }) {
  const id = String(customerId || '').trim();
  if (!id) return '';
  const base = 'kundkort.html?id=' + encodeURIComponent(id);
  if (type === 'dokumentation') return base + '#dokumentation';
  if (type === 'uppdrag' || type === 'korning') return base + '#uppdrag';
  return base;
}

function isAttachmentEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !!(entry.gmailAttachmentId || entry.attachmentId);
}

function pickName(...candidates) {
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return null;
}

/**
 * Group Saved To rows into destinations with email/attachment flags and kundkort hrefs.
 * @param {Array<object>} savedTo
 * @param {{ customerId?: string }} [opts]
 */
function summarizeSavedTo(savedTo, opts = {}) {
  const fallbackCustomerId = String(opts.customerId || '').trim();
  const entries = Array.isArray(savedTo) ? savedTo : [];
  const byKey = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const type = normalizeSaveType(entry.type);
    const customerId = String(entry.customerId || fallbackCustomerId || '').trim();
    const uppdragId = String(entry.uppdragId || '').trim() || null;
    const runId = String(entry.runId || '').trim() || null;
    const uppdragName = pickName(entry.uppdragName, entry.uppdragLabel, entry.uppdragTyp);
    const runName = pickName(entry.runName, entry.runLabel, entry.periodLabel, entry['Period Label']);
    const key = [type, customerId, uppdragId || '', runId || ''].join('|');

    let dest = byKey.get(key);
    if (!dest) {
      dest = {
        type,
        label: destinationLabel(type),
        customerId,
        uppdragId,
        runId,
        uppdragName,
        runName,
        href: destinationHref({ type, customerId }),
        emailSaved: false,
        emailFilenames: [],
        attachments: [],
        saveCount: 0,
        lastAt: null
      };
      byKey.set(key, dest);
    }

    dest.saveCount += 1;
    if (entry.at && (!dest.lastAt || String(entry.at) > String(dest.lastAt))) {
      dest.lastAt = entry.at;
    }
    if (uppdragName) dest.uppdragName = uppdragName;
    if (runName) dest.runName = runName;

    const filename = String(entry.filename || '').trim();
    if (isAttachmentEntry(entry)) {
      if (filename && !dest.attachments.includes(filename)) dest.attachments.push(filename);
    } else {
      dest.emailSaved = true;
      if (filename && !dest.emailFilenames.includes(filename)) dest.emailFilenames.push(filename);
    }
  }

  const destinations = [...byKey.values()];
  const attachmentFilenames = [];
  let emailSaveCount = 0;
  let attachmentSaveCount = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (isAttachmentEntry(entry)) {
      attachmentSaveCount += 1;
      const filename = String(entry.filename || '').trim();
      if (filename && !attachmentFilenames.includes(filename)) attachmentFilenames.push(filename);
    } else {
      emailSaveCount += 1;
    }
  }

  return {
    hasSaves: destinations.length > 0,
    destinations,
    emailSaveCount,
    attachmentSaveCount,
    attachmentFilenames,
    totalSaves: entries.length
  };
}

/**
 * Compare message attachments against Saved To / attachmentMeta.
 * @param {Array<{attachmentId?: string, filename?: string}>} messageAttachments
 * @param {Array<object>} savedTo
 * @param {Array<object>} [attachmentMeta]
 */
function attachmentSaveStatus(messageAttachments, savedTo, attachmentMeta) {
  const atts = Array.isArray(messageAttachments) ? messageAttachments : [];
  const savedIds = new Set();
  const savedNames = new Set();

  for (const entry of Array.isArray(savedTo) ? savedTo : []) {
    if (!isAttachmentEntry(entry)) continue;
    const id = String(entry.gmailAttachmentId || entry.attachmentId || '').trim();
    if (id) savedIds.add(id);
    const name = String(entry.filename || '').trim().toLowerCase();
    if (name) savedNames.add(name);
  }
  for (const meta of Array.isArray(attachmentMeta) ? attachmentMeta : []) {
    const id = String((meta && (meta.gmailAttachmentId || meta.attachmentId)) || '').trim();
    if (id) savedIds.add(id);
    const name = String((meta && meta.filename) || '')
      .trim()
      .toLowerCase();
    if (name) savedNames.add(name);
  }

  return atts.map((a) => {
    const id = String((a && a.attachmentId) || '').trim();
    const filename = String((a && a.filename) || '').trim();
    const saved =
      (id && savedIds.has(id)) ||
      (filename && savedNames.has(filename.toLowerCase()));
    return {
      attachmentId: id || null,
      filename: filename || null,
      saved: !!saved
    };
  });
}

module.exports = {
  normalizeSaveType,
  destinationLabel,
  destinationHref,
  isAttachmentEntry,
  summarizeSavedTo,
  attachmentSaveStatus
};
