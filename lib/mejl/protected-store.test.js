const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MEJL_PROTECTED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mejl-prot-'));
const store = require('./protected-store');

test('create + get protected message', () => {
  const created = store.createProtectedMessage({
    protectedText: 'Hemligt',
    files: [
      {
        name: 'a.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('hej').toString('base64')
      }
    ],
    subject: 'Test'
  });
  assert.ok(created.token);
  assert.equal(created.fileCount, 1);
  const rec = store.getProtectedMessage(created.token);
  assert.equal(rec.protectedText, 'Hemligt');
  const meta = store.publicMeta(rec);
  assert.equal(meta.files[0].name, 'a.txt');
  assert.ok(!meta.files[0].contentBase64);
});

test('tomt innehåll kastar', () => {
  assert.throws(
    () => store.createProtectedMessage({ protectedText: '', files: [] }),
    (err) => err.code === 'EMPTY_PROTECTED'
  );
});
