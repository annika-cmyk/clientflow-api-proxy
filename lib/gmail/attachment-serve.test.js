const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  safeFilename,
  normalizeDisposition,
  guessMimeType,
  canPreviewInline,
  findAttachmentMeta,
  contentDispositionHeader
} = require('./attachment-serve');

test('normalizeDisposition: default attachment, inline when asked', () => {
  assert.equal(normalizeDisposition(), 'attachment');
  assert.equal(normalizeDisposition('ATTACHMENT'), 'attachment');
  assert.equal(normalizeDisposition('inline'), 'inline');
  assert.equal(normalizeDisposition('Inline'), 'inline');
  assert.equal(normalizeDisposition('other'), 'attachment');
});

test('guessMimeType from extension and fallback', () => {
  assert.equal(guessMimeType('foto.JPG'), 'image/jpeg');
  assert.equal(guessMimeType('rapport.pdf'), 'application/pdf');
  assert.equal(guessMimeType('notes.txt'), 'text/plain');
  assert.equal(guessMimeType('weird.bin', 'application/pdf; charset=binary'), 'application/pdf');
  assert.equal(guessMimeType('x.dat'), 'application/octet-stream');
});

test('canPreviewInline for images, pdf, text – not office/svg', () => {
  assert.equal(canPreviewInline('image/png', 'a.png'), true);
  assert.equal(canPreviewInline('application/pdf', 'a.pdf'), true);
  assert.equal(canPreviewInline('text/plain', 'a.txt'), true);
  assert.equal(
    canPreviewInline(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'a.docx'
    ),
    false
  );
  assert.equal(canPreviewInline('image/svg+xml', 'a.svg'), false);
  assert.equal(canPreviewInline('', 'sheet.xlsx'), false);
});

test('findAttachmentMeta matchar attachmentId', () => {
  const atts = [
    { filename: 'a.pdf', attachmentId: 'att1', mimeType: 'application/pdf' },
    { filename: 'b.png', attachmentId: 'att2', mimeType: 'image/png' }
  ];
  assert.equal(findAttachmentMeta(atts, 'att2').filename, 'b.png');
  assert.equal(findAttachmentMeta(atts, 'missing'), null);
  assert.equal(findAttachmentMeta(null, 'att1'), null);
});

test('contentDispositionHeader inkl. UTF-8 filename*', () => {
  const att = contentDispositionHeader('faktura åäö.pdf', 'attachment');
  assert.match(att, /^attachment;/);
  assert.match(att, /filename\*=UTF-8''/);
  assert.match(att, /faktura/);

  const inline = contentDispositionHeader('bild.png', 'inline');
  assert.match(inline, /^inline;/);
  assert.equal(safeFilename('evil\r\n"name".pdf'), 'evilname.pdf');
});
