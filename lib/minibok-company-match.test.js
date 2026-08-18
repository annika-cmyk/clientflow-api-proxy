/**
 * Enhetstester för KUNDDATA-val vid dubbletter (enskild firma).
 * Kör: node --test lib/minibok-company-match.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pickBestCompanyRecord,
  amlRichnessScore,
  nameOverlapScore,
  isPlaceholderText,
  recordOrgNr,
  orgNrMatches,
  shouldQueueMinibokNewCustomerNotice,
  existingCustomerSyncFields,
  orgNrVariants,
  orgNrAirtableFormula,
  shouldShowMinibokNewCustomerNotice,
} = require('./minibok-company-match');

describe('pickBestCompanyRecord', () => {
  const stub = {
    id: 'recStub',
    fields: {
      Namn: 'Tobias Andersson',
      Orgnr: '750411-1234',
      'Beskrivning av kunden': 'Beskrivning av kunden',
    },
  };
  const rich = {
    id: 'recRich',
    fields: {
      Namn: 'Anderssons Bygg',
      Orgnr: '7504111234',
      Riskniva: 'Medel',
      Omsättning: '0–200 000 kr',
      'Beskrivning av kunden': 'Byggverksamhet i Växjö',
      'KYC-formular (JSON)': JSON.stringify({ omsattning: '0–200 000 kr' }),
      'SNI kod': '41200',
    },
  };

  it('väljer den ifyllda posten även om Minibok-namnet matchar stubben', () => {
    const picked = pickBestCompanyRecord([stub, rich], {
      orgNr: '7504111234',
      name: 'Tobias Andersson',
    });
    assert.equal(picked.id, 'recRich');
    assert.ok(amlRichnessScore(rich) > amlRichnessScore(stub));
  });

  it('använder namn som tiebreaker när båda är tomma', () => {
    const other = {
      id: 'recOther',
      fields: { Namn: 'Annan Firma', Orgnr: '7504111234' },
    };
    const picked = pickBestCompanyRecord([other, stub], {
      orgNr: '750411-1234',
      name: 'Andersson Tobias',
    });
    assert.equal(picked.id, 'recStub');
  });

  it('filtrerar bort poster utan org-match', () => {
    const otherOrg = {
      id: 'recOtherOrg',
      fields: { Namn: 'Annan AB', Orgnr: '556677-8899', Riskniva: 'Hög' },
    };
    const picked = pickBestCompanyRecord([otherOrg, stub], { orgNr: '7504111234' });
    assert.equal(picked.id, 'recStub');
  });

  it('respekterar hasAccess', () => {
    const picked = pickBestCompanyRecord([stub, rich], {
      orgNr: '7504111234',
      hasAccess: (r) => r.id === 'recStub',
    });
    assert.equal(picked.id, 'recStub');
  });
});

describe('nameOverlapScore / placeholders', () => {
  it('matchar omkastat personnamn', () => {
    assert.equal(nameOverlapScore('Tobias Andersson', 'Andersson Tobias'), 1);
    assert.ok(nameOverlapScore('Anderssons Bygg', 'Andersson Tobias') < 1);
  });

  it('behandlar fältnamn-som-värde som placeholder', () => {
    assert.equal(isPlaceholderText('Beskrivning av kunden', 'Beskrivning av kunden'), true);
    assert.equal(isPlaceholderText('Byggverksamhet i Växjö', 'Beskrivning av kunden'), false);
  });
});

describe('Minibok pending på befintlig kund', () => {
  it('köar inte notis när kunden redan finns', () => {
    assert.equal(shouldQueueMinibokNewCustomerNotice({ id: 'recOld' }), false);
    assert.equal(shouldQueueMinibokNewCustomerNotice(null), true);
  });

  it('länkar utan att sätta pending, och rensar felaktig pending', () => {
    const fields = existingCustomerSyncFields(
      { 'Minibok pending': true },
      { source: 'minibok', minibokCompanyId: 'co_1' }
    );
    assert.equal(fields['Minibok pending'], false);
    assert.equal(fields['Minibok källa'], 'minibok');
    assert.equal(fields['Minibok company id'], 'co_1');
    assert.equal(
      existingCustomerSyncFields({ 'Minibok källa': 'minibok', 'Minibok pending': true }, { source: 'minibok' })['Minibok pending'],
      false
    );
  });
});

describe('orgnr-format och ny-kund-banner', () => {
  it('inkluderar personnummer med århundrade och bindestreck', () => {
    const v = orgNrVariants('8610014519');
    assert.ok(v.includes('8610014519'));
    assert.ok(v.includes('861001-4519'));
    assert.ok(v.includes('198610014519'));
    assert.ok(v.includes('19861001-4519'));
    assert.match(orgNrAirtableFormula('861001-4519'), /RIGHT/);
    assert.match(orgNrAirtableFormula('861001-4519'), /8610014519/);
  });

  it('visar inte banner för Pågående kund', () => {
    assert.equal(shouldShowMinibokNewCustomerNotice({
      Kundstatus: 'Pågående kund',
      'Minibok pending': true,
      Namn: 'MV-BYGG',
    }), false);
    assert.equal(shouldShowMinibokNewCustomerNotice({
      Kundstatus: 'Lead',
      'Minibok pending': true,
    }), true);
  });
});

describe('recordOrgNr', () => {
  it('läser Personnummer och matchar 10 siffror', () => {
    assert.equal(recordOrgNr({ Personnummer: '19750411-1234' }), '197504111234');
    assert.equal(orgNrMatches('19750411-1234', '7504111234'), true);
  });
});
