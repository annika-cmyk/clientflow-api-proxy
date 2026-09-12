const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Kundformular = require('./kundformular');

describe('kundformular', () => {
  it('exposes Airtable field name and statuses', () => {
    assert.equal(Kundformular.FIELD, 'Kundformulär (JSON)');
    assert.ok(Kundformular.STATUSES.includes('besvarat'));
    assert.equal(Kundformular.statusLabel('besvarat'), 'Besvarat av kund');
    assert.equal(Kundformular.VERSION, 2);
  });

  it('parses empty / invalid input to a stable utkast form', () => {
    const form = Kundformular.parseForm(null);
    assert.equal(form.status, 'utkast');
    assert.equal(form.answers.foretagsnamn, '');
    assert.equal(form.answers.foretradare.length, 1);
    assert.deepEqual(form.answers.tjanster, []);
    assert.equal(form.answers.forvantad_omfattning, '');
    assert.equal(form.answers.vh_bekraftelse, '');
    assert.equal(form.answers.ombud_annan, '');
    assert.equal(form.answers.bekraftelse, false);
  });

  it('migrates v1 answers and keeps new fields blank', () => {
    const form = Kundformular.parseForm({
      version: 1,
      status: 'prefillad',
      answers: {
        verksamhet: 'Handel',
        pep: 'Nej'
      }
    });
    assert.equal(form.answers.verksamhet, 'Handel');
    assert.equal(form.answers.forvantad_omfattning, '');
    assert.equal(form.answers.vh_bekraftelse, '');
    assert.deepEqual(form.answers.tjanster, []);
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
          { namn: 'Bertil Berg', personnr: '750202-5678', roller: ['VD'] },
          { namn: 'Carla Ombud', personnr: '900303-1111', roller: ['Ombud'] }
        ]
      },
      kyc: {
        kapitalUrsprung: 'Vinst från verksamheten',
        syfte_affarsrelation: 'bokföring och deklaration'
      },
      tjanster: [{ id: 'recT1', namn: 'Löpande bokföring' }]
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
    assert.equal(next.answers.ombud_annan, 'Ja');
    assert.equal(next.answers.ombud[0].namn, 'Carla Ombud');
    assert.equal(next.answers.tjanster[0].namn, 'Löpande bokföring');
    assert.ok(next.prefacedAt);
    assert.ok(next.prefillMeta.fields.includes('foretagsnamn'));
  });

  it('does not default syfte to canned text on prefill', () => {
    const next = Kundformular.applyPrefill(Kundformular.emptyForm(), {
      fields: { Namn: 'Acme AB', Orgnr: '556677-8899' },
      kyc: {}
    });
    assert.equal(next.answers.syfte_affarsrelation, '');
  });

  it('detects komplex ägarstruktur and requires agarstruktur text', () => {
    assert.equal(
      Kundformular.isKomplexAgarstruktur([
        { namn: 'A', agarandel: '10', hemvist: 'Sverige' }
      ]),
      true
    );
    assert.equal(
      Kundformular.isKomplexAgarstruktur([
        { namn: 'A', agarandel: '40', hemvist: 'Norge' }
      ]),
      true
    );
    assert.equal(
      Kundformular.vhBekraftelseKraverAgarstruktur({
        vh_bekraftelse: 'Osaker',
        huvudman: [{ namn: 'A', agarandel: '50', hemvist: 'Sverige' }]
      }),
      true
    );
    assert.equal(
      Kundformular.vhBekraftelseKraverAgarstruktur({
        vh_bekraftelse: 'Ja',
        huvudman: [{ namn: 'A', agarandel: '50', hemvist: 'Sverige' }]
      }),
      false
    );
  });

  it('shows skarpt kapitalursprung for PEP and distans flags', () => {
    assert.equal(
      Kundformular.needsSkarptKapitalUrsprung({ pep: 'Ja' }),
      true
    );
    assert.equal(
      Kundformular.needsSkarptKapitalUrsprung({ pep: 'Nej' }, {
        riskFlags: ['Distansrelation utan säker verifiering']
      }),
      true
    );
    assert.equal(
      Kundformular.needsSkarptKapitalUrsprung({ pep: 'Nej' }),
      false
    );
  });

  it('derives villkorade kontroller from selected tjänster', () => {
    const list = Kundformular.villkoradeForTjanster([
      { namn: 'Löpande bokföring' },
      { namn: 'Momsdeklaration' }
    ]);
    assert.ok(list.some((c) => c.id === 'bokforing_kontantflode'));
    assert.ok(list.some((c) => c.id === 'deklaration_utland'));
    assert.equal(Kundformular.villkoradeForTjanster([]).length, 0);
  });

  it('buildUiMeta exposes badges and reactive villkorade katalog', () => {
    const form = Kundformular.parseForm({
      answers: {
        tjanster: [{ namn: 'Bokslut' }],
        pep: 'Ja'
      }
    });
    const meta = Kundformular.buildUiMeta(form, {
      tjansterOptions: [{ id: 'rec1', namn: 'Bokslut' }],
      riskFlags: []
    });
    assert.equal(meta.fieldSources.tjanster, 'byra');
    assert.equal(meta.fieldSources.forvantad_omfattning, 'sjalvrapport');
    assert.ok(meta.villkoradeKontroller.some((c) => c.id === 'bokslut_ovanliga_transaktioner'));
    assert.ok(meta.villkoradeKatalog.length >= meta.villkoradeKontroller.length);
    assert.equal(meta.skarptKapital, true);
  });

  it('marks answered with answeredAt', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      { verksamhet: 'Handel', bekraftelse: true, forvantad_omfattning: 'Månadsvis bokföring' },
      { actor: 'kund', action: 'mark_answered' }
    );
    assert.equal(form.status, 'besvarat');
    assert.ok(form.answeredAt);
    assert.equal(form.answers.verksamhet, 'Handel');
    assert.equal(form.answers.forvantad_omfattning, 'Månadsvis bokföring');
    assert.equal(form.answers.bekraftelse, true);
    assert.equal(Kundformular.isAnswered(form), true);
    assert.equal(Kundformular.summaryForUi(form).statusLabel, 'Besvarat av kund');
  });

  it('serializes round-trip including new fields', () => {
    const form = Kundformular.applySave(
      Kundformular.emptyForm(),
      {
        foretagsnamn: 'Test AB',
        pep: 'Nej',
        tjanster: [{ id: 'recX', namn: 'Deklaration' }],
        vh_bekraftelse: 'Ja',
        ombud_annan: 'Nej',
        forvantad_omfattning: 'Kvartalsvis',
        villkorade_svar: { deklaration_utland: { svar: 'Nej', varfor: '' } }
      },
      { actor: 'byra', action: 'save' }
    );
    const again = Kundformular.parseForm(Kundformular.serializeForm(form));
    assert.equal(again.answers.foretagsnamn, 'Test AB');
    assert.equal(again.answers.pep, 'Nej');
    assert.equal(again.answers.tjanster[0].namn, 'Deklaration');
    assert.equal(again.answers.vh_bekraftelse, 'Ja');
    assert.equal(again.answers.forvantad_omfattning, 'Kvartalsvis');
    assert.equal(again.answers.villkorade_svar.deklaration_utland.svar, 'Nej');
    assert.equal(again.status, 'prefillad');
    assert.equal(again.version, 2);
  });
});
