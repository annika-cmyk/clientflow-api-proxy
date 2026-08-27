'use strict';

const fs = require('node:fs');
const path = require('node:path');
const proj4 = require('proj4');

proj4.defs('EPSG:3006', '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

const DEFAULT_GEOJSON = path.join(__dirname, '../data/utsatta-omraden/uso_2025.geojson');
const NIVA_SEU = 'Särskilt utsatt område';
const NIVA_UTSATT = 'Utsatt område';

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

function parseAddressText(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { query: '', postnummer: '', postort: '' };
  const postMatch = s.match(/\b(\d{3}\s?\d{2})\b/);
  const postnummer = postMatch ? postMatch[1].replace(/\s+/, ' ') : '';
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  let postort = '';
  if (postnummer) {
    const after = s.split(postnummer)[1] || '';
    postort = after.replace(/^[\s,–-]+/, '').split(',')[0].trim();
  } else if (parts.length >= 2) {
    postort = parts[parts.length - 1];
  }
  return { query: s, postnummer, postort };
}

function buildGeocodeQuery(addressText) {
  const parsed = parseAddressText(addressText);
  let q = parsed.query.replace(/\s*,?\s*Sverige\s*$/i, '').trim();
  if (!q) return '';
  return `${q}, Sverige`;
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
      source: options.source || 'coordinates'
    };
  }
  const fetchImpl = options.fetchImpl || global.fetch;
  if (!fetchImpl) return { ok: false, reason: 'fetch_unavailable', query: q };
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=se&q=${encodeURIComponent(q)}`;
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': options.userAgent || 'ClientFlow/1.0 (AML address check; contact@clientflow.se)',
      Accept: 'application/json'
    }
  });
  if (!res.ok) return { ok: false, reason: `geocoder_http_${res.status}`, query: q };
  const rows = await res.json();
  const hit = Array.isArray(rows) ? rows[0] : null;
  if (!hit || hit.lat == null || hit.lon == null) {
    return { ok: false, reason: 'geocoder_no_hit', query: q };
  }
  return {
    ok: true,
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    query: q,
    displayName: hit.display_name || q,
    source: 'nominatim'
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
  parseAddressText,
  buildGeocodeQuery,
  geocodeAddress,
  matchPoint,
  checkAddress,
  summaryLabel,
  getIndex,
  resetIndexCache,
  pointInPolygon,
  toWgs84
};
