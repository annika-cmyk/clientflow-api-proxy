/**
 * Tester för Mejlarkiv access- och maskningsregler.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GMAIL_TOKEN_SECRET = process.env.GMAIL_TOKEN_SECRET || 'test-secret-mejlarkiv';
const archiveAccess = require('./archive-access');
const archiveSave = require('./archive-save');

const owner = { id: 'recOwner', role: 'Anställd', email: 'owner@byra.se' };
const colleague = { id: 'recCol', role: 'Anställd', email: 'col@byra.se' };
const sharedUser = { id: 'recShared', role: 'Anställd', email: 'shared@byra.se' };
const admin = { id: 'recAdmin', role: 'ClientFlowAdmin', email: 'admin@cf.se' };
const ledare = { id: 'recLed', role: 'Ledare', email: 'led@byra.se' };
const byraMail = {
  ownerUserId: 'recOwner', visibility: 'byra', sharedWith: [],
  bodyText: 'Hemligt personnummer 198001011234 finns här',
  bodyHtml: '<p>Hemligt</p>', maskedRanges: [], subject: 'Test', customerId: 'recCust'
};
const privatMail = { ...byraMail, visibility: 'privat', sharedWith: ['recShared'] };

test('byra-mejl syns för kollega', () => {
  assert.equal(archiveAccess.canViewArchivedMail(colleague, byraMail), true);
  assert.equal(archiveAccess.canViewArchivedMail(admin, byraMail), true);
});
test('privat mejl syns bara för ägare, delade och ClientFlowAdmin', () => {
  assert.equal(archiveAccess.canViewArchivedMail(owner, privatMail), true);
  assert.equal(archiveAccess.canViewArchivedMail(sharedUser, privatMail), true);
  assert.equal(archiveAccess.canViewArchivedMail(admin, privatMail), true);
  assert.equal(archiveAccess.canViewArchivedMail(colleague, privatMail), false);
  assert.equal(archiveAccess.canViewArchivedMail(ledare, privatMail), false);
});
test('omaskerad text endast för ägare och ClientFlowAdmin', () => {
  assert.equal(archiveAccess.canSeeUnmasked(owner, byraMail), true);
  assert.equal(archiveAccess.canSeeUnmasked(admin, byraMail), true);
  assert.equal(archiveAccess.canSeeUnmasked(colleague, byraMail), false);
});
test('maskning ersätter ranges för icke-ägare', () => {
  const masked = { ...byraMail, maskedRanges: [{ start: 20, end: 32, field: 'text' }] };
  const forColleague = archiveAccess.presentArchivedMail(colleague, masked);
  assert.equal(forColleague.masked, true);
  assert.ok(!forColleague.bodyText.includes('198001011234'));
  assert.ok(archiveAccess.presentArchivedMail(owner, masked).bodyText.includes('198001011234'));
});
test('mergeMaskedRanges slår ihop överlapp', () => {
  assert.deepEqual(
    archiveAccess.mergeMaskedRanges([{ start: 0, end: 5, field: 'text' }], [{ start: 3, end: 10, field: 'text' }, { start: 20, end: 25, field: 'text' }]),
    [{ start: 0, end: 10, field: 'text' }, { start: 20, end: 25, field: 'text' }]
  );
});
test('normalizeVisibility och parseSharedWith', () => {
  assert.equal(archiveAccess.normalizeVisibility('privat'), 'privat');
  assert.equal(archiveAccess.normalizeVisibility(''), 'byra');
  assert.deepEqual(archiveAccess.parseSharedWith(['recA', 'recB']), ['recA', 'recB']);
});
test('buildEmailSnapshotText', () => {
  const text = archiveSave.buildEmailSnapshotText({ subject: 'Hej', from: 'a@b.se', to: 'c@d.se', date: 'Mon', id: 'msg1', text: 'Bröd' });
  assert.ok(text.includes('Ämne: Hej') && text.includes('Bröd'));
});
test('collectAttachments i api', () => {
  const { collectAttachments, summarizeMessage } = require('./api');
  const raw = {
    id: 'm1', threadId: 't1', snippet: 'x',
    payload: {
      headers: [{ name: 'Subject', value: 'Med bilaga' }, { name: 'From', value: 'a@b.se' }, { name: 'To', value: 'c@d.se' }],
      parts: [
        { mimeType: 'text/plain', body: { data: Buffer.from('hej').toString('base64') } },
        { filename: 'faktura.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att1', size: 100 } }
      ]
    }
  };
  assert.equal(collectAttachments(raw.payload).length, 1);
  assert.equal(summarizeMessage(raw).attachments[0].filename, 'faktura.pdf');
});
