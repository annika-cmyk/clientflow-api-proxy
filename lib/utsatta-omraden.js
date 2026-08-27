'use strict';

const fs = require('node:fs');
const path = require('node:path');
const proj4 = require('proj4');

proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

const DEFAULT_GEOJSON = path.join(__dirname, '../data/utsatta-omraden/uso_2025.geojson');
const NIVA_SEU = 'Särskilt utsatt område';
const NIVA_UTSATT = 'Utsatt område';
const PRECISION_EXACT = 'exact';
const PRECISION_APPROXIMATE = 'approximate';
const NOMINATIM_FALLBACK_DELAY_MS = 1100;

let cachedIndex = null;

function toWgs84(x, y) {
  const [lon, lat] = proj4('EPSG:3006', 'EPSG:4326', [x, y]);
  return { lat, lon };
}

function ringToWgs84(ring) {
  return (ring || []).map(([x, y]) => toWgs84(x, y));
}

function normalizeRing(ring) {
  const pts = Array.isArray(ring) ? ring : [];
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first.lat === last.lat && first.lon === last.lon) return pts.slice(0, -1);
  }
  return pts;
}

function pointInRing(point, ring) {
  const pts = normalizeRing(ring);
  if (pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].lon;
    const yi = pts[i].lat;
    const xj = pts[j].lon;
    const yj = pts[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat))
      && (point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi + 0) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings) {
  if (!Array.isArray(rings) || !rings.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function geometryToRings(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates || []).map(ringToWgs84);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || []).flatMap((poly) => (poly || []).map(ringToWgs84));
  }
  return [];
}

function featureMeta(feature) {
  const p = (feature && feature.properties) || {};
  return {
    namn: String(p.NAMN || '').trim(),
    kategori: String(p.KATEGORI || '').trim(),
    ort: String(p.ORT || '').trim(),
    region: String(p.REGION || '').trim(),
    lokalpolisomrade: String(p.LOKALPOLISOMRADE || '').trim(),
    aktualitetStart: String(p.AKTUALITET_START || '').trim(),
    ar: 2025,
    kalla: 'Polisen uso_2025.geojson'
  };
}

function loadIndex(geojsonPath) {
  const filePath = geojsonPath || process.env.UTSATTA_OMRADEN_GEOJSON || DEFAULT_GEOJSON;
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const areas = [];
  for (const feature of data.features || []) {
    const meta = featureMeta(feature);
    const geom = feature.geometry || {};
    let polygonSets = [];
    if (geom.type === 'Polygon') polygonSets = [geom.coordinates || []];
    else if (geom.type === 'MultiPolygon') polygonSets = geom.coordinates || [];
    for (const poly of polygonSets) {
      areas.push({
        meta,
        rings: (poly || []).map(ringToWgs84)
      });
    }
  }
  return { filePath, areas, featureCount: (data.features || []).length };
}

function getIndex(geojsonPath) {
  if (!cachedIndex || (geojsonPath && cachedIndex.filePath !== geojsonPath)) {
    cachedIndex = loadIndex(geojsonPath);
  }
  return cachedIndex;
}

function resetIndexCache() {
  cachedIndex = null;
}

function formatPostnummer(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 5) return String(raw || '').trim();
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function titleCaseSv(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
}

function extractLocalityFromStreet(streetPart) {
  const s = String(streetPart || '').trim();
  if (!s || !/\d/.test(s)) return '';
  const firstWord = s.split(/\s+/)[0] || '';
  if (!firstWord) return '';
  const withoutNumber = s.replace(/\s+\d+\s*[a-zA-ZåäöÅÄÖ]?\s*$/, '').trim();
  if (withoutNumber.length > firstWord.length) return titleCaseSv(firstWord);
  return '';
}

function parseAddressText(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { query: '', postnummer: '', postort: '', streetPart: '' };
  const postMatch = s.match(/\b(\d{3}\s?\d{2})\b/);
  const postnummer = postMatch ? formatPostnummer(postMatch[1]) : '';
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const streetPart = parts[0] || '';
  let postort = '';
  if (postnummer) {
    const after = s.split(postMatch[1])[1] || '';
    postort = after.replace(/^[\s,–-]+/, '').split(',')[0].trim();
  } else if (parts.length >= 2) {
    postort = parts[parts.length - 1];
  }
  return { query: s, postnummer, postort, streetPart };
}

function appendSverige(queryText) {
  const q = String(queryText || '').replace(/\s*,?\s*Sverige\s*$/i, '').trim();
  if (!q || q === 'Sverige') return '';
  return `${q}, Sverige`;
}

function buildGeocodeQuery(addressText) {
  return appendSverige(parseAddressText(addressText).query);
}

