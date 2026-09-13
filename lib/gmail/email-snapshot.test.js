'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const snapshot = require('./email-snapshot');

describe('email-snapshot', () => {
  it('bygger html-filnamn', () => {
    const name = snapshot.buildEmailSnapshotFilename({
      subject: 'Re: Moms',
      date: '2026-09-13T10:00:00'
    });
    assert.equal(name, '2026-09-13_Re__Moms.html');
  });

  it('bygger läsbart HTML med ämne och body', () => {
    const html = snapshot.buildEmailSnapshotHtml({
      subject: 'Hej',
      from: 'a@b.se',
      to: 'c@d.se',
      cc: '',
      date: 'Mon, 13 Sep 2026',
      id: 'msg1',
      text: 'Brödtext här'
    });
    assert.ok(html.includes('clientflow-email-snapshot'));
    assert.ok(html.includes('Hej'));
    assert.ok(html.includes('a@b.se'));
    assert.ok(html.includes('Brödtext här'));
    assert.ok(html.includes('<!DOCTYPE html>'));
  });

  it('använder html-body när den finns', () => {
    const html = snapshot.buildEmailSnapshotHtml({
      subject: 'HTML',
      from: 'a@b.se',
      to: 'c@d.se',
      html: '<p>Hej <strong>dig</strong></p><script>alert(1)</script>'
    });
    assert.ok(html.includes('<strong>dig</strong>'));
    assert.ok(!html.includes('<script>'));
  });

  it('detekterar legacy txt-dump', () => {
    const text = snapshot.buildEmailSnapshotText({
      subject: 'Hej',
      from: 'a@b.se',
      to: 'c@d.se',
      date: 'Mon',
      id: 'msg1',
      text: 'Bröd'
    });
    assert.equal(snapshot.looksLikeEmailSnapshotText(text), true);
    const parsed = snapshot.parseEmailSnapshotText(text);
    assert.equal(parsed.subject, 'Hej');
    assert.equal(parsed.from, 'a@b.se');
    assert.equal(parsed.bodyText, 'Bröd');
  });

  it('renderar legacy preview html', () => {
    const parsed = snapshot.parseEmailSnapshotText(
      'Ämne: Test\nFrån: a@b.se\nTill: c@d.se\nKopia: \nDatum: idag\nGmail-id: x\n\n---\n\nHej kroppen'
    );
    const html = snapshot.renderEmailSnapshotPreviewHtml(parsed);
    assert.ok(html.includes('document-email-snapshot'));
    assert.ok(html.includes('Test'));
    assert.ok(html.includes('Hej kroppen'));
  });

  it('detekterar filnamn med deadline-prefix', () => {
    assert.equal(
      snapshot.looksLikeEmailSnapshotFilename('2028-06-15 - 2026-09-11_Inkomstdeklaration.html'),
      true
    );
    assert.equal(
      snapshot.looksLikeEmailSnapshotFilename('2028-06-15 - 2026-09-11_Inkomstdeklaration.txt'),
      true
    );
    assert.equal(snapshot.looksLikeEmailSnapshotFilename('2028-06-15 - faktura.pdf'), false);
  });
});
