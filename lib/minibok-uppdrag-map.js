/**
 * Rena mappers för uppdrag-boardrader (inga Airtable-anrop).
 */

function safeJson(raw, fallback) {
  try {
    const v = raw ? JSON.parse(String(raw)) : fallback;
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function toDateStr(iso) {
  const s = String(iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function runStatusFromHistory(fields, periodKey) {
  const pk = String(periodKey || '').trim();
  if (!pk) return '';
  const hist = safeJson((fields?.Historik || '').toString().trim(), []);
  if (!Array.isArray(hist)) return '';
  const hit = hist.find((it) => it && String(it.periodKey || '').trim() === pk);
  return hit ? String(hit.status || '').trim() : '';
}

function historyForPeriod(fields, periodKey) {
  const pk = String(periodKey || '').trim();
  const hist = safeJson((fields?.Historik || '').toString().trim(), []);
  if (!Array.isArray(hist)) return [];
  if (!pk) return hist;
  return hist.filter((it) => it && String(it.periodKey || '').trim() === pk);
}

function parseRiskAtgarderValda(raw) {
  const text = (raw || '').toString().trim();
  const parsed = safeJson(text, null);
  if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean);
  return text ? text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

function parseLinkedUserIds(raw) {
  if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter(Boolean);
  return String(raw || '').split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^rec[A-Za-z0-9]+$/.test(s));
}

function noteFromUppdrag(fields, periodKey) {
  const f = fields || {};
  const periodHits = historyForPeriod(f, periodKey);
  const histNote = periodHits.map((h) => String((h && h.note) || '').trim()).find(Boolean);
  return String(
    histNote ||
    f['Anteckning för denna körning'] ||
    f.Anteckning ||
    ''
  ).trim();
}

function airtableCellName(val) {
  if (val === undefined || val === null || val === '') return '';
  if (Array.isArray(val)) return val.map(airtableCellName).filter(Boolean).join(', ');
  if (typeof val === 'object') {
    return String(val.name || val.Name || val.fullName || val.id || '').trim();
  }
  return String(val).trim();
}

function historyNotes(fields) {
  const hist = safeJson((fields?.Historik || '').toString().trim(), []);
  if (!Array.isArray(hist)) return [];
  return hist.filter((h) => h && String(h.note || '').trim()).slice(0, 8).map((h) => ({
    periodKey: String(h.periodKey || '').trim(),
    doneAt: String(h.doneAt || '').slice(0, 10),
    status: String(h.status || '').trim(),
    note: String(h.note || '').trim(),
  }));
}

function mapUppdragBoardRow(instance) {
  const x = instance || {};
  const f = (x.record && x.record.fields) || {};
  const runStatus = runStatusFromHistory(f, x.periodKey) || 'Planerad';
  const kundKlient = airtableCellName(f._klientansvarigKund);
  return {
    uppdragId: x.record && x.record.id,
    customerId: String(f['Kund ID'] || '').trim(),
    customerName: String(f.Kundnamn || '').trim(),
    orgNr: String(f.Orgnr || '').trim(),
    typ: x.typ,
    frekvens: String(f.Frekvens || '').trim(),
    ansvarig: airtableCellName(f.Ansvarig),
    klientansvarig: airtableCellName(f.Klientansvarig) || kundKlient,
    behoriga: Array.isArray(f._behoriga) ? f._behoriga.slice() : [],
    rutin: String(f.Rutin || '').trim(),
    anteckning: noteFromUppdrag(f, x.periodKey),
    anteckningHistorik: historyNotes(f),
    periodKey: x.periodKey,
    periodLabel: x.periodLabel || '',
    deadline: x.deadline,
    startDate: x.startDate || '',
    boardMonth: x.month,
    status: runStatus,
    done: runStatus === 'Klar',
    senastUtford: toDateStr(f['Senast utförd'] || ''),
    nastaDeadline: toDateStr(f['Nästa deadline'] || ''),
    uppdragStatus: String(f.Status || 'Aktiv').trim(),
    riskAtgarderAktiverade: !!f['Riskåtgärder aktiverade'],
    riskAtgarderValda: parseRiskAtgarderValda(f['Riskåtgärder valda']),
  };
}

module.exports = {
  mapUppdragBoardRow,
  noteFromUppdrag,
  parseRiskAtgarderValda,
  parseLinkedUserIds,
  historyNotes,
};
