/**
 * Promptregler för AI-förslag på åtgärder.
 * Ingen spar-kontroll — användaren får skriva fritt. AI ska inte föreslå vaga avsikter.
 */
(function (global) {
  var AI_RULES = `ÅTGÄRDER / «HUR HANTERAS RISKEN?» — konkreta, proportionerliga kontroller med dokumentation:
- Varje åtgärd ska beskriva vad byrån FAKTISKT gör, eller en konkret plan (när, vem, var).
- Skriv i presens om åtgärden är på plats: "dokumenteras", "granskas", "stäms av", "sparas i".
- OBLIGATORISKT per kontroll — täck: (1) VAD som kontrolleras, (2) VEM som gör det, (3) NÄR/hur ofta, (4) VAR det dokumenteras (system, mapp, kundakt, stickprovsprotokoll), (5) VARFÖR det minskar PT/TF-risk (en mening i klarspråk).
- Lista gärna 2–4 separata kontroller i löptext eller tydliga meningar — inte en enda vag sammanfattning.
- Ange system/rutin/ansvarig, t.ex. "i bokslutsprogrammet Capego", "i Fortnox", "av klientansvarig", "i kundakten".
- Om åtgärden inte är införd ännu: skriv plan med datum och ansvarig, t.ex. "Från 1 oktober 2026 dokumenteras ROT-underlag i Fortnox. Ansvarig: klientansvarig."

PROPORTIONERLIGA KONTROLLER (redovisningsbyrå — inte bank/KYC-operatör):
- Föreslå riskbaserade kontroller: stickprov, avvikelser, kontanter, saknat underlag, orealistiska belopp/styckpris, ovanliga kanaler — inte manuell granskning av varenda rad.
- FÖRBJUDET om underlaget inte uttryckligen säger att byrån gör det: "granskar alla transaktioner", "alla fakturor", "varje betalning", "alla köp och försäljningar", eller låga beloppströsklar som i praktiken betyder totalgranskning (t.ex. "alla över 1000 kr").
- Föreslå inte trösklar eller frekvenser som byrån inte uppgett. Hitta inte på "över X kr" om det saknas i underlaget.
- Dåligt: "Klientansvarig granskar alla transaktioner över 1000 kr och sparar dokumentationen."
- Bra: "Vid bokslut gör klientansvarig stickprov på inköp/försäljning med fokus på saknat underlag, kontant och belopp som avviker från normalt styckpris. Stickprovet och eventuella avvikelser noteras i Capego/kundakt med datum så en kollega kan följa vad som kontrollerats."

- FÖRBJUDET: avsikter utan införande — "Inför striktare krav…", "Öka dokumentationskrav", "Byrån bör stärka…", "Se över rutinerna", "Förbättra dokumentationen".
- FÖRBJUDET (för tunt): en ensam mening om "dokumentation och regelbundna granskningar" utan vad, vem, var och hur.
- Dåligt (för tunt): "Dokumentation av alla transaktioner genomförs i Capego."

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
