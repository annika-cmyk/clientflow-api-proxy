'use strict';

/** UI- och exportetiketter — samma ord i tjänstformulär, riskfaktorformulär och AR-export. */
const TJANST_BESKRIVNING_LABEL = 'Tjänsten';
const OVRIG_BESKRIVNING_LABEL = 'Beskrivning';

const TJANST_BESKRIVNING_HINT =
  'Beskriv vad tjänsten innebär — nämn INTE byrån, personal, kapacitet, kontroller, rutiner eller åtgärder här; de hör hemma i Åtgärder-fliken.';

const OVRIG_BESKRIVNING_HINT =
  'Beskriv riskfaktorn — nämn INTE byrån, personal, kapacitet, kontroller, rutiner eller åtgärder här; de hör hemma under Åtgärd.';

const INHERENT_DESCRIPTION_AI_RULES = `BESKRIVNING — inte byrån och inte åtgärder:
- Fältet "beskrivning" ska bara beskriva vad tjänsten eller riskfaktorn är och vilka risker den kan medföra i sig.
- Skriv ur tjänstens eller riskfaktorns perspektiv. Nämn INTE byrån, "vi", personalstyrka, kapacitet eller hur verksamheten är organiserad.
- Ta ALDRIG med byråns kontroller, rutiner eller åtgärder i beskrivningen.
- Förbjudna fraser i beskrivningen: "byrån", "redovisningsbyrån", "byrån säkerställer", "vi kontrollerar", "byrån har rutiner för", "vi granskar", "vi följer upp", "byrån tillämpar", "med en enda anställd", "begränsad kapacitet".
- Sådant innehåll hör enbart i åtgärdsfältet (atgarder / atgard).
- Motivering av sannolikhet och konsekvens (S×K) hör i motiveringInneboende, inte i beskrivningen.`;

module.exports = {
  TJANST_BESKRIVNING_LABEL,
  OVRIG_BESKRIVNING_LABEL,
  TJANST_BESKRIVNING_HINT,
  OVRIG_BESKRIVNING_HINT,
  INHERENT_DESCRIPTION_AI_RULES
};
