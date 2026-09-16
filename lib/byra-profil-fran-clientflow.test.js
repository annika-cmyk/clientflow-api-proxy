const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProfilFranClientflow,
  formatCountedList,
  percentOf,
  SECTION_FIELD_KEYS
} = require('./byra-profil-fran-clientflow');

function rec(fields) {
  return { id: 'rec' + Math.random().toString(36).slice(2, 8), fields: fields || {} };
}

describe('byra-profil-fran-clientflow', () => {
  it('percentOf avrundar till heltal', () => {
    assert.equal(percentOf(1, 3), 33);
    assert.equal(percentOf(0, 10), 0);
    assert.equal(percentOf(5, 0), 0);
  });

  it('formatCountedList mappar Aktiebolag till AB', () => {
    assert.equal(
      formatCountedList([{ namn: 'Aktiebolag', antal: 60 }, { namn: 'Enskild firma', antal: 40 }]),
      'AB: 60, Enskild firma: 40'
    );
  });

  it('bygger kundstockfält från aktiva kunder', () => {
    const records = [
      rec({
        Bolagsform: 'Aktiebolag',
        Bransch: 'Bygg',
        'Kunden verkar i en högriskbransch': ['Kontanthandel'],
        'KYC-formular (JSON)': JSON.stringify({
          kontanter: 'Ja',
          komplexAgarstruktur: 'Ja',
          skatterattslig_hemvist_foretag: 'Norge',
          pep: 'Ja'
        })
      }),
      rec({
        Bolagsform: 'Enskild firma',
        Bransch: 'Bygg',
        'KYC-formular (JSON)': JSON.stringify({ kontanter: 'Nej' })
      }),
      rec({
        Bolagsform: 'Aktiebolag',
        Bransch: 'IT och konsultverksamhet'
      })
    ];

    const result = buildProfilFranClientflow(records, { section: 'kundstock' });
    assert.equal(result.fields.antalKunder, 3);
    assert.match(result.fields.vanligasteBolagsformer, /AB: 2/);
    assert.match(result.fields.vanligasteBolagsformer, /Enskild firma: 1/);
    assert.match(result.fields.kundernasBranscher, /Bygg och anläggning: 2/);
    assert.match(result.fields.kundernasBranscher, /IT och konsultverksamhet: 1/);
    assert.match(result.fields.branscherKundstock, /Kontanthandel: 1/);
    assert.equal(result.fields.andelHogriskbransch, 33);
    assert.equal(result.fields.andelKontantintensiva, 33);
    assert.equal(result.fields.komplexaAgarstrukturer, 'Ja');
    assert.equal(result.fields.komplexaAgarstrukturerAntal, 1);
    assert.equal(result.fields.utlandskaAgare, 'Ja');
    assert.equal(result.fields.utlandskaAgareAntal, 1);
    assert.equal(result.fields.pepKunder, 'Ja');
    assert.equal(result.fields.pepKunderAntal, 1);
    assert.ok(!Object.prototype.hasOwnProperty.call(result.fields, 'andelInternationellHandel'));
    assert.deepEqual(result.filledKeys.sort(), Object.keys(result.fields).sort());
  });

  it('sätter Inga högriskbranscher när ingen träff', () => {
    const result = buildProfilFranClientflow([
      rec({ Bolagsform: 'AB', Bransch: 'Utbildning' })
    ], { section: 'kundstock' });
    assert.equal(result.fields.branscherKundstock, 'Inga högriskbranscher');
    assert.equal(result.fields.andelHogriskbransch, 0);
    assert.equal(result.fields.pepKunder, 'Nej');
    assert.ok(!Object.prototype.hasOwnProperty.call(result.fields, 'pepKunderAntal'));
  });

  it('bygger geografifält', () => {
    const records = [
      rec({
        'KYC-formular (JSON)': JSON.stringify({
          internationellHandel: 'Ja',
          internationellaLander: 'Iran'
        }),
        'Utsatt område (JSON)': JSON.stringify({
          trff: true,
          kontrolleradAt: '2026-01-01T00:00:00.000Z',
          kategori: 'Utsatt område'
        })
      }),
      rec({
        'KYC-formular (JSON)': JSON.stringify({ internationellHandel: 'Nej' }),
        'Utsatt område (JSON)': JSON.stringify({
          trff: false,
          kontrolleradAt: '2026-01-01T00:00:00.000Z'
        })
      })
    ];
    const result = buildProfilFranClientflow(records, { section: 'geografi' });
    assert.equal(result.fields.andelInternationellHandel, 50);
    assert.equal(result.fields.sanktionslander, 'Ja');
    assert.equal(result.fields.kunderIUtsattaOmraden, 'Ja');
    assert.equal(result.fields.kunderIUtsattaOmradenAntal, 1);
    assert.ok(!Object.prototype.hasOwnProperty.call(result.fields, 'antalKunder'));
  });

  it('exponerar sektionsnycklar', () => {
    assert.ok(SECTION_FIELD_KEYS.kundstock.includes('antalKunder'));
    assert.ok(SECTION_FIELD_KEYS.kundstock.includes('kundResidualriskFordelning'));
    assert.ok(SECTION_FIELD_KEYS.geografi.includes('andelInternationellHandel'));
  });

  it('mappar residualriskfördelning från kundposter', () => {
    const records = [
      rec({ Kundstatus: 'Pågående kund', Riskniva: 'Låg' }),
      rec({ Kundstatus: 'Pågående kund', Riskniva: 'Normal' }),
      rec({ Kundstatus: 'Pågående kund', Riskniva: 'Normal' }),
      rec({ Kundstatus: 'Pågående kund', Riskniva: 'Förhöjd' })
    ];
    const result = buildProfilFranClientflow(records, { section: 'kundstock' });
    assert.match(result.fields.kundResidualriskFordelning || '', /Låg: 1/);
    assert.match(result.fields.kundResidualriskFordelning || '', /Normal: 2/);
    assert.match(result.fields.kundResidualriskFordelning || '', /Förhöjd: 1/);
  });

  it('ignorerar avslutade, leads och dolda även om de skickas in', () => {
    const records = [
      rec({ Kundstatus: 'Pågående kund', Bolagsform: 'Aktiebolag' }),
      rec({ Kundstatus: 'Avslutad', Bolagsform: 'Enskild firma' }),
      rec({ Kundstatus: 'Lead', Bolagsform: 'Aktiebolag' }),
      rec({ Kundstatus: 'Pågående kund', Dold: true, Bolagsform: 'HB' }),
      rec({ Kundstatus: 'Avslutade', Bolagsform: 'Aktiebolag' })
    ];
    const result = buildProfilFranClientflow(records, { section: 'kundstock' });
    assert.equal(result.fields.antalKunder, 1);
    assert.match(result.fields.vanligasteBolagsformer, /AB: 1/);
    assert.doesNotMatch(result.fields.vanligasteBolagsformer || '', /Enskild firma/);
  });
});
