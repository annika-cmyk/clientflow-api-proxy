/**
 * Airtable-tabellen "Utbildningar" – fältnamn enligt basens schema.
 */
const UTBILDNINGAR_TABLE = 'Utbildningar';
const UTBILDNINGAR_TABLE_ID = 'tblzrwb7opNcsc9QZ';

const F = {
  BYRA_ID: 'Byrå ID',
  ANSTALLD: 'Anställd',
  NAMN_PA_KURS: 'Namn på kurs',
  DATUM_SLUTFORD: 'Datum slutförd',
  KURSINTYG: 'Kursintyg',
  BESKRIVNING: 'Beskrivning av utbildningen',
  SELECT: 'Select'
};

const SELECT_TYP = ['Intern', 'Extern'];

function cleanStr(v) {
  return (v == null ? '' : String(v)).trim();
}

function mapUtbildningRecord(record) {
  const f = (record && record.fields) || record || {};
  const kursintyg = Array.isArray(f[F.KURSINTYG]) ? f[F.KURSINTYG] : [];
  return {
    id: record && record.id,
    namn: cleanStr(f[F.NAMN_PA_KURS] || f['Namn'] || f['Utbildningsnamn']),
    anstalld: cleanStr(f[F.ANSTALLD] || f['Deltagare']),
    datum: f[F.DATUM_SLUTFORD] || f['Datum'] || '',
    beskrivning: cleanStr(f[F.BESKRIVNING] || f['Beskrivning']),
    typ: cleanStr(f[F.SELECT] || f['Typ'] || f['Utbildningstyp']),
    kursintyg,
    kursintygUrl: kursintyg[0]?.url || '',
    kursintygFilename: kursintyg[0]?.filename || ''
  };
}

function buildUtbildningCreateFields(body, byraId) {
  const o = body || {};
  const namn = cleanStr(o.namn || o.name || o.kurs || o['Namn på kurs']);
  const anstalld = cleanStr(o.anstalld || o.deltagare || o.deltagareNamn || o.participant);
  const datum = cleanStr(o.datum);
  const typ = cleanStr(o.typ || o.select);
  let beskrivning = cleanStr(o.beskrivning);
  const plats = cleanStr(o.plats);
  if (plats) {
    beskrivning = beskrivning
      ? `${beskrivning}\n\nPlats: ${plats}`
      : `Plats: ${plats}`;
  }

  const fields = {
    [F.NAMN_PA_KURS]: namn || 'Namnlös utbildning',
    [F.BYRA_ID]: cleanStr(byraId)
  };
  if (anstalld) fields[F.ANSTALLD] = anstalld;
  if (datum) fields[F.DATUM_SLUTFORD] = datum;
  if (beskrivning) fields[F.BESKRIVNING] = beskrivning;
  if (typ && SELECT_TYP.includes(typ)) fields[F.SELECT] = typ;
  return fields;
}

module.exports = {
  UTBILDNINGAR_TABLE,
  UTBILDNINGAR_TABLE_ID,
  F,
  SELECT_TYP,
  mapUtbildningRecord,
  buildUtbildningCreateFields
};
