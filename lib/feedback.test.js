const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FEEDBACK_TO,
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
    assert.match(mail.text, /Visa <script> mer tydligt/);
    assert.match(mail.html, /&lt;script&gt;/);
    assert.equal(mail.html.includes('<script>'), false);
    assert.match(mail.html, /Byrån AB/);
  });
});
