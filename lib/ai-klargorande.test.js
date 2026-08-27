'use strict';

const assert = require('assert');
const aiKlargorande = require('./ai-klargorande');

assert.ok(aiKlargorande.getQuestions({ context: 'ar_beskrivning' }).length >= 2);
assert.ok(aiKlargorande.getQuestions({ context: 'ar_kartlaggning', section: 'kunder' }).length >= 2);
assert.ok(aiKlargorande.getQuestions({ context: 'rutin', fieldKey: 'kundkannedom' }).length >= 2);

const block = aiKlargorande.formatClarificationsBlock([
  { id: 'distans', question: 'Distanskunder?', answer: 'Ca 20 %' }
]);
assert.match(block, /Distanskunder\?/);
assert.match(block, /Ca 20 %/);
assert.equal(aiKlargorande.formatClarificationsBlock([]), '');

assert.equal(aiKlargorande.getTitle({ context: 'ar_kartlaggning', section: 'kunder' }), '2.1.2 Kunder');
assert.equal(aiKlargorande.getTitle({ context: 'rutin', fieldKey: 'kundkannedom' }), '3. Kundkännedomsåtgärder');

console.log('ai-klargorande.test.js: all tests passed');
