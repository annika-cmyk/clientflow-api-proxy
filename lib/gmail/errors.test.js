const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyGmailError, needsGmailReconnect } = require('./errors');

describe('classifyGmailError', () => {
  it('mappar GMAIL_NOT_CONNECTED till 400', () => {
    const err = new Error('Gmail är inte kopplad');
    err.code = 'GMAIL_NOT_CONNECTED';
    const out = classifyGmailError(err);
    assert.equal(out.status, 400);
    assert.equal(out.code, 'GMAIL_NOT_CONNECTED');
  });

  it('mappar invalid_grant till reconnect 401', () => {
    const err = new Error('Request failed with status code 400');
    err.response = {
      status: 400,
      data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }
    };
    const out = classifyGmailError(err);
    assert.equal(out.status, 401);
    assert.equal(out.code, 'GMAIL_REAUTH_REQUIRED');
    assert.match(out.message, /Koppla Gmail igen/i);
  });

  it('mappar insufficient scopes till 403', () => {
    const err = new Error('Request failed with status code 403');
    err.response = {
      status: 403,
      data: {
        error: {
          message: 'Request had insufficient authentication scopes.'
        }
      }
    };
    const out = classifyGmailError(err);
    assert.equal(out.status, 403);
    assert.equal(out.code, 'GMAIL_INSUFFICIENT_SCOPE');
  });

  it('läcker inte rå axios-statusrad som error-text', () => {
    const err = new Error('Request failed with status code 500');
    err.response = { status: 500, data: {} };
    const out = classifyGmailError(err);
    assert.equal(out.status, 500);
    assert.equal(out.message, 'Kunde inte synka Gmail just nu.');
  });
});

describe('needsGmailReconnect', () => {
  it('är true för reconnect-koder', () => {
    assert.equal(needsGmailReconnect('GMAIL_REAUTH_REQUIRED'), true);
    assert.equal(needsGmailReconnect('GMAIL_NOT_CONNECTED'), true);
    assert.equal(needsGmailReconnect('GMAIL_SYNC_ERROR'), false);
  });
});
