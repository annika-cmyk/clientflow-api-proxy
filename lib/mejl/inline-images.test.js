'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rewriteDataImagesToCid, parseDataImageUrl } = require('./inline-images');
const { buildOutgoingEmail } = require('./compose-html');
const { buildRawMime } = require('../gmail/mime');

describe('mejl inline images + MIME', () => {
  it('parsars data-URL', () => {
    const p = parseDataImageUrl('data:image/png;base64,aaa');
    assert.equal(p.contentType, 'image/png');
    assert.equal(p.dataBase64, 'aaa');
  });

  it('byter data:image till cid i HTML', () => {
    const html = '<div><img src="data:image/jpeg;base64,/9j/4AAQ" alt="" /></div>';
    const out = rewriteDataImagesToCid(html);
    assert.match(out.html, /cid:cf-sig-1@clientflow\.local/);
    assert.equal(out.inlineImages.length, 1);
    assert.equal(out.inlineImages[0].contentType, 'image/jpeg');
  });

  it('buildOutgoingEmail ger cid och inlineImages för sidfot med bild', () => {
    const built = buildOutgoingEmail({
      publicText: 'Hej',
      signatureSettings: {
        name: 'Annika',
        image1DataUrl: 'data:image/png;base64,iVBORw0KGgo='
      }
    });
    assert.equal(built.signatureAttached, true);
    assert.match(built.html, /Annika/);
    assert.match(built.html, /cid:cf-sig-/);
    assert.ok(built.inlineImages.length >= 1);
  });

  it('buildRawMime använder UTF-8 base64 och multipart/related för inline-bilder', () => {
    const b64url = buildRawMime({
      from: 'a@b.se',
      to: 'c@d.se',
      subject: 'Test åäö',
      text: 'Hej åäö',
      html: '<p>Hej</p><img src="cid:cf-sig-1@clientflow.local" />',
      inlineImages: [
        { cid: 'cf-sig-1@clientflow.local', contentType: 'image/png', dataBase64: 'aaa' }
      ]
    });
    const raw = Buffer.from(b64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    assert.match(raw, /multipart\/related/);
    assert.match(raw, /multipart\/alternative/);
    assert.match(raw, /Content-Transfer-Encoding: base64/);
    assert.match(raw, /Content-ID: <cf-sig-1@clientflow\.local>/);
    assert.match(raw, /charset="UTF-8"/);
    assert.doesNotMatch(raw, /Content-Transfer-Encoding: 7bit/);
  });
});
