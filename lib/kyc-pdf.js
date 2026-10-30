/**
 * KYC-intygande PDF (A4, en kolumn) — layout enligt designskissen
 * "Kund · 4 PDF för signering". Kundvänlig: ingen riskinfo, inga byråinterna texter.
 */

const KycHuvudman = require('../public/js/kyc-huvudman');
const { htmlToPlainText } = require('./html-plain-text');
const PersonRegister = require('./person-register');

const ACCENT = '#13505c';
const INK = '#18212B';
const MUTED = '#4A5560';
const MUTED2 = '#3E4A55';
const LINE = '#E3E7EB';
const LINE_STRONG = '#C5CCD2';
const LINE_HEAD = '#A9B2BA';
const CHANGE_BG = '#F3F7F7';
const CHANGE_BORDER = '#C9DCDE';
const CHANGE_LINE = '#DCE6E7';
const CHANGE_HEAD = '#B8CBCD';

/** Fält som jämförs i «Ändringar sedan förra intygandet». */
const DIFF_FIELDS = [
  { key: 'foretagsnamn', label: 'Företagets namn' },
  { key: 'orgnr', label: 'Organisationsnummer' },
  { key: 'skatterattslig_hemvist_foretag', label: 'Skattskyldigt i' },
  { key: 'tjanster', label: 'Tjänster från byrån' },
  { key: 'syfte_affarsrelation', label: 'Syfte med affärsrelationen' },
  { key: 'verksamhet', label: 'Vad företaget gör' },
  { key: 'kostnader', label: 'Kostnader' },
  { key: 'intakterna', label: 'Intäkter' },
  { key: 'anstallda', label: 'Antal anställda' },
  { key: 'omsattning', label: 'Uppskattad årsomsättning' },
  { key: 'internationellHandel', label: 'Handel utanför Sverige' },
  { key: 'internationellaLander', label: 'Länder utanför Sverige' },
  { key: 'kapitalUrsprung', label: 'Pengarnas ursprung' },
  { key: 'kontanter', label: 'Hanterar kontanter' },
  { key: 'kontanterAndel', label: 'Andel kontanter' },
  { key: 'kryptovaluta', label: 'Transaktioner i kryptovaluta' },
  { key: 'pep', label: 'PEP' },
  { key: 'pepDetaljer', label: 'PEP-detaljer' },
  { key: 'pepFamilj', label: 'Familj/medarbetare till PEP' },
  { key: 'pepFamiljDetaljer', label: 'PEP-familj detaljer' },
  { key: 'vh_noterat_bolag', label: 'Börsnoterat eller ägt av börsnoterat bolag' },
  { key: 'vh_utlandska_agare', label: 'Utländska ägare eller styrelseledamöter' },
  { key: 'huvudmanAnnatSatt', label: 'Kontroll på annat sätt' },
  { key: 'personerSammanfattning', label: 'Personer och ägare' }
];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plain(s) {
  return htmlToPlainText(s == null ? '' : s);
}

function dash(s) {
  const t = String(s == null ? '' : s).trim();
  return t || '–';
}

function jaNej(v) {
  if (v === true || v === 'Ja' || v === 'ja') return 'Ja';
  if (v === false || v === 'Nej' || v === 'nej') return 'Nej';
  const t = String(v == null ? '' : v).trim();
  return t || '–';
}

function formatPct(v) {
  if (v == null || v === '') return '';
  const raw = String(v).replace(',', '.').replace(/%/g, '').trim();
  if (!raw) return '';
  const n = Number(raw);
  if (Number.isFinite(n)) {
    const pretty = Number.isInteger(n) ? String(n) : String(n);
    return `${pretty} %`;
  }
  return `${raw} %`;
}

function formatPersonnr(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12) return `${digits.slice(0, 8)}-${digits.slice(8)}`;
  if (digits.length === 10) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return String(raw || '').trim();
}

function formatDateTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const s = String(value).trim();
    return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s.slice(0, 10);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseKontaktPersoner(fields) {
  if (typeof PersonRegister.parseKontaktPersoner === 'function') {
    return PersonRegister.parseKontaktPersoner(fields || {});
  }
  const raw = fields?.Kontaktpersoner || fields?.Befattningshavare || '';
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function personKey(p) {
  const id = String(p.personnr || '').replace(/\D/g, '');
  if (id.length >= 10) return `id:${id.slice(-10)}`;
  return `namn:${String(p.namn || '').trim().toLowerCase()}`;
}

function summarizePeople(rows) {
  return (rows || [])
    .map((p) => {
      const parts = [p.namn, p.personnr, p.roll, p.agarandel, p.hemvist].filter((x) => x && x !== '–');
      return parts.join(' · ');
    })
    .filter(Boolean)
    .join(' | ');
}

/**
 * Bygg rader till person/ägare-tabellen: KYC + kontaktpersoner (roller).
 */
function buildPersonRows(kyc = {}, fields = {}) {
  const byKey = new Map();
  const upsert = (row) => {
    const namn = String(row.namn || '').trim();
    const personnr = formatPersonnr(row.personnr || '');
    if (!namn && !personnr) return;
    const key = personKey({ namn, personnr });
    const prev = byKey.get(key) || {
      namn: namn || 'Namn saknas',
      personnr: personnr || '–',
      roles: [],
      agarandel: '',
      hemvist: ''
    };
    if (namn && (!prev.namn || prev.namn === 'Namn saknas')) prev.namn = namn;
    if (personnr) prev.personnr = personnr;
    const roles = Array.isArray(row.roller)
      ? row.roller
      : (row.roll ? String(row.roll).split(',').map((r) => r.trim()).filter(Boolean) : []);
    prev.roles = [...new Set(prev.roles.concat(roles.filter(Boolean)))];
    if (row.agarandel != null && row.agarandel !== '' && !prev.agarandel) {
      prev.agarandel = formatPct(row.agarandel);
    }
    const hemvist = String(row.hemvist || row.skatterattslig_hemvist || '').trim();
    if (hemvist && !prev.hemvist) prev.hemvist = hemvist;
    byKey.set(key, prev);
  };

  parseKontaktPersoner(fields).forEach((p) => {
    upsert({
      namn: p.namn || p.name,
      personnr: p.personnr || p.personnummer,
      roller: Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []),
      agarandel: p.agarandel,
      hemvist: p.skatterattslig_hemvist || p.hemvist
    });
  });

  const foretradare = Array.isArray(kyc.foretradare) && kyc.foretradare.length
    ? kyc.foretradare
    : ((kyc.foretradareNamn || kyc.foretradarePnr)
      ? [{
          namn: kyc.foretradareNamn,
          personnr: kyc.foretradarePnr,
          skatterattslig_hemvist: kyc.skatterattslig_hemvist_foretradare
        }]
      : []);
  foretradare.forEach((p) => {
    const key = personKey({
      namn: String(p.namn || '').trim(),
      personnr: formatPersonnr(p.personnr || '')
    });
    const already = byKey.get(key);
    const explicitRoller = Array.isArray(p.roller)
      ? p.roller
      : (p.roll ? String(p.roll).split(',').map((r) => r.trim()).filter(Boolean) : []);
    // Lägg bara generisk «Företrädare» om personen saknar roller från kontaktpersoner
    const roller = explicitRoller.length
      ? explicitRoller
      : (already && already.roles.length ? [] : ['Företrädare']);
    upsert({
      namn: p.namn,
      personnr: p.personnr,
      roller,
      hemvist: p.skatterattslig_hemvist || p.hemvist,
      agarandel: p.agarandel
    });
  });

  const huvudman = KycHuvudman.listFromSaved(kyc, []).filter((p) => p.namn || p.personnr);
  const totalAgarandel = formatPct(kyc.vh_agarandel);
  huvudman.forEach((p, idx) => {
    const own = p.agarandel != null && p.agarandel !== ''
      ? p.agarandel
      : (huvudman.length === 1 ? kyc.vh_agarandel : (idx === 0 ? kyc.vh_agarandel : ''));
    upsert({
      namn: p.namn,
      personnr: p.personnr,
      roller: ['Verklig huvudman'],
      hemvist: p.hemvist || p.skatterattslig_hemvist,
      agarandel: own
    });
  });

  const rows = [...byKey.values()].map((p) => ({
    namn: p.namn,
    personnr: p.personnr || '–',
    roll: p.roles.length ? p.roles.join(', ') : '–',
    agarandel: p.agarandel || (totalAgarandel && p.roles.includes('Verklig huvudman') ? totalAgarandel : '–'),
    hemvist: p.hemvist || 'Sverige'
  }));

  return rows;
}

