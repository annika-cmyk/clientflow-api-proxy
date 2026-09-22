'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRawMime,
  encodeSubject,
  encodeAddressHeader,
  encodeRfc2047
} = require('./mime');

function decodeRawMime(rawB64Url) {
  const b64 = String(rawB64Url)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64').toString('utf8');
}

function headerLine(mime, name) {
  const re = new RegExp(`^${name}:\\s*(.*)$`, 'im');
  const m = mime.match(re);
  return m ? m[1].trim() : null;
}

/** Enkel RFC 2047 B-dekoder för tester (UTF-8). Mellanslag mellan encoded-words ignoreras. */
function decodeRfc2047(value) {
  return String(value || '')
    .replace(/(\?=\s+=\?)/g, '?==?')
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b64) =>
      Buffer.from(b64, 'base64').toString('utf8')
    );
}

describe('encodeSubject / RFC 2047', () => {
  it('lämnar rent ASCII orört', () => {
    assert.equal(encodeSubject('Invoice reminder'), 'Invoice reminder');
  });

  it('kodar åäö i ämne som UTF-8 Base64 encoded-word', () => {
    const encoded = encodeSubject('kapitalförsäkring');
    assert.match(encoded, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    assert.equal(decodeRfc2047(encoded), 'kapitalförsäkring');
    assert.ok(isAsciiLine(encoded), 'encoded-word ska vara ASCII');
  });

  it('kodar Re: med svenska tecken korrekt', () => {
    const subject = 'Re: Faktura samt utdrag kapitalförsäkring';
    const encoded = encodeSubject(subject);
    assert.equal(decodeRfc2047(encoded), subject);
    assert.doesNotMatch(encoded, /[åäöÅÄÖ]/);
    assert.doesNotMatch(encoded, /Ã/);
  });

  it('delar upp långa ämnen i flera encoded-words under 75 tecken', () => {
    const subject = `ÅÄÖ ${'x'.repeat(80)} försäkring`;
    const encoded = encodeSubject(subject);
    const words = encoded.split(/\s+/);
    assert.ok(words.length >= 2);
    for (const w of words) {
      assert.ok(w.length <= 75, `encoded-word för lång: ${w.length}`);
    }
    assert.equal(decodeRfc2047(encoded), subject);
  });
});

describe('encodeAddressHeader', () => {
  it('lämnar ren e-postadress', () => {
    assert.equal(encodeAddressHeader('user@example.com'), 'user@example.com');
  });

  it('kodar display-namn med åäö', () => {
    const encoded = encodeAddressHeader('Björn Ärlig <bjorn@example.com>');
    assert.match(encoded, /^=\?UTF-8\?B\?.+\?= <bjorn@example.com>$/);
    assert.equal(decodeRfc2047(encoded.split(' <')[0]), 'Björn Ärlig');
  });

  it('lämnar ASCII-namn orört', () => {
    assert.equal(encodeAddressHeader('Annika <a@b.se>'), 'Annika <a@b.se>');
  });
});

describe('buildRawMime subject encoding', () => {
  it('Subject med åäö blir RFC 2047, inte rå UTF-8 / mojibake', () => {
    const subject = 'Re: Faktura samt utdrag kapitalförsäkring';
    const raw = buildRawMime({
      from: 'from@example.com',
      to: 'to@example.com',
      subject,
      text: 'Hej åäö'
    });
    const mime = decodeRawMime(raw);
    const subj = headerLine(mime, 'Subject');
    assert.ok(subj);
    assert.match(subj, /^=\?UTF-8\?B\?/i);
    assert.doesNotMatch(subj, /försäkring|ÃƒÂ¶|Ã¶/);
    assert.equal(decodeRfc2047(subj), subject);
    // Hela Subject-raden ska vara ASCII (inga råa UTF-8-bytes i headern)
    assert.ok(isAsciiLine(`Subject: ${subj}`));
  });

  it('body med åäö dekoderas korrekt (base64 UTF-8)', () => {
    const raw = buildRawMime({
      from: 'from@example.com',
      to: 'to@example.com',
      subject: 'Test',
      text: 'Hej åäö'
    });
    const mime = decodeRawMime(raw);
    assert.match(mime, /Content-Transfer-Encoding: base64/i);
    const bodyB64 = mime.split(/\r\n\r\n/).slice(1).join('\r\n\r\n').replace(/\s+/g, '');
    const text = Buffer.from(bodyB64, 'base64').toString('utf8');
    assert.equal(text, 'Hej åäö');
  });

  it('From/To med svenska namn kodas', () => {
    const raw = buildRawMime({
      from: 'Åke Öberg <ake@exempel.se>',
      to: 'Märit Älg <marit@exempel.se>',
      subject: 'Möte',
      text: 'Hej'
    });
    const mime = decodeRawMime(raw);
    assert.match(headerLine(mime, 'From'), /^=\?UTF-8\?B\?.+\?= <ake@exempel\.se>$/);
    assert.match(headerLine(mime, 'To'), /^=\?UTF-8\?B\?.+\?= <marit@exempel\.se>$/);
    assert.equal(decodeRfc2047(headerLine(mime, 'Subject')), 'Möte');
  });
});

describe('encodeRfc2047', () => {
  it('är idempotent för ASCII', () => {
    assert.equal(encodeRfc2047('hello'), 'hello');
  });
});

function isAsciiLine(s) {
  return /^[\x00-\x7F]*$/.test(s);
}
