'use strict';

const FIELD = 'Bolagsverket uppdaterad';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatLabel(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  try {
    const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('sv-SE');
  } catch (_) {
    return s;
  }
}

module.exports = {
  FIELD,
  todayIso,
  formatLabel
};
