/**
 * Byråns AML-profil (intern: byra-resa) — stegdefinitioner och källkatalog (metodnivå).
 * State sparas som JSON på Byråer-fältet "Byråresa state".
 * Egna källor sparas i state.customKallor och ingår i katalog/komplettering.
 */

const BYRA_RESA_STATE_FIELD = 'Byråresa state';
const BYRA_RESA_VERSION = 1;

const PERSONUPPGIFTER_FIELD = 'Behandling av personuppgifter';

/** Curated sources for the method-level checklist (links + whitelist ids). */
const DEFAULT_KALLOR = [
  {
    id: 'nra-2024-2025',
    label: 'Nationell riskbedömning 2024/2025 (Samordningsfunktionen)',
    url: 'https://polisen.se/siteassets/dokument/om-polisen/penningtvatt/nationell-riskbedomning-av-penningtvatt-och-finansiering-av-terrorism-i-sverige-2024_2025.pdf'
  },
  {
    id: 'eu-snra',
    label: 'EU:s överstatliga riskbedömning (SNRA)',
    url: 'https://finance.ec.europa.eu/publications/supranational-risk-assessment-money-laundering-and-terrorist-financing-risks_en'
  },
  {
    id: 'fatf-recommendations',
    label: 'FATF Recommendations',
    url: 'https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html'
  },
  {
    id: 'finanspolisen',
    label: 'Finanspolisen – lägesbild / vägledning',
    url: 'https://polisen.se/om-polisen/organisation/sarskilda-organisationer/finanspolisen/'
  },
  {
    id: 'ebm-pt-naringsverksamhet',
    label: 'Ekobrottsmyndigheten – Penningtvätt i näringsverksamhet',
    url: 'https://www.ekobrottsmyndigheten.se/wp-content/uploads/se/2024/12/penningtvatt-i-naringsverksamhet-inkl-sammanfattning-1.pdf'
  },
  {
    id: 'ebm-redovisningskonsult',
    label: 'Ekobrottsmyndigheten – Vägledning för redovisningskonsulter',
    url: 'https://www.ekobrottsmyndigheten.se/om-ekobrott/tipsa-om-ekobrott/redovisningskonsult/'
  },
  {
    id: 'fi-prioriterade-2026',
    label: 'Finansinspektionen – Prioriterade risker (2026)',
    url: 'https://www.fi.se/sv/publicerat/rapporter/rapporter/2026/fis-prioriterade-risker-inom-penningtvatt-finansiering-av-terrorism-och-internationella-sanktioner/'
  }
];

const DEFAULT_KALLA_IDS = new Set(DEFAULT_KALLOR.map((k) => k.id));

const KALLA_STATES = ['unset', 'tagit_del', 'anvander', 'inte_relevant'];

const RESA_STEPS = [
  {
    id: 1,
    icon: 'fa-building',
    title: 'Byråprofil / omfattning',
    desc: 'Byråns verksamhet, kundstock och omfattning – underlag för hela riskbedömningen.',
    href: 'byra-profil-enkate.html',
    linkLabel: 'Öppna byråprofil'
  },
  {
    id: 2,
    icon: 'fa-clipboard-list',
    title: 'Tjänster',
    desc: 'Aktivera och bedöm byråns tjänster. Egna tjänster går live först när mini-analysen är klar.',
    href: 'riskbedomning-byra.html',
    linkLabel: 'Gå till Byråns tjänster'
  },
  {
    id: 3,
    icon: 'fa-users',
    title: 'Vilka är våra kunder',
    desc: 'Kundkategorier samt kundens geografi: egen hemvist och motparters geografi.',
    href: 'kundrisker-mm.html',
    linkLabel: 'Gå till Vilka är våra kunder'
  },
  {
    id: 4,
    icon: 'fa-globe',
    title: 'Övriga riskfaktorer',
    desc: 'Byråns arbetssätt: distributionskanaler, geografisk marknad och verksamhetsspecifika risker.',
    href: 'ovriga-riskfaktorer.html',
    linkLabel: 'Gå till Övriga riskfaktorer'
  },
  {
    id: 5,
    icon: 'fa-chart-pie',
    title: 'Sammanställning',
    desc: 'Identifierade risker och statistik som matar den allmänna riskbedömningen.',
    href: 'statistik-riskbedomning.html',
    linkLabel: 'Gå till Statistik'
  },
  {
    id: 6,
    icon: 'fa-clipboard-check',
    title: 'Åtgärder och byrårutiner',
    desc: 'Rutiner enligt 2 kap. 8 § – inklusive behandling av personuppgifter.',
    href: 'byrarutiner.html',
    linkLabel: 'Gå till Byrårutiner'
  },
  {
    id: 7,
    icon: 'fa-scale-balanced',
    title: 'Residual och riskaptit',
    desc: 'Kvarstående risk efter åtgärder och byråns riskaptit.',
    href: 'allman-riskbedomning-byra.html',
    linkLabel: 'Gå till Allmän riskbedömning'
  },
  {
    id: 8,
    icon: 'fa-file-signature',
    title: 'Godkännande',
    desc: 'Slutgodkänn AR och rutiner (CFA / BankID). Kräver att källkatalogen är ifylld.',
    href: 'dokumentation.html',
    linkLabel: 'Gå till Dokumentation'
  }
];

