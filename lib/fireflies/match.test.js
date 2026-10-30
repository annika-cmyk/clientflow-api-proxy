const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { collectParticipantEmails, matchCustomerFromTranscript } = require('./match');

describe('fireflies match', () => {
  it('samlar deltagar-e-post', () => {
    const emails = collectParticipantEmails({
      organizer_email: 'annika@byra.se',
      participants: ['kund@acme.se', 'annika@byra.se'],
      meeting_attendees: [{ email: 'ekonomi@acme.se', displayName: 'Ekonomi' }]
    });
    assert.deepEqual(emails.sort(), ['annika@byra.se', 'ekonomi@acme.se', 'kund@acme.se']);
  });

  it('matchar unik kund via e-post och ignorerar organizer', () => {
    const hit = matchCustomerFromTranscript({
      transcript: {
        organizer_email: 'annika@byra.se',
        participants: ['kund@acme.se', 'annika@byra.se']
      },
      customers: [
        { id: 'rec1', namn: 'Acme AB', orgnr: '5566778899', emails: ['kund@acme.se'] },
        { id: 'rec2', namn: 'Annan AB', orgnr: '1122334455', emails: ['info@annan.se'] }
      ],
      ignoreEmails: ['annika@byra.se']
    });
    assert.ok(hit);
    assert.equal(hit.customer.id, 'rec1');
    assert.equal(hit.matchedEmail, 'kund@acme.se');
  });

  it('returnerar null vid flera kundträffar', () => {
    const hit = matchCustomerFromTranscript({
      transcript: {
        organizer_email: 'annika@byra.se',
        participants: ['a@acme.se', 'b@beta.se']
      },
      customers: [
        { id: 'rec1', namn: 'Acme', emails: ['a@acme.se'] },
        { id: 'rec2', namn: 'Beta', emails: ['b@beta.se'] }
      ],
      ignoreEmails: ['annika@byra.se']
    });
    assert.equal(hit, null);
  });
});
