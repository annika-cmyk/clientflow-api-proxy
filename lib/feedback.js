/**
 * Feedback från dashboarden. Mejlet går till hej@clientflow.se.
 */
const FEEDBACK_TO = 'hej@clientflow.se';
const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 8;

const TYPES = {
  forslag: 'Förslag',
  problem: 'Problem',
  fraga: 'Fråga'
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeFeedback(body, user) {
  const rawType = String(body && body.type != null ? body.type : 'forslag').trim();
  const type = TYPES[rawType] ? rawType : 'forslag';
  return {
    type,
    typeLabel: TYPES[type],
    message: String(body && body.message != null ? body.message : '').trim(),
    name: String(user && user.name != null ? user.name : '').trim(),
    email: String(user && user.email != null ? user.email : '').trim(),
    byra: String(user && user.byra != null ? user.byra : '').trim()
  };
}

function validateFeedback(input) {
  if (!input || !input.message || input.message.length < MIN_MESSAGE) {
    return 'Skriv lite mer så vi förstår din feedback.';
  }
  if (input.message.length > MAX_MESSAGE) {
    return 'Feedbacken är för lång (max 4000 tecken).';
  }
  if (!input.email || !input.email.includes('@')) {
    return 'Din inloggade e-post saknas.';
  }
  return null;
}

function buildFeedbackEmail(input) {
  const who = input.name || input.email;
  const textLines = [
    `Typ: ${input.typeLabel}`,
    `Från: ${who} <${input.email}>`
  ];
  if (input.byra) textLines.push(`Byrå: ${input.byra}`);
  textLines.push('', input.message);
  const text = textLines.join('\n');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#15181d;background:#f5f6f8;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
    <tr><td>
      <p style="margin:0 0 8px;font-size:13px;color:#13505c;font-weight:600;">${escapeHtml(input.typeLabel)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
        Från <strong>${escapeHtml(who)}</strong>
        &lt;${escapeHtml(input.email)}&gt;${input.byra ? `<br>Byrå: ${escapeHtml(input.byra)}` : ''}
      </p>
      <p style="margin:0;font-size:15px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(input.message)}</p>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return {
    to: FEEDBACK_TO,
    replyTo: input.email,
    subject: `Feedback ClientFlow: ${input.typeLabel} från ${who}`,
    text,
    html
  };
}

module.exports = {
  FEEDBACK_TO,
  MAX_MESSAGE,
  TYPES,
  escapeHtml,
  normalizeFeedback,
  validateFeedback,
  buildFeedbackEmail
};
