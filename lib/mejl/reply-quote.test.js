'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatGmailAttributionSv,
  splitReplyAndQuote,
  normalizeReplyQuoteParts,
  parseFromHeader
} = require('./reply-quote');

test('parseFromHeader plockar namn och e-post', () => {
  assert.deepEqual(parseFromHeader('Maria Egonsdotter <maria.egonsdotter@gmail.com>'), {
    name: 'Maria Egonsdotter',
    email: 'maria.egonsdotter@gmail.com'
  });
  assert.deepEqual(parseFromHeader('maria@ex.com'), {
    name: '',
    email: 'maria@ex.com'
  });
});

test('formatGmailAttributionSv matchar svensk Gmail-rad', () => {
  // 2026-09-04 11:18 Europe/Stockholm (CEST = UTC+2)
  const line = formatGmailAttributionSv({
    from: 'Maria Egonsdotter <maria.egonsdotter@gmail.com>',
    date: '2026-09-04T09:18:00.000Z'
  });
  assert.equal(
    line,
    'Den fre 4 sep. 2026 kl 11:18 skrev Maria Egonsdotter <maria.egonsdotter@gmail.com>:'
  );
});

test('formatGmailAttributionSv använder tors (inte tor)', () => {
  const line = formatGmailAttributionSv({
    from: 'Maria Egonsdotter <maria.egonsdotter@gmail.com>',
    date: '2026-09-03T17:53:00.000Z' // 19:53 Stockholm
  });
  assert.match(line, /^Den tors 3 sep\. 2026 kl 19:53 skrev /);
});

test('splitReplyAndQuote delar vid första ---', () => {
  const { reply, quote, split } = splitReplyAndQuote('Hej!\n\n---\nOriginal\nrad 2');
  assert.equal(split, true);
  assert.equal(reply, 'Hej!\n');
  assert.equal(quote, 'Original\nrad 2');
});

test('normalizeReplyQuoteParts: explicit quotedText vinner', () => {
  const parts = normalizeReplyQuoteParts({
    publicText: 'Svar\n\n---\nignoreras',
    quotedText: 'Citat från fält'
  });
  assert.equal(parts.reply, 'Svar\n\n---\nignoreras');
  assert.equal(parts.quote, 'Citat från fält');
});