function hasOmbud(kyc = {}, fields = {}) {
  if (kyc.ombud === 'Ja' || kyc.ombud === true) return true;
  if (typeof kyc.ombud === 'string' && kyc.ombud.trim() && !/^nej$/i.test(kyc.ombud.trim())) {
    return kyc.ombud.trim();
  }
  const people = parseKontaktPersoner(fields);
  const ombud = people.find((p) => (Array.isArray(p.roller) ? p.roller : []).some((r) => /^ombud$/i.test(String(r || ''))));
  if (ombud) return String(ombud.namn || ombud.name || 'Ja').trim() || 'Ja';
  return false;
}

function extractAnswersSnapshot(kyc = {}, fields = {}) {
  const personer = buildPersonRows(kyc, fields);
  return {
    foretagsnamn: plain(kyc.foretagsnamn),
    orgnr: plain(kyc.orgnr),
    skatterattslig_hemvist_foretag: plain(kyc.skatterattslig_hemvist_foretag || 'Sverige'),
    tjanster: plain(kyc.tjanster),
    syfte_affarsrelation: plain(kyc.syfte_affarsrelation),
    verksamhet: plain(kyc.verksamhet),
    kostnader: plain(kyc.kostnader),
    intakterna: plain(kyc.intakterna),
    anstallda: plain(kyc.anstallda),
    omsattning: plain(kyc.omsattning),
    internationellHandel: jaNej(kyc.internationellHandel),
    internationellaLander: plain(kyc.internationellaLander),
    kapitalUrsprung: plain(kyc.kapitalUrsprung),
    kontanter: jaNej(kyc.kontanter),
    kontanterAndel: plain(kyc.kontanterAndel),
    kryptovaluta: jaNej(kyc.kryptovaluta),
    pep: jaNej(kyc.pep),
    pepDetaljer: plain(kyc.pepDetaljer),
    pepFamilj: jaNej(kyc.pepFamilj),
    pepFamiljDetaljer: plain(kyc.pepFamiljDetaljer),
    vh_noterat_bolag: jaNej(kyc.vh_noterat_bolag),
    vh_utlandska_agare: jaNej(kyc.vh_utlandska_agare),
    huvudmanAnnatSatt: plain(kyc.huvudmanAnnatSatt),
    personerSammanfattning: summarizePeople(personer),
    signeringsdatum: formatDate(kyc.signeringsdatum || '')
  };
}

function normalizeForCompare(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Jämför tidigare och aktuella svar → rader { label, previous, current }.
 */
function diffAnswers(previous, current) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const curr = current && typeof current === 'object' ? current : {};
  const rows = [];
  for (const field of DIFF_FIELDS) {
    const a = plain(prev[field.key]);
    const b = plain(curr[field.key]);
    if (normalizeForCompare(a) === normalizeForCompare(b)) continue;
    rows.push({
      label: field.label,
      previous: a || 'Ej besvarat',
      current: b || 'Ej besvarat'
    });
  }
  return rows;
}