function trimStr(value) {
  return value == null ? '' : String(value).trim();
}

function emptyKallaEntry(id) {
  return { id, status: 'unset', note: '' };
}

function slugifyKallaId(label) {
  const base = trimStr(label)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'kalla';
}

function createCustomKallaId(label, existingIds = []) {
  const taken = new Set([...(existingIds || []), ...DEFAULT_KALLA_IDS]);
  let id = `custom-${slugifyKallaId(label)}`;
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n += 1;
  return `${id}-${n}`;
}

function normalizeCustomKalla(row, { existingIds } = {}) {
  if (!row || typeof row !== 'object') return null;
  const label = trimStr(row.label || row.name);
  if (!label) return null;
  let id = trimStr(row.id);
  if (!id || DEFAULT_KALLA_IDS.has(id) || !id.startsWith('custom-')) {
    id = createCustomKallaId(label, existingIds);
  }
  let url = trimStr(row.url || row.href);
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return { id, label, url, custom: true };
}

function normalizeCustomKallor(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((row) => {
    const normalized = normalizeCustomKalla(row, {
      existingIds: [...seen, ...out.map((r) => r.id)]
    });
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    out.push(normalized);
  });
  return out;
}

function statusFromSaved(row) {
  const status = row && KALLA_STATES.includes(row.status) ? row.status : 'unset';
  return {
    status,
    note: typeof row?.note === 'string' ? row.note : ''
  };
}

/**
 * Build catalog rows: default sources + firm custom sources, with saved status/note.
 * @param {object} savedKalla status map
 * @param {array} customKallor optional custom source definitions
 */
function mergeKallaState(savedKalla, customKallor) {
  const byId = {};
  if (savedKalla && typeof savedKalla === 'object' && !Array.isArray(savedKalla)) {
    Object.keys(savedKalla).forEach((id) => {
      byId[id] = statusFromSaved(savedKalla[id]);
    });
  }
  const customs = normalizeCustomKallor(customKallor);
  const defaults = DEFAULT_KALLOR.map((k) => {
    const prev = byId[k.id] || emptyKallaEntry(k.id);
    return {
      id: k.id,
      label: k.label,
      url: k.url,
      custom: false,
      status: prev.status,
      note: prev.note
    };
  });
  const customRows = customs.map((k) => {
    const prev = byId[k.id] || emptyKallaEntry(k.id);
    return {
      id: k.id,
      label: k.label,
      url: k.url,
      custom: true,
      status: prev.status,
      note: prev.note
    };
  });
  return defaults.concat(customRows);
}

function kallaForStorage(rows) {
  const out = {};
  (rows || []).forEach((row) => {
    if (!row || !row.id) return;
    const status = KALLA_STATES.includes(row.status) ? row.status : 'unset';
    out[row.id] = {
      status,
      note: typeof row.note === 'string' ? row.note.trim() : ''
    };
  });
  return out;
}

/** Sources marked "använder" — allowed grounding set for AI threat generation. */
function kallaIdsAnvanda(kallaMap, customKallor) {
  const ids = [];
  mergeKallaState(kallaMap, customKallor).forEach((row) => {
    if (row.status === 'anvander') ids.push(row.id);
  });
  return ids;
}

function kallaCatalogComplete(kallaMap, customKallor) {
  const merged = mergeKallaState(kallaMap, customKallor);
  return merged.length > 0 && merged.every((row) => row.status && row.status !== 'unset');
}

function parseByraResaState(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch (_) {
      obj = {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
  const steps = {};
  RESA_STEPS.forEach((s) => {
    steps[s.id] = !!(obj.steps && obj.steps[s.id]);
  });
  const customKallor = normalizeCustomKallor(obj.customKallor);
  const customIds = new Set(customKallor.map((k) => k.id));
  const kallaRows = Object.keys(obj.kalla || {}).map((id) => ({
    id,
    status: obj.kalla[id] && obj.kalla[id].status,
    note: obj.kalla[id] && obj.kalla[id].note
  })).filter((row) => DEFAULT_KALLA_IDS.has(row.id) || customIds.has(row.id));
  const catalogVersion = Number(obj.riskFactorCatalogVersion);
  return {
    version: BYRA_RESA_VERSION,
    steps,
    customKallor,
    kalla: kallaForStorage(kallaRows),
    arDeltaPending: obj.arDeltaPending === true,
    riskEvents: normalizeRiskEvents(obj.riskEvents),
    riskFactorCatalogVersion: (Number.isFinite(catalogVersion) && catalogVersion >= 1)
      ? Math.floor(catalogVersion)
      : 1
  };
}

function normalizeRiskEvents(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      type: String(row.type || '').trim() || 'tjanst_andrad',
      refId: String(row.refId || '').trim(),
      namn: String(row.namn || '').trim(),
      at: String(row.at || '').trim() || new Date().toISOString(),
      by: String(row.by || '').trim(),
      arInvalidated: row.arInvalidated === true
    }))
    .slice(-100);
}

