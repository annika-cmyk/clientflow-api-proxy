const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { htmlToPlainText } = require('./html-plain-text');

describe('html-plain-text', () => {
  it('avkodar &nbsp; utan HTML-taggar', () => {
    assert.equal(
      htmlToPlainText('Inköp till djuren, skötsel av fastigheten.&nbsp;'),
      'Inköp till djuren, skötsel av fastigheten.'
    );
  });

  it('tar bort taggar och avkodar entiteter', () => {
    assert.equal(htmlToPlainText('<p>Hej&nbsp;världen</p>'), 'Hej världen');
  });

  it('lämnar vanlig text oförändrad', () => {
    assert.equal(htmlToPlainText('Ingen HTML här.'), 'Ingen HTML här.');
  });
});
