/**
 * Regelmotor-embryo: byråns riskfaktorkatalog versioneras.
 * Kundakter stämplas med katalogen de bedömdes mot.
 * När katalogen bumpas → kund med äldre stämpel får status behöver_omprofilering.
 *
 * Cascade-strategi (lazy, medvetet):
 * - bumpCatalogVersion / bumpRiskFactorCatalogForRequest skriver bara byrå-state + risk_event.
 *   Eager Airtable-fan-out till alla kunder undviks (kostnad/rate limits).
 * - Vid GET /api/kunddata/:id (och ev. residual-save) jämförs kundens stämpel med byråns
 *   version via lazyOmprofileringFields. Om stämpeln ligger efter sätts/returneras
 *   Riskprofil status = behöver_omprofilering (persistens när fältet finns).
 * - När residual sparas igen rensas status via kundStampFields(aktuell version).
 *
 * Bakgrundsmigrering: saknad stämpel tolkas som version 1 (samma default som byråns start).
 */

'use strict';

const DEFAULT_VERSION = 1;

const KUND_FIELDS = {
  CATALOG_VERSION: 'Riskfaktor katalogversion',
  PROFILE_STATUS: 'Riskprofil status'
};

const PROFILE_STATUS = {
  OK: '',
  NEEDS_REPROFILE: 'behöver_omprofilering'
};

const EVENT_TYPE = 'riskfaktor_katalog_andrad';

function toVersion(value, fallback = DEFAULT_VERSION) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function readCatalogVersion(state) {
  return toVersion(state && state.riskFactorCatalogVersion, DEFAULT_VERSION);
}

/**
 * @param {object} state byråresa-state
 * @param {{ refId?: string, namn?: string, by?: string, at?: string }} [meta]
 * @returns {{ state: object, version: number, event: object }}
 */
function bumpCatalogVersion(state, meta = {}) {
  const current = readCatalogVersion(state);
  const version = current + 1;
  const nextState = {
    ...(state && typeof state === 'object' ? state : {}),
    riskFactorCatalogVersion: version
  };
  return {
    state: nextState,
    version,
    event: {
      type: EVENT_TYPE,
      refId: String(meta.refId || '').trim(),
      namn: String(meta.namn || '').trim(),
      by: String(meta.by || '').trim(),
      at: String(meta.at || '').trim() || new Date().toISOString(),
      // Katalogbump ogiltigförklarar inte hela AR — den flaggar kundakter för omprofilering.
      arInvalidated: false
    }
  };
}

function readKundCatalogVersion(fields) {
  const raw = fields && fields[KUND_FIELDS.CATALOG_VERSION];
  if (raw == null || raw === '') return DEFAULT_VERSION;
  return toVersion(raw, DEFAULT_VERSION);
}

function readKundProfileStatus(fields) {
  return String((fields && fields[KUND_FIELDS.PROFILE_STATUS]) || '').trim();
}

function needsOmprofilering(kundFields, byraCatalogVersion) {
  return readKundCatalogVersion(kundFields) < toVersion(byraCatalogVersion, DEFAULT_VERSION);
}

/** Fält att skriva när kundens residual/riskprofil sparas mot aktuell katalog. */
function kundStampFields(catalogVersion) {
  return {
    [KUND_FIELDS.CATALOG_VERSION]: toVersion(catalogVersion, DEFAULT_VERSION),
    [KUND_FIELDS.PROFILE_STATUS]: PROFILE_STATUS.OK
  };
}

/** Fält när byråns katalog är nyare än kundens stämpel. */
function kundOmprofileringFields() {
  return {
    [KUND_FIELDS.PROFILE_STATUS]: PROFILE_STATUS.NEEDS_REPROFILE
  };
}

function isNeedsReprofileStatus(status) {
  return String(status || '').trim() === PROFILE_STATUS.NEEDS_REPROFILE;
}

/**
 * Lazy cascade-patch: returnerar fält att skriva/merge:a när kundens katalogstämpel
 * är äldre än byråns version och status ännu inte är behöver_omprofilering.
 * Returnerar null när inget behöver ändras (up to date eller redan flaggad).
 *
 * @param {object} kundFields Airtable-fält för kunden
 * @param {number|string} byraCatalogVersion byråns aktuella katalogversion
 * @returns {object|null}
 */
function lazyOmprofileringFields(kundFields, byraCatalogVersion) {
  if (!needsOmprofilering(kundFields, byraCatalogVersion)) return null;
  if (isNeedsReprofileStatus(readKundProfileStatus(kundFields))) return null;
  return kundOmprofileringFields();
}

/**
 * Effective status för UI/API: returnerar behöver_omprofilering om stämpeln ligger efter,
 * även innan patch hunnit skrivas (response-side cascade).
 */
function effectiveKundProfileStatus(kundFields, byraCatalogVersion) {
  if (needsOmprofilering(kundFields, byraCatalogVersion)) {
    return PROFILE_STATUS.NEEDS_REPROFILE;
  }
  return readKundProfileStatus(kundFields);
}

module.exports = {
  DEFAULT_VERSION,
  KUND_FIELDS,
  PROFILE_STATUS,
  EVENT_TYPE,
  readCatalogVersion,
  bumpCatalogVersion,
  readKundCatalogVersion,
  readKundProfileStatus,
  needsOmprofilering,
  kundStampFields,
  kundOmprofileringFields,
  isNeedsReprofileStatus,
  lazyOmprofileringFields,
  effectiveKundProfileStatus
};
