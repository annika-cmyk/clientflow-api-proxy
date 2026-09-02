/**
 * Kom igång-checkboxar på dashboarden.
 * State sparas som JSON på Byråer-fältet "Kom igång state".
 */
const KOM_IGANG_VERSION = 2;

const KOM_IGANG_STEP_IDS = {
  1: ['kom-igang-1-0'], // Byråprofil-enkät
  2: ['kom-igang-2-0'], // Byråns tjänster
  3: ['kom-igang-3-0'], // Övriga riskfaktorer
  4: ['kom-igang-4-0', 'kom-igang-4-1'], // Kunder
  5: ['kom-igang-5-0', 'kom-igang-5-1', 'kom-igang-5-2', 'kom-igang-5-3'], // Allmän riskbedömning
  6: ['kom-igang-6-0'] // Export
};

const HIDDEN_KEY = 'hidden';
const HIDE_CONFIRM = 'Är du klar med allt i Kom igång och vill dölja flödet från startsidan? Du kan visa det igen via Visa Kom igång.';

const V1_TO_V2_ID_MAP = {
  'kom-igang-1-0': 'kom-igang-2-0',
  'kom-igang-2-0': 'kom-igang-3-0',
  'kom-igang-3-0': 'kom-igang-4-0',
  'kom-igang-3-1': 'kom-igang-4-1',
  'kom-igang-4-0': 'kom-igang-5-0',
  'kom-igang-4-1': 'kom-igang-5-1',
  'kom-igang-4-2': 'kom-igang-5-2',
  'kom-igang-4-3': 'kom-igang-5-3',
  'kom-igang-5-0': 'kom-igang-6-0'
};

function allKomIgangIds(stepIds = KOM_IGANG_STEP_IDS) {
  return Object.keys(stepIds || {}).reduce((acc, stepNum) => acc.concat(stepIds[stepNum] || []), []);
}

function looksLikeV2State(src) {
  // Nya id:n som inte fanns i v1 (eller hade annan plats)
  return (
    src['kom-igang-6-0'] !== undefined ||
    src['kom-igang-5-1'] !== undefined ||
    src['kom-igang-5-2'] !== undefined ||
    src['kom-igang-5-3'] !== undefined ||
    src['kom-igang-4-1'] !== undefined && src['kom-igang-3-1'] === undefined && src['kom-igang-5-0'] !== undefined
  );
}

function migrateKomIgangRaw(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  if (Number(src.version) >= KOM_IGANG_VERSION) return src;
  // Redan v2-form utan version-stämpel: behåll id:n, sätt bara version
  if (looksLikeV2State(src)) {
    return { ...src, version: KOM_IGANG_VERSION };
  }
  const out = { version: KOM_IGANG_VERSION };
  if (src[HIDDEN_KEY] === true || src.hidden === true) out[HIDDEN_KEY] = true;
  Object.keys(V1_TO_V2_ID_MAP).forEach((oldId) => {
    if (src[oldId]) out[V1_TO_V2_ID_MAP[oldId]] = true;
  });
  return out;
}

function collectKomIgangState(stepIds, getChecked) {
  const state = {};
  Object.keys(stepIds || {}).forEach((stepNum) => {
    (stepIds[stepNum] || []).forEach((id) => {
      const checked = getChecked(id);
      if (checked === null || checked === undefined) return;
      state[id] = !!checked;
    });
  });
  return state;
}

function parseKomIgangState(raw) {
  const migrated = migrateKomIgangRaw(raw);
  const checks = {};
  allKomIgangIds().forEach((id) => {
    checks[id] = !!migrated[id];
  });
  return { checks, hidden: migrated[HIDDEN_KEY] === true, version: KOM_IGANG_VERSION };
}

function allKomIgangChecked(checks, stepIds = KOM_IGANG_STEP_IDS) {
  return allKomIgangIds(stepIds).every((id) => !!(checks && checks[id]));
}

function shouldHideKomIgang(parsed) {
  return !!(parsed && parsed.hidden && allKomIgangChecked(parsed.checks));
}

function buildKomIgangState(checks, hidden) {
  const out = collectKomIgangState(KOM_IGANG_STEP_IDS, (id) => !!(checks && checks[id]));
  out.version = KOM_IGANG_VERSION;
  if (hidden) out[HIDDEN_KEY] = true;
  return out;
}

module.exports = {
  KOM_IGANG_VERSION,
  KOM_IGANG_STEP_IDS,
  HIDDEN_KEY,
  HIDE_CONFIRM,
  V1_TO_V2_ID_MAP,
  allKomIgangIds,
  migrateKomIgangRaw,
  collectKomIgangState,
  parseKomIgangState,
  allKomIgangChecked,
  shouldHideKomIgang,
  buildKomIgangState
};
