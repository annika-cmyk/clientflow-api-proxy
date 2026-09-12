/**
 * Byråns resa — stegdefinitioner och källkatalog (metodnivå).
 * State sparas som JSON på Byråer-fältet "Byråresa state".
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

const KALLA_STATES = ['unset', 'tagit_del', 'anvander', 'inte_relevant'];

const RESA_STEPS = [
  {
    id: 1,
    title: 'Byråprofil / omfattning',
    desc: 'Byråns verksamhet, kundstock och omfattning – underlag för hela riskbedömningen.',
    href: 'byra-profil-enkate.html',
    linkLabel: 'Öppna byråprofil'
  },
  {
    id: 2,
    title: 'Tjänster',
    desc: 'Aktivera och bedöm byråns tjänster. Egna tjänster går live först när mini-analysen är klar.',
    href: 'riskbedomning-byra.html',
    linkLabel: 'Gå till Byråns tjänster'
  },
  {
    id: 3,
    title: 'Kundkategorier / geo / distribution',
    desc: 'Kartlägg kundtyper, geografi och hur ni når kunderna (distans, ombud, fysiskt möte).',
    href: 'allman-riskbedomning-byra.html',
    linkLabel: 'Gå till Allmän riskbedömning'
  },
  {
    id: 4,
    title: 'Övriga riskfaktorer',
    desc: 'Varningsflaggor och övriga riskfaktorer som ingår i byråns regelkatalog.',
    href: 'ovriga-riskfaktorer.html',
    linkLabel: 'Gå till Övriga riskfaktorer'
  },
  {
    id: 5,
    title: 'Sammanställning',
    desc: 'Identifierade risker och statistik som matar den allmänna riskbedömningen.',
    href: 'statistik-riskbedomning.html',
    linkLabel: 'Gå till Statistik'
  },
  {
    id: 6,
    title: 'Åtgärder och byrårutiner',
    desc: 'Rutiner enligt 2 kap. 8 § – inklusive behandling av personuppgifter.',
    href: 'byrarutiner.html',
    linkLabel: 'Gå till Byrårutiner'
  },
  {
    id: 7,
    title: 'Residual och riskaptit',
    desc: 'Kvarstående risk efter åtgärder och byråns riskaptit.',
    href: 'allman-riskbedomning-byra.html',
    linkLabel: 'Gå till Allmän riskbedömning'
  },
  {
    id: 8,
    title: 'Godkännande',
    desc: 'Slutgodkänn AR och rutiner (CFA / BankID). Kräver att källkatalogen är ifylld.',
    href: 'dokumentation.html',
    linkLabel: 'Gå till Dokumentation'
  }
];

function emptyKallaEntry(id) {
  return { id, status: 'unset', note: '' };
}

function mergeKallaState(saved) {
  const byId = {};
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    Object.keys(saved).forEach((id) => {
      const row = saved[id] || {};
      const status = KALLA_STATES.includes(row.status) ? row.status : 'unset';
      byId[id] = {
        id,
        status,
        note: typeof row.note === 'string' ? row.note : ''
      };
    });
  }
  return DEFAULT_KALLOR.map((k) => {
    const prev = byId[k.id] || emptyKallaEntry(k.id);
    return {
      id: k.id,
      label: k.label,
      url: k.url,
      status: prev.status,
      note: prev.note
    };
  });
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
function kallaIdsAnvanda(kallaMap) {
  const ids = [];
  const merged = mergeKallaState(kallaMap);
  merged.forEach((row) => {
    if (row.status === 'anvander') ids.push(row.id);
  });
  return ids;
}

function kallaCatalogComplete(kallaMap) {
  const merged = mergeKallaState(kallaMap);
  return merged.every((row) => row.status && row.status !== 'unset');
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
  return {
    version: BYRA_RESA_VERSION,
    steps,
    kalla: kallaForStorage(
      Object.keys(obj.kalla || {}).map((id) => ({
        id,
        status: obj.kalla[id] && obj.kalla[id].status,
        note: obj.kalla[id] && obj.kalla[id].note
      }))
    )
  };
}

function buildByraResaState({ steps, kalla } = {}) {
  const parsedSteps = {};
  RESA_STEPS.forEach((s) => {
    parsedSteps[s.id] = !!(steps && steps[s.id]);
  });
  return {
    version: BYRA_RESA_VERSION,
    steps: parsedSteps,
    kalla: kallaForStorage(
      Object.keys(kalla || {}).map((id) => ({
        id,
        ...(kalla[id] || {})
      }))
    )
  };
}

function serializeByraResaState(state) {
  return JSON.stringify(buildByraResaState(state || {}));
}

module.exports = {
  BYRA_RESA_STATE_FIELD,
  BYRA_RESA_VERSION,
  PERSONUPPGIFTER_FIELD,
  DEFAULT_KALLOR,
  KALLA_STATES,
  RESA_STEPS,
  mergeKallaState,
  kallaForStorage,
  kallaIdsAnvanda,
  kallaCatalogComplete,
  parseByraResaState,
  buildByraResaState,
  serializeByraResaState
};
