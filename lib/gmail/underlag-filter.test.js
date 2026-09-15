const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isUnderlagEmail,
  isUnderlagRecipientMessage,
  collectRecipientEmails
} = require('./underlag-filter');

describe('underlag-filter', () => {
  it('känner igen underlag@-adresser', () => {
    assert.equal(isUnderlagEmail('underlag@rydenredovisning.se'), true);
    assert.equal(isUnderlagEmail('Underlag@RydenRedovisning.se'), true);
    assert.equal(isUnderlagEmail('annika@rydenredovisning.se'), false);
    assert.equal(isUnderlagEmail('support-underlag@x.se'), false);
  });

  it('plockar mottagare från to/cc', () => {
    const emails = collectRecipientEmails({
      to: 'Underlag <underlag@rydenredovisning.se>',
      cc: 'Anna <anna@x.se>'
    });
    assert.ok(emails.includes('underlag@rydenredovisning.se'));
    assert.ok(emails.includes('anna@x.se'));
  });

  it('markerar mejl till underlag@ som underlagsmejl', () => {
    assert.equal(
      isUnderlagRecipientMessage({
        to: 'underlag@rydenredovisning.se',
        from: 'kund@exempel.se'
      }),
      true
    );
    assert.equal(
      isUnderlagRecipientMessage({
        to: 'annika@rydenredovisning.se',
        from: 'kund@exempel.se'
      }),
      false
    );
  });
});
