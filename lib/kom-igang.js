/**
 * Kom igång-checkboxar på dashboarden.
 * State sparas som JSON på Byråer-fältet "Kom igång state".
 */
const KOM_IGANG_STEP_IDS = {
  1: ['kom-igang-1-0'],
  2: ['kom-igang-2-0'],
  3: ['kom-igang-3-0', 'kom-igang-3-1'],
  4: ['kom-igang-4-0', 'kom-igang-4-1', 'kom-igang-4-2', 'kom-igang-4-3'],
  5: ['kom-igang-5-0']
};

const HIDDEN_KEY = 'hidden';
const HIDE_CONFIRM = 'Är du klar med allt i Kom igång och vill dölja flödet från startsidan? Du kan visa det igen via Visa Kom igång.';

function allKomIgangIds(stepIds = KOM_IGANG_STEP_IDS) {
  return Object.keys(stepIds || {}).reduce((acc, stepNum) => acc.concat(stepIds[stepNum] || []), []);
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
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const checks = {};
  allKomIgangIds().forEach((id) => {
    checks[id] = !!src[id];
  });
  return { checks, hidden: src[HIDDEN_KEY] === true };
}

function allKomIgangChecked(checks, stepIds = KOM_IGANG_STEP_IDS) {
  return allKomIgangIds(stepIds).every((id) => !!(checks && checks[id]));
}

function shouldHideKomIgang(parsed) {
  return !!(parsed && parsed.hidden && allKomIgangChecked(parsed.checks));
}

function buildKomIgangState(checks, hidden) {
  const out = collectKomIgangState(KOM_IGANG_STEP_IDS, (id) => !!(checks && checks[id]));
  if (hidden) out[HIDDEN_KEY] = true;
  return out;
}

module.exports = {
  KOM_IGANG_STEP_IDS,
  HIDDEN_KEY,
  HIDE_CONFIRM,
  allKomIgangIds,
  collectKomIgangState,
  parseKomIgangState,
  allKomIgangChecked,
  shouldHideKomIgang,
  buildKomIgangState
};
