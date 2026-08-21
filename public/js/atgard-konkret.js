/**
 * Promptregler för AI-förslag på åtgärder.
 * Ingen spar-kontroll — användaren får skriva fritt. AI ska inte föreslå vaga avsikter.
 */
(function (global) {
  var AI_RULES = `ÅTGÄRDER — införda eller tydligt planerade, aldrig vaga avsikter:
- Varje åtgärd ska beskriva vad byrån FAKTISKT gör, eller en konkret plan (när, vem, var).
- Skriv i presens om åtgärden är på plats: "dokumenteras", "granskas", "stäms av", "sparas i".
- Ange var eller hur det görs (system, rutin, ansvarig), t.ex. "i bokslutsprogrammet", "i Fortnox", "av klientansvarig".
- Om åtgärden inte är införd ännu: skriv plan med datum och ansvarig, t.ex. "Från 1 oktober 2026 dokumenteras ROT-underlag i Fortnox. Ansvarig: klientansvarig."
- FÖRBJUDET: avsikter och rekommendationer utan införande. Exempel som INTE får användas: "Inför striktare krav…", "Öka dokumentationskrav", "Byrån bör stärka…", "Se över rutinerna", "Förbättra dokumentationen", "åtgärden ska införas".
- Bra exempel: "Underlag för alla transaktioner dokumenteras i bokslutsprogrammet."`;

  var api = {
    AI_RULES: AI_RULES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AtgardKonkret = api;
})(typeof window !== 'undefined' ? window : globalThis);
