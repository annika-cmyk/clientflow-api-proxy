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
- Bra exempel: "Underlag för alla transaktioner dokumenteras i bokslutsprogrammet."

PEDAGOGIK OCH BEVARA DETALJ (nyanställda):
- Beskrivningen ska vara begriplig för nyanställda: vad görs, varför det minskar risk för penningtvätt/terrorismfinansiering, och vad man ska vara uppmärksam på i praktiken.
- Preferera att expandera och förtydliga framför att korta ner. Om byråns befintliga åtgärdstext redan är konkret och rik — behåll fakta och operativa detaljer (t.ex. retroaktiva kontroller, skattetillägg, hur kunder reagerar, system, ansvarig). Lägg till AML/TF-koppling eller pedagogik om det saknas.
- Föreslå ALDRIG en kortare/svagare omskrivning som tar bort användbart innehåll. Dåligt: ersätt en detaljerad beskrivning av «Skatteverkets utökade kontroller» (retroaktivitet, skattetillägg, kundernas «tänka efter en runda till») med en enda vag mening om att byrån informerar kunder. Bra: behåll detaljerna och förklara hur informationen minskar risken för oriktiga uppgifter i deklarationen.
- Vid redigering av befintlig åtgärd: skriv minst lika innehållsrik text. Om bara lätt språkputs behövs — behåll texten oförändrad (ingen redigera-post).`;

  var api = {
    AI_RULES: AI_RULES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AtgardKonkret = api;
})(typeof window !== 'undefined' ? window : globalThis);
