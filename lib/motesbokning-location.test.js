const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hostPhoneFromLocations,
  hostAddressFromLocations,
  formatBookingLocation,
  formatMeetingCalendarTitle,
  contactLines
} = require('./motesbokning-location');

describe('motesbokning-location', () => {
  const locs = [
    { id: 'meet', type: 'meet', label: 'Google Meet', value: '' },
    { id: 'phone', type: 'phone', label: 'Telefon', value: '070-246 29 21' },
    { id: 'place', type: 'place', label: 'På plats', value: 'Klövervägen 41, 341 38 LJUNGBY' }
  ];

  it('plockar värdens telefon och adress', () => {
    assert.equal(hostPhoneFromLocations(locs), '070-246 29 21');
    assert.equal(hostAddressFromLocations(locs), 'Klövervägen 41, 341 38 LJUNGBY');
  });

  it('formatBookingLocation för på plats visar adress', () => {
    assert.equal(
      formatBookingLocation(locs[2], { bookerPhone: '070-111 22 33' }),
      'Klövervägen 41, 341 38 LJUNGBY'
    );
  });

  it('formatBookingLocation för telefon är etikett (nummer sparas separat)', () => {
    assert.equal(
      formatBookingLocation(locs[1], { bookerPhone: '070-111 22 33', hostPhone: '070-246 29 21' }),
      'Telefon'
    );
  });

  it('contactLines listar adress och telefoner', () => {
    const lines = contactLines({
      meetingType: 'På plats',
      location: 'Klövervägen 41',
      hostPhone: '070-246 29 21',
      bookerPhone: '070-111 22 33'
    });
    assert.deepEqual(lines, [
      'Adress: Klövervägen 41',
      'Värdens telefon: 070-246 29 21',
      'Bokarens telefon: 070-111 22 33'
    ]);
  });

  it('formatMeetingCalendarTitle sätter mötestyp, konsult och deltagare', () => {
    assert.equal(
      formatMeetingCalendarTitle({
        title: 'Bokslutsmöte',
        hostName: 'Annika Rydén',
        bookerName: 'Christina Nilsson'
      }),
      'Bokslutsmöte · Annika Rydén och Christina Nilsson'
    );
    assert.equal(
      formatMeetingCalendarTitle({
        title: 'Bokslutsmöte',
        hostName: 'Annika Rydén',
        bookerName: 'Annika Rydén'
      }),
      'Bokslutsmöte · Annika Rydén'
    );
  });
});
