const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { KOM_IGANG_STEP_IDS, collectKomIgangState } = require('./kom-igang');

describe('kom-igang', () => {
  it('inkluderar steg 5 när state samlas', () => {
    assert.deepEqual(KOM_IGANG_STEP_IDS[5], ['kom-igang-5-0']);
    const checked = {
      'kom-igang-1-0': true,
      'kom-igang-5-0': true
    };
    const state = collectKomIgangState(KOM_IGANG_STEP_IDS, (id) => (
      Object.prototype.hasOwnProperty.call(checked, id) ? checked[id] : false
    ));
    assert.equal(state['kom-igang-5-0'], true);
    assert.equal(state['kom-igang-4-0'], false);
  });
});
