const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildDigestEmail } = require('./email');

describe('digest email', () => {
  it('innehåller titel, sammanfattning, källänk och varför', () => {
    const mail = buildDigestEmail({
      byraNamn: 'Testbyrån',
      toName: 'Anna',
      feedUrl: 'https://www.app.clientflow.se/amla-nyheter.html',
      items: [{
        title: 'EU högrisklista',
        summary_sv: 'Kontrollera kundstocken mot den uppdaterade listan.',
        source_url: 'https://eur-lex.example/x',
        relevance_tier: 'high',
        severity: 'kraver_atgard',
        reasons: ['Rör högriskstater eller bevakade jurisdiktioner']
      }]
    });
    assert.match(mail.subject, /Testbyrån/);
    assert.match(mail.html, /EU högrisklista/);
    assert.match(mail.html, /https:\/\/eur-lex\.example\/x/);
    assert.match(mail.html, /högriskstater/);
    assert.match(mail.html, /amla-nyheter\.html/);
    assert.match(mail.text, /Varför/);
  });
});
