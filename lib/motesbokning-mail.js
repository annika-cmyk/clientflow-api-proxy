/**
 * Bekräftelse- och påminnelsemejl för mötesbokning.
 */
const nodemailer = require('nodemailer');

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createSmtpTransportOrNull() {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const passRaw = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  const pass = typeof passRaw === 'string' ? passRaw.replace(/^["']|["']$/g, '').trim() : '';
  if (!host || !user || !pass) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const transporterOpts = { host, port, secure, auth: { user, pass } };
  if (port === 587 && !secure) transporterOpts.requireTLS = true;
  return nodemailer.createTransport(transporterOpts);
}

/** T.ex. "09:15–10:15 · onsdag 21/10 2026" */
function fmtMeetingWhenSv(startIso, endIso) {
  const s = new Date(Date.parse(startIso));
  const e = endIso ? new Date(Date.parse(endIso)) : null;
  if (!Number.isFinite(s.getTime())) return String(startIso || '');
  const optsDate = { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Stockholm' };
  const optsTime = { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' };
  const date = s.toLocaleDateString('sv-SE', optsDate);
  const t1 = s.toLocaleTimeString('sv-SE', optsTime);
  const t2 = e && Number.isFinite(e.getTime()) ? e.toLocaleTimeString('sv-SE', optsTime) : '';
  return t2 ? `${t1}–${t2} · ${date}` : `${t1} · ${date}`;
}

function locationLine(location, meetingType) {
  const loc = String(location || '').trim();
  const type = String(meetingType || '').trim();
  if (loc) return loc;
  if (type === 'Telefon') return 'Telefon';
  if (type === 'På plats') return 'På plats';
  return 'Google Meet / distans';
}

function manageUrl(baseUrl, token) {
  const base = String(baseUrl || '').replace(/\/$/, '') || 'https://www.app.clientflow.se';
  return `${base}/boka-mote.html?hantera=${encodeURIComponent(token)}`;
}

function buildMeetingMail({
  kind,
  hostName,
  bookerName,
  title,
  start,
  end,
  location,
  meetingType,
  agenda,
  manageLink
}) {
  const host = String(hostName || 'värden').trim() || 'värden';
  const guest = String(bookerName || 'gästen').trim() || 'gästen';
  const when = fmtMeetingWhenSv(start, end);
  const where = locationLine(location, meetingType);
  const agendaText = String(agenda || '').trim();
  const titleText = String(title || 'Möte').trim() || 'Möte';
  const isReminder = kind === 'reminder';

  const subject = isReminder
    ? `Påminnelse: ${titleText} börjar om en timme`
    : `Bekräftelse: ${titleText}`;

  const intro = isReminder
    ? `Hej! Detta är en automatisk påminnelse om att mötet mellan ${guest} och ${host} börjar om en timme.`
    : `Hej! Mötet mellan ${guest} och ${host} är bokat.`;

  const lines = [
    intro,
    '',
    `Tid: ${when}`,
    `Plats: ${where}`,
    titleText !== 'Möte' ? `Möte: ${titleText}` : '',
    agendaText ? `Agenda:\n${agendaText}` : '',
    '',
    manageLink
      ? `Avboka, omboka eller justera agendan här:\n${manageLink}`
      : ''
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));

  const text = lines.join('\n').trim() + '\n';

  const agendaHtml = agendaText
    ? `<p><strong>Agenda</strong></p><p style="white-space:pre-wrap;">${esc(agendaText)}</p>`
    : '';
  const manageHtml = manageLink
    ? `<p><a href="${esc(manageLink)}" style="display:inline-block;padding:10px 16px;background:#13505c;color:#fff;text-decoration:none;border-radius:8px;">Hantera bokning (av-/omboka / agenda)</a></p>
<p style="font-size:0.9rem;color:#64748b;">Om knappen inte fungerar: ${esc(manageLink)}</p>`
    : '';

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5;">
<p>${esc(intro)}</p>
<p><strong>Tid:</strong> ${esc(when)}<br>
<strong>Plats:</strong> ${esc(where)}${titleText !== 'Möte' ? `<br><strong>Möte:</strong> ${esc(titleText)}` : ''}</p>
${agendaHtml}
${manageHtml}
</body></html>`;

  return { subject, text, html };
}

async function sendMeetingMails({
  recipients,
  kind,
  hostName,
  bookerName,
  title,
  start,
  end,
  location,
  meetingType,
  agenda,
  manageLink,
  transporter
}) {
  const transport = transporter || createSmtpTransportOrNull();
  if (!transport) return { sent: 0, errors: ['SMTP är inte konfigurerad på servern.'] };
  const from = process.env.MAIL_FROM || 'ClientFlow <noreply@clientflow.se>';
  const content = buildMeetingMail({
    kind,
    hostName,
    bookerName,
    title,
    start,
    end,
    location,
    meetingType,
    agenda,
    manageLink
  });
  const uniq = [...new Set(
    (recipients || [])
      .map((r) => String(r || '').trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  )];
  const errors = [];
  let sent = 0;
  for (const to of uniq) {
    try {
      await transport.sendMail({
        from,
        to,
        subject: content.subject,
        text: content.text,
        html: content.html
      });
      sent += 1;
    } catch (err) {
      errors.push(`${to}: ${err.message || 'fel'}`);
    }
  }
  return { sent, errors, subject: content.subject };
}

/** Lucka för 1h-påminnelse vid timvis körning (ca 50–125 min före start). */
function shouldSendHourReminder(bookedStartIso, nowMs = Date.now()) {
  const startMs = Date.parse(bookedStartIso);
  if (!Number.isFinite(startMs)) return false;
  const until = startMs - nowMs;
  return until >= 50 * 60 * 1000 && until <= 125 * 60 * 1000;
}

module.exports = {
  esc,
  fmtMeetingWhenSv,
  locationLine,
  manageUrl,
  buildMeetingMail,
  sendMeetingMails,
  shouldSendHourReminder,
  createSmtpTransportOrNull
};
