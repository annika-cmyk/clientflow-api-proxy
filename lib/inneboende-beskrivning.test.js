const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  TJANST_BESKRIVNING_LABEL,
  OVRIG_BESKRIVNING_LABEL,
  TJANST_BESKRIVNING_HINT,
  OVRIG_BESKRIVNING_HINT,
  INHERENT_DESCRIPTION_AI_RULES
} = require('./inneboende-beskrivning');

describe('inneboende-beskrivning', () => {
  it('använder samma mönster för tjänst och övrig riskfaktor', () => {
    assert.match(TJANST_BESKRIVNING_LABEL, /inneboende risk$/);
    assert.match(OVRIG_BESKRIVNING_LABEL, /inneboende risk$/);
    assert.match(TJANST_BESKRIVNING_HINT, /Åtgärder-fliken/);
    assert.match(OVRIG_BESKRIVNING_HINT, /Åtgärd/);
  });

  it('förbjuder åtgärdsfraser i AI-beskrivningen', () => {
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /byrån säkerställer/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /vi kontrollerar/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /byrån har rutiner för/);
    assert.match(INHERENT_DESCRIPTION_AI_RULES, /åtgärdsfältet/);
  });
});
