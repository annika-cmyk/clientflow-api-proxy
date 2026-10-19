const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { serializeGmailParams, listAllMessages } = require('./api');

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

describe('listAllMessages', () => {
  it('paginerar tills nextPageToken tar slut eller maxResults nås', async () => {
    let calls = 0;
    const axiosGet = mock.method(axios, 'get', async (url, opts) => {
      calls += 1;
      const params = opts && opts.params ? opts.params : {};
      if (calls === 1) {
        assert.equal(params.pageToken, undefined);
        return {
          data: {
            messages: [{ id: 'a' }, { id: 'b' }],
            nextPageToken: 'page2',
            resultSizeEstimate: 4
          }
        };
      }
      assert.equal(params.pageToken, 'page2');
      return {
        data: {
          messages: [{ id: 'c' }, { id: 'd' }],
          resultSizeEstimate: 4
        }
      };
    });
    try {
      const listed = await listAllMessages('token', {
        q: 'label:KUNDER newer_than:30d',
        maxResults: 10,
        pageSize: 2
      });
      assert.equal(calls, 2);
      assert.equal(listed.messages.length, 4);
      assert.deepEqual(
        listed.messages.map((m) => m.id),
        ['a', 'b', 'c', 'd']
      );
      assert.equal(listed.pages, 2);
    } finally {
      axiosGet.mock.restore();
    }
  });

  it('stoppar vid maxResults även om fler sidor finns', async () => {
    let calls = 0;
    const axiosGet = mock.method(axios, 'get', async () => {
      calls += 1;
      return {
        data: {
          messages: [{ id: `m${calls}a` }, { id: `m${calls}b` }],
          nextPageToken: 'more',
          resultSizeEstimate: 100
        }
      };
    });
    try {
      const listed = await listAllMessages('token', {
        q: 'label:KUNDER',
        maxResults: 3,
        pageSize: 2
      });
      assert.equal(listed.messages.length, 3);
      assert.ok(calls >= 2);
    } finally {
      axiosGet.mock.restore();
    }
  });
});
