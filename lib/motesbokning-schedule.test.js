/**
 * Host-initierad mötesinbjudan från kalendern.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const schedule = require('./motesbokning-schedule');

describe('motesbokning-schedule parseScheduleInviteInput', () => {
  it('normaliserar giltig Distans-payload', () => {
    const parsed = schedule.parseScheduleInviteInput({
      bookerName: 'Anna Andersson',
      bookerEmail: 'Anna@Exempel.se',
      start: '2026-11-03T10:00:00',
      end: '2026-11-03T10:30:00',
      meetingType: 'Distans',
      title: 'Avstämning',
      note: 'Gå igenom Q3'
    });
    assert.equal(parsed.bookerEmail, 'anna@exempel.se');
    assert.equal(parsed.bookerName, 'Anna Andersson');
    assert.equal(parsed.meetingType, 'Distans');
    assert.equal(parsed.location, 'Google Meet');
    assert.equal(parsed.title, 'Avstämning');
    assert.equal(parsed.note, 'Gå igenom Q3');
    assert.ok(parsed.start.includes('2026-11-03'));
    assert.ok(parsed.end.includes('2026-11-03'));
  });

  it('kräver e-post och namn', () => {
    assert.throws(
      () => schedule.parseScheduleInviteInput({
        bookerName: 'Anna',
        start: '2026-11-03T10:00:00',
        end: '2026-11-03T11:00:00'
      }),
      (err) => err.code === 'VALIDATION'
    );
    assert.throws(
      () => schedule.parseScheduleInviteInput({
        bookerEmail: 'anna@exempel.se',
        start: '2026-11-03T10:00:00',
        end: '2026-11-03T11:00:00'
      }),
      (err) => err.code === 'VALIDATION'
    );
  });

  it('behåller adress för På plats', () => {
    const parsed = schedule.parseScheduleInviteInput({
      name: 'Bo',
      email: 'bo@exempel.se',
      start: '2026-11-03T10:00:00',
      end: '2026-11-03T11:00:00',
      meetingType: 'På plats',
      location: 'Storgatan 1'
    });
    assert.equal(parsed.meetingType, 'På plats');
    assert.equal(parsed.location, 'Storgatan 1');
  });
});

describe('motesbokning-schedule buildScheduleInviteFields', () => {
  it('skapar bokad Airtable-payload med Token och lucka', () => {
    const { fields, token, parsed } = schedule.buildScheduleInviteFields({
      bookerName: 'Anna',
      bookerEmail: 'anna@exempel.se',
      start: '2026-11-03T09:00:00.000Z',
      end: '2026-11-03T09:30:00.000Z',
      meetingType: 'Distans'
    }, { byraId: 'byra1', hostEmail: 'host@byra.se' });

    assert.equal(fields['Byrå ID'], 'byra1');
    assert.equal(fields['Skapad av'], 'host@byra.se');
    assert.equal(fields.Status, 'Bokad');
    assert.equal(fields.Mötestyp, 'Distans');
    assert.equal(fields['Bokare e-post'], 'anna@exempel.se');
    assert.equal(fields.Token, token);
    assert.ok(token.length >= 32);
    assert.equal(parsed.meetingType, 'Distans');
    const slots = JSON.parse(fields.Luckor);
    assert.equal(slots.length, 1);
    assert.equal(slots[0].status, 'Bokad');
  });
});

describe('motesbokning-schedule shouldCreateMeet', () => {
  it('Distans → Meet, På plats/Telefon → nej', () => {
    assert.equal(schedule.shouldCreateMeet('Distans'), true);
    assert.equal(schedule.shouldCreateMeet('På plats', 'Storgatan 1'), false);
    assert.equal(schedule.shouldCreateMeet('Telefon'), false);
    assert.equal(schedule.shouldCreateMeet('', 'Google Meet'), true);
  });
});
