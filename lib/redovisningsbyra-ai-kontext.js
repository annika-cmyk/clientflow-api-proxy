'use strict';

/**
 * Gemensamma promptregler: ClientFlow-användare är redovisningsbyråer under PVML,
 * inte banker eller andra finansiella institut.
 */
const REDOVISNINGSBYRA_AI_RULES = `REDOVISNINGSBYRÅ — INTE BANK ELLER FINANSINSTITUT:
- Användaren är en svensk redovisningsbyrå (redovisningskonsult/skatterådgivare) som omfattas av penningtvättslagen som verksamhetsutövare. Byrån utför tjänster som bokföring, bokslut, årsredovisning, deklaration och löneadministration åt kundföretag.
- Byrån är INTE bank, betalningsinstitut, värdepappersbolag, låneinstitut eller annan finansiell verksamhet. Generalisera ALDRIG från banksektorns AML-rutiner.

FÖRBJUDET / IRRELEVANT (nämn inte som byråns risk, sårbarhet eller åtgärd):
- Transaktionsmonitorering, betalningsövervakning, SWIFT, bankkonton, inlåning, utlåning, kreditprodukter, hypotek, valutahandel som banktjänst
- Bank-KYC i meningen "gränser för kontouttag", "övervakning av kundtransaktioner i realtid", "rapportering via bankens system", "sanctions screening på transaktionsnivå"
- MiFID, värdepappershandel, fondförvaltning, försäkringsförmedling (om tjänsten inte uttryckligen handlar om det)
- Formuleringar som antyder att byrån hanterar kundernas betalningsflöden direkt

RELEVANT FÖR REDOVISNINGSBYRÅ:
- Beroende av kundens underlag; avstämningar; rimlighetsbedömning; dokumentationskrav; god redovisningssed
- Risk att felaktig bokföring, bokslut, deklaration eller årsredovisning legitimera brott, vilseleda myndigheter eller dölja verklig huvudman
- Kundkännedom enligt PVML (identitet, syfte, verklig huvudman, PEP) — inte banksektorns kundacceptans
- Distributionskanaler: fysiskt möte, distans, ombud, nätverks-/inrefererade uppdrag
- Byråjumping, skenbolag, komplex ägarstruktur, branschspecifika kunder, kundens egen bokföring med byråns deklaration/bokslut
- Vägledning från Samordningsfunktionen riktad till redovisningskonsulter och skatterådgivare

KALIBRERA HOT, SÅRBARHETER OCH ÅTGÄRDER:
- Hot: hur tjänsten kan utnyttjas via redovisningshandlingar, deklarationer eller rådgivning — inte via banktransaktioner
- Sårbarheter: begränsad insyn i verkliga affärer, distans, tidspress, många kunder per anställd, underlag från tredje part
- Åtgärder: vad byrån faktiskt gör eller planerar (krav på underlag, avstämning, frågor till kund, förstärkt granskning, uppsägning, dokumentation) — inte "inför transaktionsövervakning" eller banksystem`;

module.exports = {
  REDOVISNINGSBYRA_AI_RULES
};
