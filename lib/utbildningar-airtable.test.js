const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapUtbildningRecord,
  buildUtbildningCreateFields,
  F
} = require('./utbildningar-airtable');

describe('utbildningar-airtable', () => {
  it('mappar Airtable-post till API-format', () => {
    const mapped = mapUtbildningRecord({
      id: 'rec1',
      fields: {
        [F.NAMN_PA_KURS]: 'AML-grundkurs',
        [F.ANSTALLD]: 'Anna Andersson',
        [F.DATUM_SLUTFORD]: '2026-08-27',
        [F.SELECT]: 'Intern',
        [F.BESKRIVNING]: 'Genomförd distansutbildning.',
        [F.KURSINTYG]: [{ url: 'https://example.com/intyg.pdf', filename: 'intyg.pdf' }]
      }
    });
    assert.equal(mapped.namn, 'AML-grundkurs');
    assert.equal(mapped.anstalld, 'Anna Andersson');
    assert.equal(mapped.typ, 'Intern');
    assert.equal(mapped.kursintygFilename, 'intyg.pdf');
  });

  it('bygger create-fält enligt Airtable-schemat', () => {
    const fields = buildUtbildningCreateFields({
      namn: 'Certifierad utbildning inom AMLR',
      anstalld: 'Elisabeth Bergdahl',
      datum: '2026-08-27',
      typ: 'Extern',
      plats: 'Distans',
      beskrivning: 'Obligatorisk utbildning.'
    }, '49');
    assert.equal(fields[F.NAMN_PA_KURS], 'Certifierad utbildning inom AMLR');
    assert.equal(fields[F.ANSTALLD], 'Elisabeth Bergdahl');
    assert.equal(fields[F.DATUM_SLUTFORD], '2026-08-27');
    assert.equal(fields[F.SELECT], 'Extern');
    assert.match(fields[F.BESKRIVNING], /Plats: Distans/);
    assert.equal(fields[F.BYRA_ID], '49');
    assert.equal(fields['Namn'], undefined);
  });
});
