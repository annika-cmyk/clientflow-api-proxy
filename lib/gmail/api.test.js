const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { serializeGmailParams } = require('./api');

describe('serializeGmailParams', () => {
  it('serialiserar arrayer som upprepade nycklar utan brackets', () => {
    const qs = serializeGmailParams({
      historyTypes: ['messageAdded', 'messageDeleted'],
      labelIds: ['Label_1'],
      maxResults: 50
    });
    assert.match(qs, /historyTypes=messageAdded/);
    assert.match(qs, /historyTypes=messageDeleted/);
    assert.match(qs, /labelIds=Label_1/);
    assert.match(qs, /maxResults=50/);
    assert.doesNotMatch(qs, /historyTypes%5B%5D|labelIds%5B%5D|historyTypes\[\]|labelIds\[\]/);
  });

  it('hoppar över null/undefined', () => {
    const qs = serializeGmailParams({ q: 'label:KUNDER', pageToken: null, foo: undefined });
    assert.equal(qs, 'q=label%3AKUNDER');
  });
});
