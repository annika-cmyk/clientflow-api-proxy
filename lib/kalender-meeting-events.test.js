const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ME = require('../public/js/kalender-meeting-events.js');

describe('kalender-meeting-events', () => {
  it('mapInviteToCalendarEvent bygger block med Meet-URL från Plats', () => {
    const ev = ME.mapInviteToCalendarEvent({
      id: 'rec1',
      status: 'Bokad',
      title: 'Bokslutsmöte',
      bookerName: 'Erik Kund',
      bookerEmail: 'erik@exempel.se',
      bookedStart: '2026-10-29T10:00:00.000Z',
      bookedEnd: '2026-10-29T11:00:00.000Z',
      location: 'https://meet.google.com/aaa-bbbb-ccc',
      meetingType: 'Distans'
    });
    assert.ok(ev);
    assert.equal(ev.key, 'meeting:rec1');
    assert.equal(ev.source, 'meeting');
    assert.equal(ev.meetingUrl, 'https://meet.google.com/aaa-bbbb-ccc');
    assert.match(ev.summary, /Bokslutsmöte/);
    assert.match(ev.summary, /Erik Kund/);
    assert.ok(ev.scheduledStart);
    assert.ok(ev.scheduledEnd);
  });

  it('mapInviteToCalendarEvent ignorerar icke-bokade', () => {
    assert.equal(ME.mapInviteToCalendarEvent({
      id: 'rec2',
      status: 'Öppen',
      bookedStart: '2026-10-29T10:00:00Z',
      bookedEnd: '2026-10-29T11:00:00Z'
    }), null);
  });

  it('meetingUrlFromInvite hittar Teams i location', () => {
    const url = ME.meetingUrlFromInvite({
      location: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc'
    });
    assert.match(url, /teams\.microsoft\.com/);
  });

  it('shortMeetingLabel', () => {
    assert.equal(ME.shortMeetingLabel('https://meet.google.com/x'), 'Google Meet');
    assert.equal(ME.shortMeetingLabel('https://teams.microsoft.com/l/meetup-join/x'), 'Teams');
  });

  it('buildMeetingEventsFromInvites filtrerar på range', () => {
    const invites = [
      {
        id: 'a',
        status: 'Bokad',
        title: 'A',
        bookedStart: '2026-10-28T10:00:00',
        bookedEnd: '2026-10-28T11:00:00',
        location: 'Google Meet'
      },
      {
        id: 'b',
        status: 'Bokad',
        title: 'B',
        bookedStart: '2026-11-05T10:00:00',
        bookedEnd: '2026-11-05T11:00:00',
        location: 'https://meet.google.com/bbb-cccc-ddd'
      }
    ];
    const out = ME.buildMeetingEventsFromInvites(invites, {
      start: '2026-10-27',
      end: '2026-11-02'
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].inviteId, 'a');
  });

  it('mergeMeetingWithGoogleEvents deduplicerar via clientflowKey och berikar Meet', () => {
    const meetings = [
      ME.mapInviteToCalendarEvent({
        id: 'rec9',
        status: 'Bokad',
        title: 'Möte',
        bookerName: 'Erik',
        bookedStart: '2026-10-29T10:00:00',
        bookedEnd: '2026-10-29T11:00:00',
        location: 'https://meet.google.com/aaa-bbbb-ccc'
      })
    ];
    const google = [{
      key: 'gcal:g1',
      source: 'google',
      clientflowKey: 'meeting:rec9',
      scheduledStart: '2026-10-29T10:00:00',
      scheduledEnd: '2026-10-29T11:00:00',
      summary: 'Möte · Annika och Erik',
      meetingUrl: '',
      hangoutLink: ''
    }];
    const merged = ME.mergeMeetingWithGoogleEvents(meetings, google);
    assert.equal(merged.meetingEvents.length, 0);
    assert.equal(merged.googleEvents.length, 1);
    assert.equal(merged.googleEvents[0].meetingUrl, 'https://meet.google.com/aaa-bbbb-ccc');
  });

  it('mergeMeetingWithGoogleEvents behåller Airtable-möte utan GCal-match', () => {
    const meetings = [
      ME.mapInviteToCalendarEvent({
        id: 'solo',
        status: 'Bokad',
        title: 'Solo',
        bookedStart: '2026-10-30T09:00:00',
        bookedEnd: '2026-10-30T09:30:00',
        location: 'https://meet.google.com/solo-meet-url'
      })
    ];
    const merged = ME.mergeMeetingWithGoogleEvents(meetings, []);
    assert.equal(merged.meetingEvents.length, 1);
    assert.equal(merged.meetingEvents[0].inviteId, 'solo');
  });
});
