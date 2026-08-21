const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  guessContentType,
  canPreviewInline,
  inlineContentDisposition,
  pickAttachment
} = require('./document-preview');

describe('document-preview', () => {
  it('gissar innehållstyp från filnamn', () => {
    assert.equal(guessContentType('Riskbedomning.pdf'), 'application/pdf');
    assert.equal(guessContentType('bild.PNG'), 'image/png');
    assert.equal(guessContentType('anteckning.txt', 'text/plain; charset=utf-8'), 'text/plain');
    assert.equal(guessContentType('avtal.docx'), 'application/octet-stream');
  });

  it('låter PDF, bild och text förhandsgranskas', () => {
    assert.equal(canPreviewInline('a.pdf'), true);
    assert.equal(canPreviewInline('foto.jpg'), true);
    assert.equal(canPreviewInline('anteckning.txt'), true);
    assert.equal(canPreviewInline('avtal.docx'), false);
    assert.equal(canPreviewInline('underlag.zip'), false);
  });

  it('sätter Content-Disposition till inline', () => {
    assert.equal(inlineContentDisposition('BeLean AB - Riskbedömning.pdf'), 'inline; filename="BeLean AB - Riskbedömning.pdf"');
    assert.equal(inlineContentDisposition('rad\n"x".pdf'), 'inline; filename="radx.pdf"');
  });

  it('plockar rätt bilaga från kundfältet', () => {
    const fields = {
      Attachments: [
        { filename: 'a.pdf', url: 'https://example.com/a.pdf' },
        { filename: 'b.pdf', url: 'https://example.com/b.pdf' }
      ]
    };
    assert.equal(pickAttachment(fields, 'Attachments', 1).filename, 'b.pdf');
    assert.equal(pickAttachment(fields, 'Attachments', 9), null);
    assert.equal(pickAttachment(fields, '', 0), null);
  });
});
