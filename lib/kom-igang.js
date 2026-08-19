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

module.exports = { KOM_IGANG_STEP_IDS, collectKomIgangState };
