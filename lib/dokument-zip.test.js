const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const {
  sanitizeZipPart,
  uniqueZipPath,
  folderForField,
  listCustomerAttachmentRefs,
  resolveSelectedAttachments,
  planZipEntries,
  assignZipPaths,
  assembleZipFiles,
  CUSTOMER_MAX_FILES
} = require('./dokument-zip');

describe('dokument-zip', () => {
  it('sanerar sökvägar och gör filnamn unika', () => {
    assert.equal(sanitizeZipPart('BeLean AB / Risk.pdf'), 'BeLean AB - Risk.pdf');
    const used = new Set();
    assert.equal(uniqueZipPath(used, 'avtal.pdf'), 'avtal.pdf');
    assert.equal(uniqueZipPath(used, 'avtal.pdf'), 'avtal_2.pdf');
  });

  it('listar bilagor från kända dokumentfält', () => {
    const items = listCustomerAttachmentRefs({
      Dokumentation: [{ filename: 'kyc.pdf', url: 'https://example.com/kyc.pdf', size: 10 }],
      'Dokumentation - historik': [{ filename: 'old.pdf', url: 'https://example.com/old.pdf' }],
      Attachments: [{ filename: 'tom.pdf' }]
    });
    assert.equal(items.length, 2);
    assert.equal(items[0].sourceField, 'Dokumentation');
    assert.equal(folderForField('Dokumentation - historik'), 'Dokumentation - historik');
  });

  it('plockar bara valda index som finns', () => {
    const { resolved, missing } = resolveSelectedAttachments({
      Dokumentation: [
        { filename: 'a.pdf', url: 'https://example.com/a.pdf' },
        { filename: 'b.pdf', url: 'https://example.com/b.pdf' }
      ]
    }, [
      { sourceField: 'Dokumentation', sourceIndex: 1 },
      { sourceField: 'Dokumentation', sourceIndex: 9 }
    ]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].filename, 'b.pdf');
    assert.equal(missing.length, 1);
  });

  it('respekterar max antal och max storlek', () => {
    const planned = planZipEntries({
      files: [
        { filename: 'ok.pdf', size: 100 },
        { filename: 'stor.pdf', size: 99 * 1024 * 1024 },
        { filename: 'tre.pdf', size: 100 }
      ],
      maxFiles: 1,
      maxBytes: 1000
    });
    assert.equal(planned.included.length, 1);
    assert.equal(planned.included[0].filename, 'ok.pdf');
    assert.equal(planned.skipped.length, 2);
  });

  it('behåller kapslade mappar för byråexport', () => {
    const assigned = assignZipPaths([
      { filename: 'kyc.pdf', folder: 'BeLean AB/Dokumentation' },
      { filename: 'risk.pdf', folder: 'BeLean AB/Dokumentation riskbedomning' }
    ]);
    assert.equal(assigned[0].zipPath, 'BeLean AB/Dokumentation/kyc.pdf');
    assert.equal(assigned[1].zipPath, 'BeLean AB/Dokumentation riskbedomning/risk.pdf');
  });

  it('bygger en zip med unika sökvägar och översikt för hoppade filer', async () => {
    const assigned = assignZipPaths([
      { filename: 'avtal.pdf', folder: 'Uppdragsavtal' },
      { filename: 'avtal.pdf', folder: 'Uppdragsavtal' }
    ]);
    const result = await assembleZipFiles({
      planned: {
        included: assigned,
        skipped: [{ filename: 'stor.pdf', reason: 'för stor' }]
      },
      fetchBuffer: async (file) => Buffer.from(file.filename)
    });
    assert.equal(result.included, 2);
    const zip = new AdmZip(result.buffer);
    const names = zip.getEntries().map((e) => e.entryName);
    assert.ok(names.includes('Uppdragsavtal/avtal.pdf'));
    assert.ok(names.includes('Uppdragsavtal/avtal_2.pdf'));
    assert.ok(names.includes('_oversikt-hoppade.txt'));
    assert.ok(CUSTOMER_MAX_FILES >= 1);
  });
});
