const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeIdentity,
  identitiesMatch,
  classifyQuery,
  extractPeopleFromFields,
  mergePersonhistorik,
  uppdragOverlapsWindow,
  searchPersonRegister
} = require('./person-register');

describe('person-register', () => {
  it('normaliserar personnummer och organisationsnummer', () => {
    assert.equal(normalizeIdentity('19800101-1234'), '198001011234');
    assert.equal(normalizeIdentity('800101-1234'), '8001011234');
    assert.equal(normalizeIdentity('165567223705'), '5567223705');
    assert.equal(identitiesMatch('19800101-1234', '8001011234'), true);
    assert.equal(identitiesMatch('556722-3705', '165567223705'), true);
    assert.equal(identitiesMatch('19800101-1234', '19900101-1234'), false);
  });

  it('kräver minst sex siffror i sökningen', () => {
    assert.equal(classifyQuery('12').ok, false);
    assert.equal(classifyQuery('800101-1234').ok, true);
  });

  it('plockar företrädare och verkliga huvudmän från nuvarande data och historik', () => {
    const people = extractPeopleFromFields({
      Kontaktpersoner: JSON.stringify([
        { namn: 'Anna Styrelse', roller: ['Styrelseledamot'], personnr: '19800101-1111' }
      ]),
      Personhistorik: JSON.stringify([
        { namn: 'Bertil VH', personnr: '19750505-2222', roller: ['Verklig huvudman'], removedAt: '2024-03-01' }
      ]),
      'KYC-formular (JSON)': JSON.stringify({
        huvudman: [{ namn: 'Cesar Ägare', personnr: '19660606-3333', skatterattslig_hemvist: 'Sverige' }]
      })
    });
    const ids = people.map((p) => p.personnr);
    assert.ok(ids.includes('198001011111'));
    assert.ok(ids.includes('197505052222'));
    assert.ok(ids.includes('196606063333'));
    assert.ok(people.find((p) => p.personnr === '197505052222').kinds.includes('huvudman'));
  });

  it('behåller borttagna personer i historiken', () => {
    const next = mergePersonhistorik(
      JSON.stringify([{ namn: 'Anna', personnr: '198001011111', roller: ['VD'], firstSeen: '2020-01-01' }]),
      [{ namn: 'Bertil', personnr: '197505052222', roller: ['Styrelseledamot'] }],
      '2026-08-21T10:00:00.000Z'
    );
    const anna = next.find((p) => p.personnr === '198001011111');
    const bertil = next.find((p) => p.personnr === '197505052222');
    assert.equal(anna.removedAt, '2026-08-21T10:00:00.000Z');
    assert.equal(bertil.removedAt, '');
    assert.equal(bertil.roller.includes('Styrelseledamot'), true);
  });

  it('räknar uppdrag som aktiva under de senaste fem åren', () => {
    const now = new Date('2026-08-21T12:00:00Z');
    assert.equal(uppdragOverlapsWindow({
      startdatum: '2023-01-01',
      avslutas: ''
    }, 5, now), true);
    assert.equal(uppdragOverlapsWindow({
      startdatum: '2018-01-01',
      avslutas: '2019-12-31'
    }, 5, now), false);
    assert.equal(uppdragOverlapsWindow({
      startdatum: '2019-01-01',
      avslutas: '2022-06-01'
    }, 5, now), true);
  });

  it('söker dolda och avslutade kunder och kopplar uppdrag', () => {
    const result = searchPersonRegister({
      now: new Date('2026-08-21T12:00:00Z'),
      years: 5,
      query: '19800101-1111',
      customers: [
        {
          id: 'recAktiv',
          fields: {
            Namn: 'Aktiv AB',
            Orgnr: '556722-3705',
            Kundstatus: 'Pågående kund',
            Kontaktpersoner: JSON.stringify([
              { namn: 'Anna Styrelse', roller: ['Styrelseledamot'], personnr: '19800101-1111' }
            ])
          }
        },
        {
          id: 'recDold',
          fields: {
            Namn: 'Dolt AB',
            Orgnr: '559000-1111',
            Kundstatus: 'Avslutad',
            Dold: true,
            Personhistorik: JSON.stringify([
              { namn: 'Anna Styrelse', personnr: '198001011111', roller: ['VD'], removedAt: '2024-01-15' }
            ])
          }
        }
      ],
      uppdrag: [
        { id: 'u1', fields: { 'Kund ID': 'recAktiv', Typ: 'Bokslut', Namn: 'Bokslut 2025', Startdatum: '2025-01-01', Status: 'Aktiv' } },
        { id: 'u2', fields: { 'Kund ID': 'recDold', Typ: 'Deklaration', Namn: 'Dek 2023', Startdatum: '2023-02-01', Avslutas: '2023-12-31', Status: 'Avslutad' } },
        { id: 'uOld', fields: { 'Kund ID': 'recDold', Typ: 'Momsredovisning', Startdatum: '2018-01-01', Avslutas: '2018-12-31' } }
      ]
    });
    assert.equal(result.people.length, 1);
    assert.equal(result.people[0].namn, 'Anna Styrelse');
    assert.equal(result.people[0].bolag.length, 2);
    const dold = result.people[0].bolag.find((b) => b.kundId === 'recDold');
    assert.equal(dold.dold, true);
    assert.equal(dold.avslutad, true);
    assert.equal(dold.uppdrag.length, 1);
    assert.equal(dold.uppdrag[0].typ, 'Deklaration');
    const aktiv = result.people[0].bolag.find((b) => b.kundId === 'recAktiv');
    assert.equal(aktiv.uppdrag[0].typ, 'Bokslut');
  });

  it('hittar företag med ägarandelar via organisationsnummer', () => {
    const result = searchPersonRegister({
      query: '556722-3705',
      customers: [{
        id: 'rec1',
        fields: {
          Namn: 'Holding AB',
          Orgnr: '559111-2222',
          Kontaktpersoner: JSON.stringify([
            { namn: 'Dotter AB', roller: ['Företag med ägarandelar'], personnr: '556722-3705' }
          ])
        }
      }],
      uppdrag: []
    });
    assert.equal(result.people.length, 1);
    assert.equal(result.people[0].bolag[0].namn, 'Holding AB');
    assert.ok(result.people[0].kopplingar.includes('Verklig huvudman'));
  });
});
