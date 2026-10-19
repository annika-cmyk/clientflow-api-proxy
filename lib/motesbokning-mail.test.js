const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMeetingMail,
  manageUrl,
  shouldSendHourReminder,
  locationLine
} = require('./motesbokning-mail');

describe('motesbokning-mail', () => {
  it('buildMeetingMail påminnelse innehåller namn, tid, telefon och hanteralänk', () => {
    const mail = buildMeetingMail({
      kind: 'reminder',
      hostName: 'Annika Rydén',
      bookerName: 'Erik Kund',
      title: 'Bokslutsmöte',
      start: '2026-10-21T07:15:00.000Z',
      end: '2026-10-21T08:15:00.000Z',
      location: 'Klövervägen 41, 341 38 LJUNGBY',
      meetingType: 'På plats',
      hostPhone: '070-246 29 21',
      bookerPhone: '070-111 22 33',
      agenda: 'Gå igenom årsbokslut',
      manageLink: 'https://www.app.clientflow.se/boka-mote.html?hantera=abc'
    });
    assert.match(mail.subject, /Påminnelse/);
    assert.match(mail.text, /Erik Kund/);
    assert.match(mail.text, /Annika Rydén/);
    assert.match(mail.text, /börjar om en timme/);
    assert.match(mail.text, /Klövervägen 41/);
    assert.match(mail.text, /Värdens telefon: 070-246 29 21/);
    assert.match(mail.text, /Bokarens telefon: 070-111 22 33/);
    assert.match(mail.text, /Gå igenom årsbokslut/);
    assert.match(mail.text, /hantera=abc/);
    assert.match(mail.html, /Hantera bokning/);
  });

  it('buildMeetingMail bekräftelse', () => {
    const mail = buildMeetingMail({
      kind: 'confirmation',
      hostName: 'Annika',
      bookerName: 'Erik',
      title: 'Möte',
      start: '2026-10-21T07:15:00.000Z',
      end: '2026-10-21T08:15:00.000Z',
      location: 'Telefon',
      meetingType: 'Telefon',
      hostPhone: '070-246 29 21',
      bookerPhone: '070-111 22 33',
      manageLink: 'https://example.com/boka-mote.html?hantera=x'
    });
    assert.match(mail.subject, /Bekräftelse/);
    assert.match(mail.text, /är bokat/);
    assert.match(mail.text, /Värdens telefon/);
    assert.match(mail.text, /Bokarens telefon/);
  });

  it('manageUrl bygger hantera-query', () => {
    assert.equal(
      manageUrl('https://www.app.clientflow.se/', 'tok123'),
      'https://www.app.clientflow.se/boka-mote.html?hantera=tok123'
    );
  });

  it('shouldSendHourReminder i fönstret 50–125 min', () => {
    const start = Date.parse('2026-10-21T10:00:00.000Z');
    assert.equal(shouldSendHourReminder(new Date(start).toISOString(), start - 60 * 60 * 1000), true);
    assert.equal(shouldSendHourReminder(new Date(start).toISOString(), start - 30 * 60 * 1000), false);
    assert.equal(shouldSendHourReminder(new Date(start).toISOString(), start - 3 * 60 * 60 * 1000), false);
  });

  it('locationLine faller tillbaka till mötestyp', () => {
    assert.equal(locationLine('Kontoret', 'På plats'), 'Kontoret');
    assert.equal(locationLine('', 'Telefon'), 'Telefon');
  });
});
