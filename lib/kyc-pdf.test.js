const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const KycPdf = require('./kyc-pdf');

describe('kyc-pdf', () => {
  const sampleKyc = {
    foretagsnamn: 'Anoteket AB',
    orgnr: '559236-8673',
    skatterattslig_hemvist_foretag: 'Sverige',
    tjanster: 'Rådgivning',
    syfte_affarsrelation: 'Sedvanliga redovisningstjänster',
    verksamhet: 'Förlags- och författarverksamhet',
    kostnader: 'Små kostnader, mest tryck',
    intakterna: 'Försäljning av böcker',
    anstallda: '0',
    omsattning: '0–200 000 kr',
    internationellHandel: 'Nej',
    kapitalUrsprung: 'Försäljning av böcker i Sverige',
    kontanter: 'Nej',
    kryptovaluta: 'Nej',
    pep: 'Nej',
    pepFamilj: 'Nej',
    vh_agarandel: 100,
    vh_noterat_bolag: false,
    vh_utlandska_agare: false,
    foretradare: [{ namn: 'Eva Fodor Velander', personnr: '195407052223', skatterattslig_hemvist: 'Sverige' }],
    huvudman: [{ namn: 'Eva Fodor Velander', personnr: '195407052223', skatterattslig_hemvist: 'Sverige' }],
    pendingSignerare: [{ namn: 'Eva Fodor Velander', personnr: '195407052223', epost: 'eva@exempel.se' }]
  };

  const fields = {
    Kontaktpersoner: JSON.stringify([
      { namn: 'Eva Fodor Velander', personnr: '19540705-2223', roller: ['Verklig huvudman', 'VD', 'Suppleant'], agarandel: '100' },
      { namn: 'Sven Olof Rune Velander', personnr: '19660121-3959', roller: ['Styrelseledamot'] }
    ])
  };

  it('bygger personrader med roll och ägarandel', () => {
    const rows = KycPdf.buildPersonRows(sampleKyc, fields);
    assert.ok(rows.length >= 2);
    const eva = rows.find((p) => /Eva/.test(p.namn));
    assert.ok(eva);
    assert.match(eva.roll, /Verklig huvudman/);
    assert.match(eva.roll, /VD/);
    assert.doesNotMatch(eva.roll, /Företrädare/);
    assert.equal(eva.agarandel, '100 %');
    assert.match(eva.personnr, /19540705-2223/);
    const sven = rows.find((p) => /Sven/.test(p.namn));
    assert.equal(sven.hemvist, 'Sverige');
  });

  it('markerar Ny kund utan tidigare intygande', () => {
    assert.equal(KycPdf.resolveMode(sampleKyc, {}), 'Ny kund');
  });

  it('markerar Uppdatering när previousSigneringsdatum eller ändrade svar finns', () => {
    assert.equal(
      KycPdf.resolveMode({ ...sampleKyc, previousSigneringsdatum: '2025-01-01' }, {}),
      'Uppdatering'
    );
    assert.equal(
      KycPdf.resolveMode({
        ...sampleKyc,
        status: 'Sparat',
        signedAnswers: KycPdf.extractAnswersSnapshot({ ...sampleKyc, verksamhet: 'Äldre' }, {})
      }, {}),
      'Uppdatering'
    );
  });

  it('beräknar ändringar mellan snapshots', () => {
    const prev = KycPdf.extractAnswersSnapshot({ ...sampleKyc, kapitalUrsprung: '' }, fields);
    const curr = KycPdf.extractAnswersSnapshot(sampleKyc, fields);
    const diffs = KycPdf.diffAnswers(prev, curr);
    assert.ok(diffs.some((d) => d.label === 'Pengarnas ursprung'));
  });

  it('HTML följer designens sektioner utan riskinfo', () => {
    const html = KycPdf.buildKycIntygandePdfHtml({
      kyc: {
        ...sampleKyc,
        signedAnswers: KycPdf.extractAnswersSnapshot({ ...sampleKyc, kostnader: 'Gamla kostnader' }, fields),
        previousSigneringsdatum: '2025-01-15',
        inleedDokumentId: 'doc-123'
      },
      fields,
      byraNamn: 'Redovisningsbyrån Rydén & Co AB',
      byraEpost: 'info@exempel.se',
      byraTelefon: '08-123 45 67'
    });
    assert.match(html, /Kundkännedom – intygande/);
    assert.match(html, /Uppdatering/);
    assert.match(html, /Ändringar sedan förra intygandet/);
    assert.match(html, /1\. Företaget/);
    assert.match(html, /2\. Personer och ägare/);
    assert.match(html, /3\. Verksamheten/);
    assert.match(html, /4\. Pengar och betalningar/);
    assert.match(html, /5\. Intygande/);
    assert.match(html, /Elektroniskt med BankID/);
    assert.match(html, /Schibsted Grotesk/);
    assert.match(html, /penningtvättslagen/);
    assert.match(html, /info@exempel\.se/);
    assert.doesNotMatch(html, /högrisk|riskklass|residual|byråintern|Riskbedömning/i);
    assert.doesNotMatch(html, /#dc2626|#16a34a/); // ingen färgkodad Ja/Nej
    assert.match(html, /font-size:1[3-9]px|font-size:1[3-9]pt|font-size:14px/);
  });

  it('döljer ändringsruta för Ny kund', () => {
    const html = KycPdf.buildKycIntygandePdfHtml({
      kyc: sampleKyc,
      fields,
      byraNamn: 'Testbyrån AB'
    });
    assert.match(html, />Ny kund</);
    assert.doesNotMatch(html, /Ändringar sedan förra intygandet/);
  });

  it('attachSignedSnapshot sparar snapshot; previous först vid om-signering', () => {
    const first = KycPdf.attachSignedSnapshot(sampleKyc, fields, '2026-10-30');
    assert.equal(first.signeringsdatum, '2026-10-30');
    assert.equal(first.signedAnswers.foretagsnamn, 'Anoteket AB');
    assert.equal(first.previousSigneringsdatum, undefined);
    const second = KycPdf.attachSignedSnapshot(
      { ...first, kostnader: 'Nya kostnader' },
      fields,
      '2026-11-01'
    );
    assert.equal(second.previousSigneringsdatum, '2026-10-30');
    assert.equal(second.signedAnswers.kostnader, 'Nya kostnader');
  });

  it('bakåtkompatibel buildKycFormularPdfHtml', () => {
    const html = KycPdf.buildKycFormularPdfHtml(sampleKyc, 'Byrån AB', '', '2026-10-30', {
      fields,
      asBilaga: true
    });
    assert.match(html, /bilaga/);
    assert.match(html, /1\. Företaget/);
  });
});
