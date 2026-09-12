const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Kundformular = require('./kundformular');

describe('kundformular', () => {
  it('exposes Airtable field name and statuses', () => {
    assert.equal(Kundformular.FIELD, 'Kundformulär (JSON)');
    assert.ok(Kundformular.STATUSES.includes('besvarat'));
    assert.equal(Kundformular.statusLabel('besvarat'), 'Besvarat av kund');
  });

  it('parses empty / invalid input to a stable utkast form', () => {
    const form = Kundformular.parseForm(null);
    assert.equal(form.status, 'utkast');
    assert.equal(form.answers.foretagsnamn, '');
    assert.equal(form.answers.foretradare.length, 1);
    assert.equal(form.answers.bekraftelse, false);
  });

  it('prefills blank fields from kunddata + KYC without overwriting filled answers', () => {
    const existing = Kundformular.parseForm({
      status: 'utkast',
      answers: {
        verksamhet: 'Redan ifyllt av kund',
        pep: ''
      }
    });
    const next = Kundformular.applyPrefill(existing, {
      fields: {
        Namn: 'Acme AB',
        Orgnr: '556677-8899',
        Verksamhet: 'Byråns verksamhetsbeskrivning',
        'Har företaget transaktioner med andra länder?': 'Ja',
        'Riskhöjande faktorer övrigt': ['Kontanthantering'],
        Kontaktpersoner: [
          { namn: 'Anna Andersson', personnr: '800101-1234', roller: ['Verklig huvudman'], pepMarkerad: true },
          { namn: 'Bertil Berg', personnr: '750202-5678', roller: ['VD'] }
        ]
      },
      kyc: {
        kapitalUrsprung: 'Vinst från verksamheten',
        syfte_affarsrelation: 'bokföring och deklaration'
      }
    });
    assert.equal(next.status, 'prefillad');
    assert.equal(next.answers.verksamhet, 'Redan ifyllt av kund');
    assert.equal(next.answers.foretagsnamn, 'Acme AB');
    assert.equal(next.answers.orgnr, '556677-8899');
    assert.equal(next.answers.kapitalUrsprung, 'Vinst från verksamheten');
    assert.equal(next.answers.syfte_affarsrelation, 'bokföring och deklaration');
    assert.equal(next.answers.pep, 'Ja');
    assert.equal(next.answers.internationellHandel, 'Ja');
    assert.equal(next.answers.kontanter, 'Ja');
    assert.equal(next.answers.huvudman[0].namn, 'Anna Andersson');
    assert.equal(next.answers.foretradare[0].namn, 'Bertil Berg');
    assert.ok(next.prefacedAt);
    assert.ok(next.prefillMeta.fields.includes('foretagsnamn'));
  });

  it('marks answered with answeredAt', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { verksamhet: 'Handel', bekraftelse: true },
      { actor: 'kund', action: 'mark_answered' }
    );
    assert.equal(form.status, 'besvarat');
    assert.ok(form.answeredAt);
    assert.equal(form.answers.verksamhet, 'Handel');
    assert.equal(form.answers.bekraftelse, true);
    assert.equal(Kundformular.isAnswered(form), true);
    assert.equal(Kundformular.summaryForUi(form).statusLabel, 'Besvarat av kund');
  });

  it('serializes round-trip', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { foretagsnamn: 'Test AB', pep: 'Nej' },
      { actor: 'byra', action: 'save' }
    );
    const again = Kundformular.parseForm(Kundformular.serializeForm(form));
    assert.equal(again.answers.foretagsnamn, 'Test AB');
    assert.equal(again.answers.pep, 'Nej');
    assert.equal(again.status, 'prefillad');
  });
});
