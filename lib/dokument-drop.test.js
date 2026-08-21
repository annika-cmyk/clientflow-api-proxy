const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const drop = require('../public/js/dokument-drop.js');

describe('dokument-drop', () => {
  it('accepterar PDF, Word, Excel och bilder', () => {
    assert.equal(drop.isAllowedDokumentFile({ name: 'avtal.pdf' }), true);
    assert.equal(drop.isAllowedDokumentFile({ name: 'brev.DOCX' }), true);
    assert.equal(drop.isAllowedDokumentFile({ name: 'spec.xlsx' }), true);
    assert.equal(drop.isAllowedDokumentFile({ name: 'kvitto.JPEG' }), true);
    assert.equal(drop.isAllowedDokumentFile({ name: 'anteckning.txt' }), false);
    assert.equal(drop.isAllowedDokumentFile({ name: 'arkiv.zip' }), false);
  });

  it('känner igen en fildragning från dataTransfer.types', () => {
    assert.equal(drop.hasFileDrag({ types: ['Files'] }), true);
    assert.equal(drop.hasFileDrag({ types: ['text/plain'] }), false);
    assert.equal(drop.hasFileDrag(null), false);
  });

  it('sorterar bort ogiltiga och för stora filer', () => {
    const { accepted, rejected } = drop.collectDroppedFiles([
      { name: 'risk.pdf', size: 1200 },
      { name: 'hemlig.exe', size: 10 },
      { name: 'stor.pdf', size: drop.MAX_BYTES + 1 }
    ]);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].name, 'risk.pdf');
    assert.equal(rejected.length, 2);
    assert.equal(rejected[0].reason, 'filtypen stöds inte');
    assert.equal(rejected[1].reason, 'för stor (max 10 MB)');
  });

  it('formaterar avvisade filer till en tydlig text', () => {
    const msg = drop.formatRejectedMessage([
      { name: 'a.txt', reason: 'filtypen stöds inte' }
    ]);
    assert.match(msg, /Hoppar över: a\.txt/);
    assert.match(msg, /PDF/);
    assert.equal(drop.formatRejectedMessage([]), '');
  });

  it('hittar kategori från närmaste drop-kort', () => {
    const card = {
      getAttribute(name) { return name === 'data-doc-category' ? 'historik' : ''; },
      closest(sel) { return sel === '[data-doc-category]' ? this : null; }
    };
    const root = { contains: (el) => el === card };
    assert.equal(drop.categoryFromDropTarget(card, root), 'historik');
    assert.equal(drop.categoryFromDropTarget({ closest: () => null }, root), null);
    assert.equal(drop.categoryFromDropTarget(card, { contains: () => false }), null);
  });
});
