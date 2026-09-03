const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FEEDBACK_TO,
  FEEDBACK_TO_RESIDUAL,
  normalizeFeedback,
  validateFeedback,
  buildFeedbackEmail
} = require('./feedback');

describe('feedback', () => {
  it('normaliserar typ och trimmar text', () => {
    const input = normalizeFeedback(
      { type: 'problem', message: '  Knappen sparar inte.  ' },
      { name: 'Annika Test', email: 'annika@example.com', byra: 'Testbyrån' }
    );
    assert.equal(input.type, 'problem');
    assert.equal(input.typeLabel, 'Problem');
    assert.equal(input.source, 'dashboard');
    assert.equal(input.message, 'Knappen sparar inte.');
    assert.equal(validateFeedback(input), null);
  });

  it('avvisar för kort meddelande och saknad e-post', () => {
    assert.match(validateFeedback(normalizeFeedback({ message: 'Hej' }, { email: 'a@b.se' })), /lite mer/);
    assert.match(validateFeedback(normalizeFeedback({ message: 'Det här är tillräckligt långt.' }, {})), /e-post/);
  });

  it('bygger mejl till hej@clientflow.se med reply-to och escaped HTML', () => {
    const input = normalizeFeedback(
      { type: 'forslag', message: 'Visa <script> mer tydligt i listan.' },
      { name: 'Annika', email: 'annika@byran.se', byra: 'Byrån AB' }
    );
    const mail = buildFeedbackEmail(input);
    assert.equal(mail.to, FEEDBACK_TO);
    assert.equal(mail.to, 'hej@clientflow.se');
    assert.equal(mail.replyTo, 'annika@byran.se');
    assert.match(mail.subject, /Förslag från Annika/);
    assert.match(mail.subject, /\(Byrån AB\)/);
    assert.match(mail.text, /Visa <script> mer tydligt/);
    assert.match(mail.html, /&lt;script&gt;/);
    assert.equal(mail.html.includes('<script>'), false);
    assert.match(mail.html, /Byrån AB/);
  });

  it('skickar residualrisk-feedback till feedback@clientflow.se med byrå och tjänst', () => {
    const input = normalizeFeedback(
      {
        source: 'residualrisk',
        message: 'Residualbedömningen känns otydlig för bokslut.',
        tjanstNamn: 'Bokslut'
      },
      {
        name: 'Erik Exempel',
        email: 'erik@byran.se',
        byra: 'Exempelbyrån AB',
        byraId: 'recByra123'
      }
    );
    assert.equal(input.source, 'residualrisk');
    assert.equal(validateFeedback(input), null);
    const mail = buildFeedbackEmail(input);
    assert.equal(mail.to, FEEDBACK_TO_RESIDUAL);
    assert.equal(mail.to, 'feedback@clientflow.se');
    assert.equal(mail.replyTo, 'erik@byran.se');
    assert.match(mail.subject, /Residualrisk från Erik Exempel/);
    assert.match(mail.subject, /Exempelbyrån AB/);
    assert.match(mail.text, /Byrå: Exempelbyrån AB/);
    assert.match(mail.text, /Byrå-ID: recByra123/);
    assert.match(mail.text, /Tjänst: Bokslut/);
    assert.match(mail.html, /Exempelbyrån AB/);
    assert.match(mail.html, /Bokslut/);
  });

  it('okänd source faller tillbaka till dashboard', () => {
    const input = normalizeFeedback(
      { source: 'unknown', message: 'Det här är tillräckligt långt.' },
      { email: 'a@b.se', name: 'A' }
    );
    assert.equal(input.source, 'dashboard');
    assert.equal(buildFeedbackEmail(input).to, FEEDBACK_TO);
  });
});
