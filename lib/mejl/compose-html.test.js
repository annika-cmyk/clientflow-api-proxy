const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOutgoingHtml, buildOutgoingText } = require('./compose-html');
const { encodeQuestions } = require('../samarbete-fragor');

test('buildOutgoingHtml inkluderar offentlig text, BankID-länk och sidfot', () => {
  const html = buildOutgoingHtml({
    publicText: 'Hej kund\n\nHär är öppet.',
    protectedUrl: 'https://example.com/mejl-skyddad.html?token=abc',
    protectedHasText: true,
    protectedFileCount: 2,
    signatureSettings: { name: 'Annika', phone: '070' }
  });
  assert.match(html, /Här är öppet/);
  assert.match(html, /BankID-skyddat/);
  assert.match(html, /mejl-skyddad\.html\?token=abc/);
  assert.match(html, /Annika/);
});

test('buildOutgoingHtml med samarbete-frågor', () => {
  const title = encodeQuestions([
    { text: 'Kontoutdrag', fileRequired: true },
    { text: 'Personuppgifter', requiresBankId: true }
  ]);
  const html = buildOutgoingHtml({
    publicText: 'Hej',
    samarbeteUrl: 'https://example.com/samarbete-svar.html?token=x',
    samarbeteTitle: title
  });
  assert.match(html, /Kontoutdrag/);
  assert.match(html, /BankID/);
  assert.match(html, /Lämna svar/);
});

test('buildOutgoingText innehåller länkar', () => {
  const text = buildOutgoingText({
    publicText: 'Hej',
    protectedUrl: 'https://x/p',
    samarbeteUrl: 'https://x/s',
    signatureSettings: { name: 'Ada' }
  });
  assert.match(text, /Hej/);
  assert.match(text, /https:\/\/x\/p/);
  assert.match(text, /Ada/);
});

test('svar: sidfot före citat och svensk skrev-rad', () => {
  const opts = {
    publicText: 'Hej Maria!\n\nTack.\nMvh Annika\n\n---\nHej Annika!\nOriginaltext',
    quoteFrom: 'Maria Egonsdotter <maria.egonsdotter@gmail.com>',
    quoteDate: '2026-09-04T09:18:00.000Z',
    signatureSettings: { name: 'Annika Rydén', title: 'Redovisningskonsult' }
  };
  const html = buildOutgoingHtml(opts);
  const text = buildOutgoingText(opts);

  const idxReply = html.indexOf('Hej Maria');
  const idxSig = html.indexOf('Annika Rydén');
  const idxAttr = html.indexOf('Den fre 4 sep. 2026 kl 11:18 skrev Maria Egonsdotter');
  const idxQuote = html.indexOf('Originaltext');
  assert.ok(idxReply >= 0 && idxSig >= 0 && idxAttr >= 0 && idxQuote >= 0);
  assert.ok(idxReply < idxSig, 'svar före sidfot');
  assert.ok(idxSig < idxAttr, 'sidfot före citatrad');
  assert.ok(idxAttr < idxQuote, 'citatrad före original');
  assert.match(html, /<blockquote/);
  assert.ok(!html.includes('---'), '--- ska inte finnas kvar i utgående HTML');

  const tReply = text.indexOf('Hej Maria');
  const tSig = text.indexOf('Annika Rydén');
  const tAttr = text.indexOf(
    'Den fre 4 sep. 2026 kl 11:18 skrev Maria Egonsdotter <maria.egonsdotter@gmail.com>:'
  );
  const tQuote = text.indexOf('> Originaltext');
  assert.ok(tReply < tSig && tSig < tAttr && tAttr < tQuote);
});

test('nytt mejl: sidfot sist utan citatrad', () => {
  const html = buildOutgoingHtml({
    publicText: 'Hej, nytt mejl.',
    signatureSettings: { name: 'Annika' }
  });
  assert.match(html, /Hej, nytt mejl/);
  assert.match(html, /Annika/);
  assert.equal(html.includes('skrev'), false);
  assert.equal(html.includes('<blockquote'), false);

  const text = buildOutgoingText({
    publicText: 'Hej, nytt mejl.',
    signatureSettings: { name: 'Annika' }
  });
  assert.ok(text.endsWith('Annika') || text.trim().endsWith('Annika'));
  assert.equal(text.includes('skrev'), false);
});

test('svar med explicit quotedText: samma ordning', () => {
  const text = buildOutgoingText({
    publicText: 'Mitt svar',
    quotedText: 'Gammal text',
    quoteFrom: 'Ada Lovelace <ada@example.com>',
    quoteDate: '2026-09-04T09:18:00.000Z',
    signatureSettings: { name: 'Annika' }
  });
  const iReply = text.indexOf('Mitt svar');
  const iSig = text.indexOf('Annika');
  const iAttr = text.indexOf('skrev Ada Lovelace <ada@example.com>:');
  const iQuote = text.indexOf('> Gammal text');
  assert.ok(iReply < iSig && iSig < iAttr && iAttr < iQuote);
});