function resolveMode(kyc = {}, fields = {}) {
  const explicit = String(kyc.mode || kyc.typ || kyc.intygandeTyp || '').toLowerCase();
  if (/uppdater/.test(explicit)) return 'Uppdatering';
  if (/ny/.test(explicit)) return 'Ny kund';
  if (kyc.previousSigneringsdatum || kyc.previousAnswers) return 'Uppdatering';
  const utfard = fields['KYC UTFÖRD DATUM'] || fields['KYC utford datum'] || fields['KYC utförd datum'];
  if (utfard) return 'Uppdatering';
  const status = String(kyc.status || '').trim();
  // Efter tidigare signering, inför nytt utskick/ifyllnad
  if (kyc.signedAnswers && status && status !== 'Signerat') return 'Uppdatering';
  if (kyc.signedAnswers) {
    const diffs = diffAnswers(kyc.signedAnswers, extractAnswersSnapshot(kyc, fields));
    if (diffs.length) return 'Uppdatering';
  }
  return 'Ny kund';
}

function resolvePreviousAttestationDate(kyc = {}, fields = {}) {
  return formatDate(
    kyc.previousSigneringsdatum
    || (kyc.signedAnswers && kyc.signedAnswers.signeringsdatum)
    || (kyc.previousAnswers && kyc.previousAnswers.signeringsdatum)
    || fields['KYC UTFÖRD DATUM']
    || ''
  );
}

function resolveFilledBy(kyc = {}, meta = {}) {
  if (meta.filledBy) return String(meta.filledBy).trim();
  if (kyc.ifylldAv || kyc.filledBy) return String(kyc.ifylldAv || kyc.filledBy).trim();
  const signers = Array.isArray(kyc.pendingSignerare) ? kyc.pendingSignerare : [];
  if (signers[0]?.namn) return String(signers[0].namn).trim();
  const ftr = Array.isArray(kyc.foretradare) ? kyc.foretradare : [];
  if (ftr[0]?.namn) return String(ftr[0].namn).trim();
  return String(kyc.foretradareNamn || '').trim();
}

function resolveIntygadAv(kyc = {}, meta = {}) {
  const namn = resolveFilledBy(kyc, meta);
  let pnr = '';
  const signers = Array.isArray(kyc.pendingSignerare) ? kyc.pendingSignerare : [];
  if (signers[0]?.personnr) pnr = formatPersonnr(signers[0].personnr);
  if (!pnr) {
    const ftr = Array.isArray(kyc.foretradare) ? kyc.foretradare : [];
    if (ftr[0]?.personnr) pnr = formatPersonnr(ftr[0].personnr);
    else if (kyc.foretradarePnr) pnr = formatPersonnr(kyc.foretradarePnr);
  }
  return { namn: namn || '–', personnr: pnr || '' };
}

function resolveSubmittedAt(kyc = {}, meta = {}) {
  if (meta.submittedAt) return formatDateTime(meta.submittedAt);
  if (kyc.customerAnsweredAt) return formatDateTime(kyc.customerAnsweredAt);
  if (kyc.inskickat) return formatDateTime(kyc.inskickat);
  if (kyc.utskickningsdatum) return formatDate(kyc.utskickningsdatum);
  return formatDateTime(new Date());
}

function qaRow(label, value, { last = false, labelWidth = 240 } = {}) {
  const border = last ? '' : `border-bottom:1px solid ${LINE};`;
  return `<tr>
  <td style="padding:6px 12px 6px 0;width:${labelWidth}px;color:${MUTED};${border}vertical-align:top">${esc(label)}</td>
  <td style="padding:6px 0;${border}vertical-align:top">${esc(dash(value))}</td>
</tr>`;
}

function sectionTitle(text) {
  return `<h2 style="margin:30px 0 10px;font-size:17px;font-weight:700;padding-bottom:6px;border-bottom:1px solid ${LINE_STRONG};color:${INK}">${esc(text)}</h2>`;
}

