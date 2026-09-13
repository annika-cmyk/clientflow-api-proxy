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
