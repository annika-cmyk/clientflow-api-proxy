/**
 * Uppslag av kund på byrå via organisationsnummer (utan att skapa).
 * Används för Nytt lead / dubblettkoll innan kunduppläggning.
 */

function normalizeOrgnrDigits(raw) {
  return String(raw == null ? '' : raw).replace(/[^\d]/g, '');
}

function orgnrVariants(orgnrRaw) {
  const digits = normalizeOrgnrDigits(orgnrRaw);
  if (!digits) return [];
  const variants = [digits];
  if (digits.length === 10) {
    const yy = parseInt(digits.substring(0, 2), 10);
    const currentYear = new Date().getFullYear() % 100;
    variants.push((yy > currentYear ? '19' : '20') + digits);
    variants.push(digits.replace(/^(\d{6})(\d{4})$/, '$1-$2'));
  } else if (digits.length === 12) {
    variants.push(digits.substring(2));
    variants.push(digits.substring(2).replace(/^(\d{6})(\d{4})$/, '$1-$2'));
  }
  return [...new Set(variants.filter(Boolean))];
}

function escapeAirtableString(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeByraId(raw) {
  if (raw == null || raw === '') return '';
  if (Array.isArray(raw)) return normalizeByraId(raw[0]);
  if (typeof raw === 'object') {
    return normalizeByraId(raw.name || raw.Name || raw.id || '');
  }
  return String(raw).replace(/,/g, '').trim();
}

function orgnrFromRecord(record) {
  const f = record?.fields || {};
  return normalizeOrgnrDigits(f.Orgnr || f.Organisationsnummer || f.orgnr || '');
}

function recordMatchesOrgnr(record, orgnrRaw) {
  const digits = normalizeOrgnrDigits(orgnrRaw);
  const rec = orgnrFromRecord(record);
  if (!digits || !rec) return false;
  return (
    rec === digits ||
    rec === digits.substring(0, 10) ||
    (digits.length === 12 && rec === digits.substring(2)) ||
    (rec.length === 12 && digits.length === 10 && rec.substring(2) === digits)
  );
}

function byraIdFromRecord(record) {
  const f = record?.fields || {};
  return normalizeByraId(f['Byrå ID'] ?? f.Byra_ID ?? f.ByraID ?? f.Byrå ?? f.Byra ?? '');
}

/**
 * Hitta kundpost med samma orgnr hos byrån.
 * @returns {Promise<object|null>} Airtable-record eller null
 */
async function findKundByOrgnrForByra({
  axios,
  token,
  baseId,
  tableId = 'tblOIuLQS2DqmOQWe',
  orgnr,
  byraId
}) {
  const orgnrRaw = normalizeOrgnrDigits(orgnr);
  const byraIdClean = normalizeByraId(byraId);
  if (!orgnrRaw || orgnrRaw.length < 10 || orgnrRaw.length > 12) {
    return null;
  }
  if (!axios || !token || !baseId) {
    throw new Error('axios, token och baseId krävs');
  }

  const variants = orgnrVariants(orgnrRaw);
  const esc = escapeAirtableString;
  const fieldsQs =
    'fields[]=Namn&fields[]=Orgnr&fields[]=Organisationsnummer&fields[]=' +
    encodeURIComponent('Byrå ID') +
    '&fields[]=' +
    encodeURIComponent('Användare') +
    '&fields[]=Klientansvarig';

  const byraIdMatch = (record) => {
    if (!byraIdClean) return true;
    return normalizeByraId(byraIdFromRecord(record)) === byraIdClean;
  };

  const orgnrOnlyFormula =
    variants.length === 1
      ? `{Orgnr}="${esc(orgnrRaw)}"`
      : `OR(${variants.map((o) => `{Orgnr}="${esc(o)}"`).join(',')})`;

  const fetchFiltered = async (formula) => {
    const url =
      `https://api.airtable.com/v0/${baseId}/${tableId}` +
      `?filterByFormula=${encodeURIComponent(formula)}` +
      `&maxRecords=100&${fieldsQs}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    return res.data.records || [];
  };

  let records = [];
  try {
    if (byraIdClean) {
      const byraIdFormula = /^\d+$/.test(byraIdClean)
        ? `{Byrå ID}=${byraIdClean}`
        : `{Byrå ID}="${esc(byraIdClean)}"`;
      const orgnrConditions = variants.map((o) => `{Orgnr}="${esc(o)}"`).join(',');
      const checkFormula = `AND(OR(${orgnrConditions}),${byraIdFormula})`;
      try {
        records = await fetchFiltered(checkFormula);
      } catch (e) {
        if (e.response?.status !== 422 && e.response?.status !== 400) throw e;
        records = [];
      }
    }
    if (!records.length) {
      records = await fetchFiltered(orgnrOnlyFormula);
    }
  } catch (e) {
    if (e.response?.status === 422 || e.response?.status === 400) {
      records = [];
    } else {
      throw e;
    }
  }

  return (
    records.find((r) => recordMatchesOrgnr(r, orgnrRaw) && byraIdMatch(r)) || null
  );
}

function toLookupPayload(record, { hasAccess = false } = {}) {
  if (!record) {
    return { exists: false, existingId: null, existingNamn: '', hasAccess: false };
  }
  return {
    exists: true,
    existingId: record.id,
    existingNamn: record.fields?.Namn || '',
    hasAccess: !!hasAccess
  };
}

module.exports = {
  normalizeOrgnrDigits,
  orgnrVariants,
  recordMatchesOrgnr,
  byraIdFromRecord,
  findKundByOrgnrForByra,
  toLookupPayload
};