function buildChangesHtml(changes) {
  if (!Array.isArray(changes) || !changes.length) return '';
  const rows = changes.map((c, i) => {
    const last = i === changes.length - 1;
    const border = last ? '' : `border-bottom:1px solid ${CHANGE_LINE};`;
    return `<tr>
  <td style="padding:6px 8px 6px 0;${border}vertical-align:top">${esc(c.label || c.frage || '')}</td>
  <td style="padding:6px 8px;${border}color:${MUTED};vertical-align:top">${esc(dash(c.previous || c.tidigare))}</td>
  <td style="padding:6px 0 6px 8px;${border}vertical-align:top">${esc(dash(c.current || c.nu))}</td>
</tr>`;
  }).join('');
  return `<section style="margin-top:26px;padding:14px 16px;background:${CHANGE_BG};border:1px solid ${CHANGE_BORDER};border-radius:6px">
<h2 style="margin:0 0 8px;font-size:15px;font-weight:700;color:${INK}">Ändringar sedan förra intygandet</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr style="text-align:left;color:${MUTED2}">
  <th style="padding:5px 8px 5px 0;font-weight:600;border-bottom:1px solid ${CHANGE_HEAD}">Fråga</th>
  <th style="padding:5px 8px;font-weight:600;border-bottom:1px solid ${CHANGE_HEAD}">Tidigare</th>
  <th style="padding:5px 0 5px 8px;font-weight:600;border-bottom:1px solid ${CHANGE_HEAD}">Nu</th>
</tr>
${rows}
</table>
<p style="margin:8px 0 0;font-size:12px;color:${MUTED2}">Övriga uppgifter har kunden bekräftat oförändrade.</p>
</section>`;
}