function buildByraResaState({ steps, kalla, customKallor, arDeltaPending, riskEvents, riskFactorCatalogVersion } = {}) {
  const parsedSteps = {};
  RESA_STEPS.forEach((s) => {
    parsedSteps[s.id] = !!(steps && steps[s.id]);
  });
  const customs = normalizeCustomKallor(customKallor);
  const customIds = new Set(customs.map((k) => k.id));
  const kallaRows = Object.keys(kalla || {}).map((id) => ({
    id,
    ...(kalla[id] || {})
  })).filter((row) => DEFAULT_KALLA_IDS.has(row.id) || customIds.has(row.id));
  const catalogVersion = Number(riskFactorCatalogVersion);
  return {
    version: BYRA_RESA_VERSION,
    steps: parsedSteps,
    customKallor: customs,
    kalla: kallaForStorage(kallaRows),
    arDeltaPending: arDeltaPending === true,
    riskEvents: normalizeRiskEvents(riskEvents),
    riskFactorCatalogVersion: (Number.isFinite(catalogVersion) && catalogVersion >= 1)
      ? Math.floor(catalogVersion)
      : 1
  };
}

function serializeByraResaState(state) {
  return JSON.stringify(buildByraResaState(state || {}));
}

function appendRiskEvent(state, event) {
  const built = buildByraResaState(state || {});
  const nextEvent = {
    type: String((event && event.type) || 'tjanst_andrad').trim() || 'tjanst_andrad',
    refId: String((event && event.refId) || '').trim(),
    namn: String((event && event.namn) || '').trim(),
    at: String((event && event.at) || '').trim() || new Date().toISOString(),
    by: String((event && event.by) || '').trim(),
    arInvalidated: !!(event && event.arInvalidated)
  };
  built.riskEvents = normalizeRiskEvents([...(built.riskEvents || []), nextEvent]);
  if (nextEvent.arInvalidated) built.arDeltaPending = true;
  return built;
}

const STEP_STATUS = {
  DONE: 'done',
  NEXT: 'next',
  ATTENTION: 'attention',
  PENDING: 'pending'
};

const STEP_STATUS_LABEL = {
  done: 'Klart',
  next: 'Nästa steg',
  attention: 'Kräver uppmärksamhet',
  pending: 'Ej påbörjat'
};

/**
 * Status per steg-kort: attention > done > första ofärdiga = next > pending.
 * @param {{ steps?: object, attentionStepIds?: Iterable<number|string> }} input
 * @returns {Array<{ id: number, status: string, label: string }>}
 */
function resolveStepCardStatuses(input = {}) {
  const stepsState = (input.steps && typeof input.steps === 'object') ? input.steps : {};
  const attention = new Set(
    [...(input.attentionStepIds || [])]
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  let nextAssigned = false;
  return RESA_STEPS.map((step) => {
    const id = step.id;
    const done = !!(stepsState[id] || stepsState[String(id)]);
    let status;
    if (attention.has(id)) status = STEP_STATUS.ATTENTION;
    else if (done) status = STEP_STATUS.DONE;
    else if (!nextAssigned) {
      status = STEP_STATUS.NEXT;
      nextAssigned = true;
    } else status = STEP_STATUS.PENDING;
    return { id, status, label: STEP_STATUS_LABEL[status] };
  });
}

/** Antal avklarade steg + total (för sidomeny / status). */
function countCompletedSteps(steps) {
  const total = RESA_STEPS.length;
  let done = 0;
  RESA_STEPS.forEach((s) => {
    if (steps && steps[s.id]) done += 1;
  });
  return { done, total };
}

module.exports = {
  BYRA_RESA_STATE_FIELD,
  BYRA_RESA_VERSION,
  PERSONUPPGIFTER_FIELD,
  DEFAULT_KALLOR,
  DEFAULT_KALLA_IDS,
  KALLA_STATES,
  RESA_STEPS,
  createCustomKallaId,
  normalizeCustomKallor,
  mergeKallaState,
  kallaForStorage,
  kallaIdsAnvanda,
  kallaCatalogComplete,
  parseByraResaState,
  buildByraResaState,
  serializeByraResaState,
  countCompletedSteps,
  normalizeRiskEvents,
  appendRiskEvent,
  STEP_STATUS,
  STEP_STATUS_LABEL,
  resolveStepCardStatuses
};
