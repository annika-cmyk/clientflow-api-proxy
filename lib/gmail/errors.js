/**
 * Klassificera Gmail/OAuth-fel till säkra HTTP-svar (inga stackar / råa axios-payloads).
 */

function googleErrorMessage(err) {
  const data = err && err.response && err.response.data;
  if (!data) return '';
  const e = data.error;
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (e.message) return String(e.message);
  if (e.error_description) return String(e.error_description);
  return '';
}

function classifyGmailError(err) {
  if (!err) {
    return {
      status: 500,
      code: 'GMAIL_SYNC_ERROR',
      message: 'Kunde inte synka Gmail just nu.'
    };
  }

  if (err.code === 'GMAIL_NOT_CONNECTED') {
    return {
      status: 400,
      code: 'GMAIL_NOT_CONNECTED',
      message: err.message || 'Gmail är inte kopplad'
    };
  }
  if (err.code === 'GMAIL_REAUTH_REQUIRED') {
    return {
      status: 401,
      code: 'GMAIL_REAUTH_REQUIRED',
      message: err.message || 'Gmail-sessionen har gått ut. Koppla Gmail igen.'
    };
  }
  if (err.code === 'GMAIL_INSUFFICIENT_SCOPE') {
    return {
      status: 403,
      code: 'GMAIL_INSUFFICIENT_SCOPE',
      message:
        err.message ||
        'Gmail saknar behörighet. Koppla Gmail igen och godkänn alla behörigheter.'
    };
  }
  if (err.code === 'GMAIL_TOKEN_STORE_ERROR') {
    return {
      status: 503,
      code: 'GMAIL_TOKEN_STORE_ERROR',
      message: err.message || 'Kunde inte läsa Gmail-koppling just nu.'
    };
  }

  const httpStatus = Number(err.response && err.response.status) || 0;
  const googleMsg = googleErrorMessage(err);
  const combined = `${googleMsg} ${err.message || ''} ${err.code || ''}`.toLowerCase();

  if (
    httpStatus === 401 ||
    combined.includes('invalid_grant') ||
    combined.includes('invalid_token') ||
    combined.includes('token has been expired or revoked') ||
    combined.includes('token has been revoked')
  ) {
    return {
      status: 401,
      code: 'GMAIL_REAUTH_REQUIRED',
      message: 'Gmail-sessionen har gått ut. Koppla Gmail igen.'
    };
  }

  if (
    httpStatus === 403 &&
    (combined.includes('insufficient') ||
      combined.includes('access_denied') ||
      combined.includes('access not configured') ||
      combined.includes('request had insufficient authentication scopes'))
  ) {
    return {
      status: 403,
      code: 'GMAIL_INSUFFICIENT_SCOPE',
      message: 'Gmail saknar behörighet. Koppla Gmail igen och godkänn alla behörigheter.'
    };
  }

  if (httpStatus === 429) {
    return {
      status: 429,
      code: 'GMAIL_RATE_LIMIT',
      message: 'Gmail är tillfälligt överbelastad. Försök igen strax.'
    };
  }

  if (combined.includes('google oauth är inte konfigurerad')) {
    return {
      status: 503,
      code: 'GMAIL_NOT_CONFIGURED',
      message: 'Gmail OAuth saknas på servern. Kontakta administratören.'
    };
  }

  const raw = String(err.message || '').trim();
  const looksLikeAxios =
    !raw ||
    /^request failed with status code/i.test(raw) ||
    /^timeout of \d+ms exceeded/i.test(raw);

  return {
    status: httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500,
    code: err.code || 'GMAIL_SYNC_ERROR',
    message: looksLikeAxios ? 'Kunde inte synka Gmail just nu.' : raw
  };
}

function needsGmailReconnect(code) {
  return (
    code === 'GMAIL_NOT_CONNECTED' ||
    code === 'GMAIL_REAUTH_REQUIRED' ||
    code === 'GMAIL_INSUFFICIENT_SCOPE'
  );
}

module.exports = {
  googleErrorMessage,
  classifyGmailError,
  needsGmailReconnect
};
