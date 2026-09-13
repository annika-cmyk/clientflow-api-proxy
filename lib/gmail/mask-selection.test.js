/**
 * Tester för mask-selection (whitespace-normaliserad matchning HTML ↔ plain text).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findNormalizedRange,
  findNormalizedRangeInHtml,
  resolveMaskRanges
} = require('./mask-selection');

test('findNormalizedRange: exakt match', () => {
  const r = findNormalizedRange('abc hemligt 123 xyz', 'hemligt 123');
  assert.deepEqual(r, { start: 4, end: 15 });
});

test('findNormalizedRange: CRLF vs LF', () => {
  const plain = 'Hej\r\n\r\nVärlden och mer';
  const selected = 'Hej\n\nVärlden';
  const r = findNormalizedRange(plain, selected);
  assert.ok(r);
  assert.equal(plain.slice(r.start, r.end).replace(/\r\n/g, '\n'), 'Hej\n\nVärlden');
});

test('findNormalizedRange: HTML-vy mellanslag vs plain newlines', () => {
  const plain =
    'Ja det vore superkul att ses. Hör av dig när du ska till Växjö.\n\n' +
    'Sommaren var ganska lugn för vår del. Jag trivs att vara hemma :)';
  const selected =
    'Ja det vore superkul att ses. Hör av dig när du ska till Växjö.\n' +
    'Sommaren var ganska lugn för vår del. Jag trivs att vara hemma :)';
  const r = findNormalizedRange(plain, selected);
  assert.ok(r, 'ska hitta trots newline-skillnad');
  assert.ok(r.start >= 0 && r.end > r.start);
  assert.ok(plain.slice(r.start, r.end).includes('superkul'));
  assert.ok(plain.slice(r.start, r.end).includes('hemma'));
});

test('findNormalizedRange: nbsp och multi-space', () => {
  const plain = 'Belopp:\u00a0\u00a01\u00a0234 kr rest';
  const selected = 'Belopp: 1 234 kr';
  const r = findNormalizedRange(plain, selected);
  assert.ok(r);
  assert.ok(plain.slice(r.start, r.end).includes('234'));
});

test('findNormalizedRange: saknas → null', () => {
  assert.equal(findNormalizedRange('abc', 'xyz'), null);
  assert.equal(findNormalizedRange('abc', '   '), null);
});

test('findNormalizedRangeInHtml: text över taggar', () => {
  const html = '<p>Hej&nbsp;världen</p><p>Hemligt personnummer</p>';
  const r = findNormalizedRangeInHtml(html, 'Hej världen');
  assert.ok(r);
  assert.ok(html.slice(r.start, r.end).includes('Hej'));
  assert.ok(html.slice(r.start, r.end).includes('världen') || html.slice(r.start, r.end).includes('&nbsp;'));
});

test('findNormalizedRangeInHtml: längre markering över stycken', () => {
  const html =
    '<div>Ja det vore superkul att ses. Hör av dig när du ska till Växjö.</div>' +
    '<div><br></div>' +
    '<div>Sommaren var ganska lugn. Jag trivs att vara hemma :)</div>';
  const selected =
    'Ja det vore superkul att ses. Hör av dig när du ska till Växjö.\n\n' +
    'Sommaren var ganska lugn. Jag trivs att vara hemma :)';
  const r = findNormalizedRangeInHtml(html, selected);
  assert.ok(r);
  assert.ok(html.slice(r.start, r.end).includes('superkul'));
  assert.ok(html.slice(r.start, r.end).includes('hemma'));
});

test('resolveMaskRanges: HTML-vy → text + html ranges', () => {
  const plain =
    'Rad ett.\r\n\r\nPersonnummer 198001011234 finns här.\r\nKlar.';
  const html =
    '<p>Rad ett.</p><p>Personnummer 198001011234 finns här.</p><p>Klar.</p>';
  const selected = 'Personnummer 198001011234 finns här.';
  const result = resolveMaskRanges({ selectedText: selected, plainText: plain, html });
  assert.equal(result.error, undefined);
  assert.ok(result.ranges.some((r) => r.field === 'text'));
  assert.ok(result.ranges.some((r) => r.field === 'html'));
  const textR = result.ranges.find((r) => r.field === 'text');
  assert.ok(plain.slice(textR.start, textR.end).includes('198001011234'));
});

test('resolveMaskRanges: HTML-only (ingen plain text)', () => {
  const html = '<p>Hemligt: 190001019999</p>';
  const selected = 'Hemligt: 190001019999';
  const result = resolveMaskRanges({ selectedText: selected, plainText: '', html });
  assert.ok(result.ranges.length >= 1);
  assert.ok(result.bodyText.includes('190001019999'));
  assert.ok(result.ranges.some((r) => r.field === 'text'));
  assert.ok(result.ranges.some((r) => r.field === 'html'));
});

test('resolveMaskRanges: displayedText skiljer sig från plain', () => {
  const plain = 'Alpha\n\nBeta gamma delta';
  const displayed = 'Alpha\nBeta gamma delta';
  const selected = 'Beta gamma';
  const result = resolveMaskRanges({
    selectedText: selected,
    plainText: plain,
    displayedText: displayed
  });
  assert.ok(result.ranges.some((r) => r.field === 'text'));
  const textR = result.ranges.find((r) => r.field === 'text');
  assert.equal(plain.slice(textR.start, textR.end), 'Beta gamma');
});

test('resolveMaskRanges: empty / not found', () => {
  assert.equal(resolveMaskRanges({ selectedText: '  ' }).error, 'empty');
  assert.equal(
    resolveMaskRanges({ selectedText: 'xyz', plainText: 'abc' }).error,
    'not_found'
  );
});