function buildGeocodeFallbackQueries(addressText) {
  const parsed = parseAddressText(addressText);
  const postort = titleCaseSv(parsed.postort);
  const locality = extractLocalityFromStreet(parsed.streetPart);
  const queries = [];
  const seen = new Set();

  const add = (parts) => {
    const q = appendSverige(parts.filter(Boolean).join(', '));
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(q);
  };

  const addPlain = (text) => {
    const q = appendSverige(text);
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(q);
  };

  if (locality && postort) add([locality, postort]);
  const postnummerRaw = String(parsed.postnummer || '').replace(/\s/g, '');
  if (postnummerRaw && postort) addPlain(`${postnummerRaw}, ${postort}`);
  if (parsed.postnummer && postort) addPlain(`${parsed.postnummer} ${postort}`);
  if (locality) add([locality]);
  if (postort) add([postort]);
  return queries;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nominatimSearch(query, fetchImpl, userAgent, retryCount = 0) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': userAgent || 'ClientFlow/1.0 (AML address check; contact@clientflow.se)',
      Accept: 'application/json'
    }
  });
  if (res.status === 429 && retryCount < 2) {
    await sleep(1500 * (retryCount + 1));
    return nominatimSearch(query, fetchImpl, userAgent, retryCount + 1);
  }
  if (!res.ok) return { ok: false, reason: `geocoder_http_${res.status}`, query };
  const rows = await res.json();
  const hit = Array.isArray(rows) ? rows[0] : null;
  if (!hit || hit.lat == null || hit.lon == null) {
    return { ok: false, reason: 'geocoder_no_hit', query };
  }
  return {
    ok: true,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    query,
    displayName: hit.display_name || query
  };
}

async function geocodeAddress(addressText, opts) {
  const options = opts || {};
  const q = buildGeocodeQuery(addressText);
  if (!q || q === 'Sverige') {
    return { ok: false, reason: 'missing_address', query: q };
  }
  if (options.lat != null && options.lon != null) {
    return {
      ok: true,
      lat: Number(options.lat),
      lon: Number(options.lon),
      query: q,
      displayName: options.displayName || q,
      source: options.source || 'coordinates',
      precision: options.precision || PRECISION_EXACT
    };
  }
  const fetchImpl = options.fetchImpl || global.fetch;
  if (!fetchImpl) return { ok: false, reason: 'fetch_unavailable', query: q };

  const userAgent = options.userAgent || 'ClientFlow/1.0 (AML address check; contact@clientflow.se)';
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : NOMINATIM_FALLBACK_DELAY_MS;

  const primary = await nominatimSearch(q, fetchImpl, userAgent);
  if (primary.ok) {
    return {
      ...primary,
      source: 'nominatim',
      precision: PRECISION_EXACT
    };
  }

  const fallbacks = buildGeocodeFallbackQueries(addressText);
  for (const fallbackQuery of fallbacks) {
    if (delayMs > 0) await sleep(delayMs);
    const hit = await nominatimSearch(fallbackQuery, fetchImpl, userAgent);
    if (hit.ok) {
      return {
        ...hit,
        source: 'nominatim_approximate',
        precision: PRECISION_APPROXIMATE,
        originalQuery: q,
        fallbackQuery
      };
    }
  }

  return {
    ok: false,
    reason: 'geocoder_no_hit',
    query: q,
    fallbacksTried: fallbacks
  };
}

function matchPoint(lat, lon, opts) {
  const index = getIndex(opts && opts.geojsonPath);
  const point = { lat: Number(lat), lon: Number(lon) };
  const hits = [];
  for (const area of index.areas) {
    if (pointInPolygon(point, area.rings)) hits.push(area.meta);
  }
  hits.sort((a, b) => {
    const rank = (k) => (k === NIVA_SEU ? 0 : k === NIVA_UTSATT ? 1 : 2);
    return rank(a.kategori) - rank(b.kategori) || a.namn.localeCompare(b.namn, 'sv');
  });
  const best = hits[0] || null;
  return {
    trff: !!best,
    niva: best ? best.kategori : null,
    omrade: best ? best.namn : null,
    ort: best ? best.ort : null,
    region: best ? best.region : null,
    ar: best ? best.ar : null,
    kalla: best ? best.kalla : null,
    allaTrffar: hits
  };
}

async function checkAddress(addressText, opts) {
  const geo = await geocodeAddress(addressText, opts);
  if (!geo.ok) {
    return {
      trff: false,
      niva: null,
      omrade: null,
      geocoding: geo,
      kontrolleradAt: new Date().toISOString()
    };
  }
  const match = matchPoint(geo.lat, geo.lon, opts);
  return {
    ...match,
    geocoding: geo,
    kontrolleradAt: new Date().toISOString()
  };
}

function summaryLabel(result) {
  if (!result || !result.trff) return null;
  if (result.niva === NIVA_SEU) return `Särskilt utsatt område: ${result.omrade}`;
  if (result.niva === NIVA_UTSATT) return `Utsatt område: ${result.omrade}`;
  return `${result.niva || 'Träff'}: ${result.omrade}`;
}

module.exports = {
  DEFAULT_GEOJSON,
  NIVA_SEU,
  NIVA_UTSATT,
  PRECISION_EXACT,
  PRECISION_APPROXIMATE,
  parseAddressText,
  formatPostnummer,
  extractLocalityFromStreet,
  buildGeocodeQuery,
  buildGeocodeFallbackQueries,
  geocodeAddress,
  matchPoint,
  checkAddress,
  summaryLabel,
  getIndex,
  resetIndexCache,
  pointInPolygon,
  toWgs84
};
