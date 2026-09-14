/**
 * Tester för Delat med mig-listning (sharedWith + kundaccess).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GMAIL_TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET || 'test-secret-shared-with-me';

const archiveAccess = require('./archive-access');

test('isSharedWith matchar endast exakt user-id i Shared With', () => {
  const record = {
    sharedWith: ['recJohanna', 'recOther'],
    visibility: 'privat',
    ownerUserId: 'recOwner'
  };
  assert.equal(archiveAccess.isSharedWith({ id: 'recJohanna' }, record), true);
  assert.equal(archiveAccess.isSharedWith({ id: 'recJohannaXX' }, record), false);
  assert.equal(archiveAccess.isSharedWith({ id: 'recOwner' }, record), false);
});

test('presentArchivedMail behåller sharedWith för mottagare', () => {
  const record = {
    id: 'recA',
    customerId: 'recCust',
    gmailMessageId: 'msg1',
    visibility: 'privat',
    sharedWith: ['recJohanna'],
    ownerUserId: 'recOwner',
    subject: 'Hej',
    from: 'a@b.se',
    bodyText: 'hemligt 198001011234',
    maskedRanges: [{ start: 8, end: 20, field: 'text' }]
  };
  const johanna = { id: 'recJohanna', role: 'Användare' };
  const presented = archiveAccess.presentArchivedMail(johanna, record);
  assert.equal(presented.sharedWith[0], 'recJohanna');
  assert.equal(presented.isOwner, false);
  assert.equal(presented.canEdit, false);
  assert.ok(presented.bodyText.includes('█'));
  assert.equal(archiveAccess.canViewArchivedMail(johanna, record), true);
});
