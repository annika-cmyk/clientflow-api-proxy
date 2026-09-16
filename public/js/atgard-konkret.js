/**
 * Promptregler för AI-förslag på åtgärder.
 * Ingen spar-kontroll — användaren får skriva fritt. AI ska inte föreslå vaga avsikter.
 */
(function (global) {
  var AI_RULES = `ÅTGÄRDER / «HUR HANTERAS RISKEN?» — konkreta kontroller med dokumentation:
- Varje åtgärd ska beskriva vad byrån FAKTISKT gör, eller en konkret plan (när, vem, var).
- Skriv i presens om åtgärden är på plats: "dokumenteras", "granskas", "stäms av", "sparas i".
- OBLIGATORISKT per kontroll — täck: (1) VAD som kontrolleras, (2) VEM som gör det, (3) NÄR/hur ofta, (4) VAR det dokumenteras (system, mapp, kundakt, stickprovsprotokoll), (5) VARFÖR det minskar PT/TF-risk (en mening i klarspråk).
- Lista gärna 2–4 separata kontroller i löptext eller tydliga meningar — inte en enda vag sammanfattning.
- Ange system/rutin/ansvarig, t.ex. "i bokslutsprogrammet Capego", "i Fortnox", "av klientansvarig", "i kundakten".
- Om åtgärden inte är införd ännu: skriv plan med datum och ansvarig, t.ex. "Från 1 oktober 2026 dokumenteras ROT-underlag i Fortnox. Ansvarig: klientansvarig."
- FÖRBJUDET: avsikter utan införande — "Inför striktare krav…", "Öka dokumentationskrav", "Byrån bör stärka…", "Se över rutinerna", "Förbättra dokumentationen".
- FÖRBJUDET (för tunt): en ensam mening om "dokumentation och regelbundna granskningar" utan vad, vem, var och hur.
- Dåligt: "Dokumentation av alla transaktioner genomförs i Capego."
- Bra: "Klientansvarig granskar vid varje bokslut att köp och försäljning har faktura/kvitto och rimligt styckpris. Avvikelser (kontant, saknat underlag, orealistiskt värde) noteras i Capego med datum och åtgärd. Stickprov dokumenteras i kundaktens AML-anteckning så en kollega kan följa vad som kontrollerats."

PEDAGOGIK OCH BEVARA DETALJ (nyanställda — AML för dummies):
- Texten ska vara begriplig utan AML-bakgrund: vad görs, varför det minskar penningtvätt-/TF-risk, och vad man ska vara uppmärksam på.
- Preferera att expandera och förtydliga framför att korta ner. Om byråns befintliga åtgärdstext redan är konkret och rik — behåll fakta och operativa detaljer. Lägg till AML/TF-koppling eller dokumentationssteg om det saknas.
- Föreslå ALDRIG en kortare/svagare omskrivning som tar bort användbart innehåll.
- Vid redigering av befintlig åtgärd: skriv minst lika innehållsrik text. Om bara lätt språkputs behövs — behåll texten oförändrad (ingen redigera-post).`;

  var api = {
    AI_RULES: AI_RULES
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AtgardKonkret = api;
})(typeof window !== 'undefined' ? window : globalThis);
