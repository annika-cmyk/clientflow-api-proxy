'use strict';

/** UI- och exportetiketter — samma ord i tjänstformulär, riskfaktorformulär och AR-export. */
const TJANST_BESKRIVNING_LABEL = 'Tjänstebeskrivning och inneboende risk';
const OVRIG_BESKRIVNING_LABEL = 'Beskrivning och inneboende risk';

const TJANST_BESKRIVNING_HINT =
  'Beskriv tjänsten och den risk den utgör i sig — nämn INTE byråns kontroller, rutiner eller åtgärder här; de hör hemma i Åtgärder-fliken.';

const OVRIG_BESKRIVNING_HINT =
  'Beskriv riskfaktorn och den risk den utgör i sig — nämn INTE byråns kontroller, rutiner eller åtgärder här; de hör hemma under Åtgärd.';

const INHERENT_DESCRIPTION_AI_RULES = `BESKRIVNING (inneboende risk) — inte åtgärder:
- Fältet "beskrivning" ska bara beskriva vad tjänsten eller riskfaktorn är och vilken risk den utgör i sig.
- Ta ALDRIG med byråns kontroller, rutiner eller åtgärder i beskrivningen.
- Förbjudna fraser i beskrivningen: "byrån säkerställer", "vi kontrollerar", "byrån har rutiner för", "vi granskar", "vi följer upp", "byrån tillämpar".
- Sådant innehåll hör enbart i åtgärdsfältet (atgarder / atgard).`;

module.exports = {
  TJANST_BESKRIVNING_LABEL,
  OVRIG_BESKRIVNING_LABEL,
  TJANST_BESKRIVNING_HINT,
  OVRIG_BESKRIVNING_HINT,
  INHERENT_DESCRIPTION_AI_RULES
};