function buildPersonsTableHtml(rows) {
  if (!rows.length) {
    return `<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><td style="padding:6px 0;color:${MUTED}">Inga personer angivna</td></tr>
</table>`;
  }
  const body = rows.map((p, i) => {
    const last = i === rows.length - 1;
    const border = last ? '' : `border-bottom:1px solid ${LINE};`;
    return `<tr>
  <td style="padding:6px 8px 6px 0;${border}vertical-align:top">${esc(p.namn)}</td>
  <td style="padding:6px 8px;${border}vertical-align:top">${esc(p.personnr)}</td>
  <td style="padding:6px 8px;${border}vertical-align:top">${esc(p.roll)}</td>
  <td style="padding:6px 8px;${border}text-align:right;vertical-align:top">${esc(p.agarandel || '–')}</td>
  <td style="padding:6px 0 6px 8px;${border}vertical-align:top">${esc(p.hemvist || '–')}</td>
</tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr style="text-align:left;color:${MUTED2}">
  <th style="padding:5px 8px 5px 0;font-weight:600;border-bottom:1px solid ${LINE_HEAD}">Namn</th>
  <th style="padding:5px 8px;font-weight:600;border-bottom:1px solid ${LINE_HEAD}">Personnummer</th>
  <th style="padding:5px 8px;font-weight:600;border-bottom:1px solid ${LINE_HEAD}">Roll</th>
  <th style="padding:5px 8px;font-weight:600;border-bottom:1px solid ${LINE_HEAD};text-align:right">Ägarandel</th>
  <th style="padding:5px 0 5px 8px;font-weight:600;border-bottom:1px solid ${LINE_HEAD}">Skattskyldig i</th>
</tr>
${body}
</table>`;
}

function handelValue(kyc) {
  const base = jaNej(kyc.internationellHandel);
  if (base === 'Ja' && plain(kyc.internationellaLander)) {
    return `Ja — ${plain(kyc.internationellaLander)}`;
  }
  return base;
}

function kontanterValue(kyc) {
  const base = jaNej(kyc.kontanter);
  if (base === 'Ja' && plain(kyc.kontanterAndel)) {
    return `Ja — ${plain(kyc.kontanterAndel)}`;
  }
  return base;
}

function vhStammerValue(kyc) {
  if (kyc.vh_stammer != null && kyc.vh_stammer !== '') return jaNej(kyc.vh_stammer);
  if (kyc.vh_bekraftelse === 'Ja' || kyc.vh_bekraftelse === true) return 'Ja';
  if (kyc.vh_bekraftelse === 'Nej' || kyc.vh_bekraftelse === false) return 'Nej';
  if (kyc.vh_bekraftelse === 'Osaker' || kyc.vh_bekraftelse === 'Osäker') return 'Osäker';
  const list = KycHuvudman.listFromSaved(kyc, []).filter((p) => p.namn || p.personnr);
  return list.length ? 'Ja' : '–';
}

function kontrollAnnatValue(kyc) {
  const text = plain(kyc.huvudmanAnnatSatt);
  if (text) return text;
  return 'Nej';
}

function ombudValue(kyc, fields) {
  const o = hasOmbud(kyc, fields);
  if (o === false) return 'Nej';
  if (o === true) return 'Ja';
  return String(o);
}

/**
 * Bygg komplett HTML för KYC-intygande-PDF.
 *
 * @param {object} opts
 * @param {object} opts.kyc
 * @param {object} [opts.fields] kundfält (Kontaktpersoner, KYC UTFÖRD DATUM)
 * @param {string} [opts.byraNamn]
 * @param {string} [opts.byraEpost]
 * @param {string} [opts.byraTelefon]
 * @param {string} [opts.accent]
 * @param {string} [opts.filledBy]
 * @param {string|Date} [opts.submittedAt]
 * @param {string} [opts.documentId]
 * @param {Array} [opts.changes] förifyllda ändringsrader
 * @param {boolean} [opts.asBilaga] titelvariant för riskbilaga
 */
function buildKycIntygandePdfHtml(opts = {}) {
  const kyc = opts.kyc || {};
  const fields = opts.fields || {};
  const byraNamn = String(opts.byraNamn || '').trim() || 'Redovisningsbyrån';
  const byraEpost = String(opts.byraEpost || '').trim();
  const byraTelefon = String(opts.byraTelefon || '').trim();
  const accent = opts.accent || ACCENT;
  const mode = resolveMode(kyc, fields);
  const isUpdate = mode === 'Uppdatering';
  const persons = buildPersonRows(kyc, fields);
  const currentSnap = extractAnswersSnapshot(kyc, fields);
  const previousSnap = kyc.previousAnswers || kyc.signedAnswers || null;
  let changes = Array.isArray(opts.changes) ? opts.changes : (Array.isArray(kyc.andringar) ? kyc.andringar : null);
  if ((!changes || !changes.length) && isUpdate && previousSnap) {
    changes = diffAnswers(previousSnap, currentSnap);
  }
  if (!isUpdate) changes = [];

  const filledBy = resolveFilledBy(kyc, opts);
  const submittedAt = resolveSubmittedAt(kyc, opts);
  const previousDate = resolvePreviousAttestationDate(kyc, fields) || (isUpdate ? '–' : '–');
  const documentId = String(opts.documentId || kyc.inleedDokumentId || kyc.dokumentId || '').trim() || '–';
  const intygad = resolveIntygadAv(kyc, opts);

  const kundNamn = plain(kyc.foretagsnamn) || plain(fields.Namn) || '–';
  const orgnr = plain(kyc.orgnr) || plain(fields.Orgnr) || '–';

  const title = opts.asBilaga ? 'Kundkännedom – intygande (bilaga)' : 'Kundkännedom – intygande';

  const contactParts = [byraEpost || '[E-POST]', byraTelefon || '[TELEFON]'].join(' · ');

  return `<!DOCTYPE html>
<html lang="sv"><head><meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 18mm 16mm 18mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: "Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
    color: ${INK};
    font-size: 13px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
</head><body>
<div style="width:100%;max-width:794px;margin:0 auto;box-sizing:border-box;padding:8px 8px 16px;background:#fff;font-family:'Schibsted Grotesk',system-ui,sans-serif;color:${INK};font-size:14px;line-height:1.5">

<!-- HEAD -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:18px;border-bottom:2px solid ${accent}">
  <div style="display:flex;flex-direction:column;gap:4px">
    <span style="font-size:12px;font-weight:600;color:${MUTED2};letter-spacing:0.04em">${esc(byraNamn.toUpperCase())}</span>
    <h1 style="margin:0;font-size:26px;font-weight:700;line-height:1.2">${esc(title)}</h1>
    <span style="font-size:14px;color:${MUTED2}">Uppgifter lämnade av kunden enligt penningtvättslagen (2017:630)</span>
  </div>
  <span style="font-size:12px;font-weight:600;color:${accent};border:1px solid ${accent};border-radius:4px;padding:3px 8px;white-space:nowrap">${esc(mode)}</span>
</div>

<!-- META -->
<table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13px">
<tr>
  <td style="padding:4px 0;width:170px;color:${MUTED}">Kund</td>
  <td style="padding:4px 0;font-weight:600">${esc(kundNamn)}</td>
  <td style="padding:4px 0;width:130px;color:${MUTED}">Org.nr</td>
  <td style="padding:4px 0">${esc(orgnr)}</td>
</tr>
<tr>
  <td style="padding:4px 0;color:${MUTED}">Ifyllt av</td>
  <td style="padding:4px 0">${esc(dash(filledBy))}</td>
  <td style="padding:4px 0;color:${MUTED}">Inskickat</td>
  <td style="padding:4px 0">${esc(dash(submittedAt))}</td>
</tr>
<tr>
  <td style="padding:4px 0;color:${MUTED}">Föregående intygande</td>
  <td style="padding:4px 0">${esc(isUpdate ? dash(previousDate) : '–')}</td>
  <td style="padding:4px 0;color:${MUTED}">Dokument-id</td>
  <td style="padding:4px 0">${esc(documentId)}</td>
</tr>
</table>

${buildChangesHtml(changes || [])}

<!-- 1 FÖRETAGET -->
${sectionTitle('1. Företaget')}
<table style="width:100%;border-collapse:collapse;font-size:13px">
${qaRow('Företagets namn', kundNamn)}
${qaRow('Organisationsnummer', orgnr)}
${qaRow('Skattskyldigt i', plain(kyc.skatterattslig_hemvist_foretag) || 'Sverige')}
${qaRow('Tjänster från byrån', plain(kyc.tjanster))}
${qaRow('Syfte med affärsrelationen', plain(kyc.syfte_affarsrelation) || 'Sedvanliga redovisningstjänster', { last: true })}
</table>

<!-- 2 PERSONER -->
${sectionTitle('2. Personer och ägare')}
${buildPersonsTableHtml(persons)}
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px">
${qaRow('Stämmer listan över verkliga huvudmän?', vhStammerValue(kyc), { labelWidth: 400 })}
${qaRow('Har någon annan på annat sätt kontroll över företaget?', kontrollAnnatValue(kyc), { labelWidth: 400 })}
${qaRow('Börsnoterat eller ägt av börsnoterat bolag?', jaNej(kyc.vh_noterat_bolag), { labelWidth: 400 })}
${qaRow('Utländska ägare eller styrelseledamöter?', jaNej(kyc.vh_utlandska_agare), { labelWidth: 400 })}
${qaRow('Är någon av personerna i politiskt utsatt ställning (PEP)?', (() => {
  const base = jaNej(kyc.pep);
  if (base === 'Ja' && plain(kyc.pepDetaljer)) return `Ja — ${plain(kyc.pepDetaljer)}`;
  return base;
})(), { labelWidth: 400 })}
${qaRow('Familjemedlem eller nära medarbetare till en PEP?', (() => {
  const base = jaNej(kyc.pepFamilj);
  if (base === 'Ja' && plain(kyc.pepFamiljDetaljer)) return `Ja — ${plain(kyc.pepFamiljDetaljer)}`;
  return base;
})(), { labelWidth: 400 })}
${qaRow('Ombud som sköter kontakten med byrån', ombudValue(kyc, fields), { last: true, labelWidth: 400 })}
</table>

<!-- 3 VERKSAMHETEN -->
${sectionTitle('3. Verksamheten')}
<table style="width:100%;border-collapse:collapse;font-size:13px">
${qaRow('Vad företaget gör', plain(kyc.verksamhet))}
${qaRow('Kostnader', plain(kyc.kostnader))}
${qaRow('Intäkter', plain(kyc.intakterna))}
${qaRow('Antal anställda', plain(kyc.anstallda))}
${qaRow('Uppskattad årsomsättning', plain(kyc.omsattning))}
${qaRow('Handel utanför Sverige', handelValue(kyc), { last: true })}
</table>

<!-- 4 PENGAR -->
${sectionTitle('4. Pengar och betalningar')}
<table style="width:100%;border-collapse:collapse;font-size:13px">
${qaRow('Pengarnas ursprung', plain(kyc.kapitalUrsprung))}
${qaRow('Hanterar kontanter', kontanterValue(kyc))}
${qaRow('Transaktioner i kryptovaluta', jaNej(kyc.kryptovaluta), { last: true })}
</table>

<!-- 5 INTYGANDE -->
${sectionTitle('5. Intygande')}
<p style="margin:0 0 12px;font-size:14px">Jag intygar att lämnade uppgifter är korrekta och fullständiga. Jag förbinder mig att meddela redovisningsbyrån vid väsentliga förändringar i verksamheten, ägarstrukturen eller gällande vem som är verklig huvudman.</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:14px 16px;border:1px solid ${LINE_HEAD};border-radius:6px;font-size:13px">
  <div style="display:flex;flex-direction:column;gap:2px">
    <span style="color:${MUTED}">Intygat av</span>
    <span style="font-weight:600">${esc(intygad.namn)}</span>
    ${intygad.personnr ? `<span>${esc(intygad.personnr)}</span>` : ''}
  </div>
  <div style="display:flex;flex-direction:column;gap:2px">
    <span style="color:${MUTED}">Signering</span>
    <span style="font-weight:600">Elektroniskt med BankID</span>
    <span>Signaturuppgifter läggs till av Inleed vid signering</span>
  </div>
</div>

<!-- FOT -->
<p style="margin:28px 0 0;padding-top:12px;border-top:1px solid ${LINE_STRONG};font-size:12px;color:${MUTED}">Redovisningsbyråer är enligt penningtvättslagen skyldiga att känna sina kunder och hålla uppgifterna aktuella. Uppgifterna behandlas konfidentiellt och sparas så länge lagen kräver. Frågor besvaras av ${esc(byraNamn)}, ${esc(contactParts)}.</p>

</div>
</body></html>`;
}

/** Bakåtkompatibel wrapper (tidigare signatur). */
function buildKycFormularPdfHtml(kyc, byraNamn, _logoHtml, _datum, extra = {}) {
  return buildKycIntygandePdfHtml({
    kyc,
    byraNamn,
    fields: extra.fields || {},
    byraEpost: extra.byraEpost || '',
    byraTelefon: extra.byraTelefon || '',
    documentId: extra.documentId || '',
    filledBy: extra.filledBy || '',
    submittedAt: extra.submittedAt || '',
    changes: extra.changes,
    asBilaga: !!extra.asBilaga,
    accent: extra.accent
  });
}

/**
 * När ett intygande signeras: spara snapshot för nästa uppdaterings-PDF.
 * Vid om-signering flyttas föregående snapshot till previousAnswers.
 */
function attachSignedSnapshot(kyc = {}, fields = {}, signedDate = '') {
  const snapshot = extractAnswersSnapshot(kyc, fields);
  const datum = formatDate(signedDate || kyc.signeringsdatum || new Date());
  snapshot.signeringsdatum = datum;
  const out = {
    ...kyc,
    signedAnswers: snapshot,
    signeringsdatum: datum
  };
  if (kyc.signedAnswers && (kyc.signedAnswers.signeringsdatum || kyc.signeringsdatum)) {
    out.previousAnswers = kyc.signedAnswers;
    out.previousSigneringsdatum = formatDate(
      kyc.signedAnswers.signeringsdatum || kyc.previousSigneringsdatum || kyc.signeringsdatum || ''
    );
  }
  return out;
}

module.exports = {
  ACCENT,
  DIFF_FIELDS,
  esc,
  plain,
  jaNej,
  formatPct,
  formatPersonnr,
  formatDate,
  formatDateTime,
  buildPersonRows,
  extractAnswersSnapshot,
  diffAnswers,
  resolveMode,
  resolvePreviousAttestationDate,
  resolveFilledBy,
  buildKycIntygandePdfHtml,
  buildKycFormularPdfHtml,
  attachSignedSnapshot
};
