const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DateInput = require('../public/js/date-input');

describe('date-input', () => {
  it('godkänner giltiga ISO-datum', () => {
    assert.equal(DateInput.isValidDateIso('2024-02-06'), true);
    assert.equal(DateInput.isValidDateIso('2024-02-30'), false);
    assert.equal(DateInput.isValidDateIso('24-02-06'), false);
  });

  it('tolkar inskrivna datum med siffror, streck och slash', () => {
    assert.equal(DateInput.parseTypedDate('2024-02-06'), '2024-02-06');
    assert.equal(DateInput.parseTypedDate('20240206'), '2024-02-06');
    assert.equal(DateInput.parseTypedDate('2024/2/6'), '2024-02-06');
    assert.equal(DateInput.parseTypedDate('2024-2-6'), '2024-02-06');
    assert.equal(DateInput.parseTypedDate(''), '');
    assert.equal(DateInput.parseTypedDate('2024-02-30'), '');
  });

  it('formaterar medan man skriver', () => {
    assert.equal(DateInput.formatWhileTyping('2024'), '2024');
    assert.equal(DateInput.formatWhileTyping('202402'), '2024-02');
    assert.equal(DateInput.formatWhileTyping('20240206'), '2024-02-06');
    assert.equal(DateInput.formatWhileTyping('2024-02-06'), '2024-02-06');
  });
});
