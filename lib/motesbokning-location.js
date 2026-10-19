/**
 * Formatera plats och telefoner för mötesbokning.
 */

function locByType(locations, type) {
  const list = Array.isArray(locations) ? locations : [];
  return list.find((l) => String(l?.type || '').toLowerCase() === type) || null;
}

function hostPhoneFromLocations(locations) {
  const phone = locByType(locations, 'phone');
  return String(phone?.value || '').trim();
}

function hostAddressFromLocations(locations) {
  const place = locByType(locations, 'place');
  return String(place?.value || '').trim();
}

/** Plats-sträng som sparas på bokningen / syns i kalender. */
function formatBookingLocation(loc, { bookerPhone, hostPhone } = {}) {
  const type = String(loc?.type || '').toLowerCase();
  const value = String(loc?.value || '').trim();
  const label = String(loc?.label || '').trim();
  const guest = String(bookerPhone || '').trim();
  const host = String(hostPhone || value || '').trim();

  if (type === 'place') {
    return value || label || 'På plats';
  }
  if (type === 'phone') {
    return label || 'Telefon';
  }
  return label || value || 'Google Meet';
}

function contactLines({ meetingType, location, hostPhone, bookerPhone }) {
  const type = String(meetingType || '').trim();
  const lines = [];
  const where = String(location || '').trim();
  if (type === 'På plats' && where) {
    lines.push(`Adress: ${where}`);
  } else if (type !== 'Telefon' && where) {
    lines.push(`Plats: ${where}`);
  } else if (type === 'Telefon' && where && where !== 'Telefon') {
    lines.push(`Plats: ${where}`);
  }
  const host = String(hostPhone || '').trim();
  const guest = String(bookerPhone || '').trim();
  if (host) lines.push(`Värdens telefon: ${host}`);
  if (guest) lines.push(`Bokarens telefon: ${guest}`);
  return lines;
}

module.exports = {
  locByType,
  hostPhoneFromLocations,
  hostAddressFromLocations,
  formatBookingLocation,
  contactLines
};
