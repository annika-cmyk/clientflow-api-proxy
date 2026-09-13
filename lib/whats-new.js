/**
 * Användarvända ändringar som visas överst på dashboarden.
 * Lägg en ny post när du släpper något som påverkar slutanvändaren.
 * Dashboarden visar automatiskt de 5 viktigaste från den senaste månaden.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 5;

const WHATS_NEW_ENTRIES = [
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Pedagogisk AI-analys i Din resa',
    summary:
      'AI-förslag för hot, sårbarheter och åtgärder ska nu förklara mer för nyanställda och expandera hellre än korta ner. Redan konkreta beskrivningar behåller detaljer (t.ex. kontroller och kundbeteende) i stället för att ersättas med svagare sammanfattningar.'
  },

    date: '2026-09-13',
    importance: 3,
    title: 'AI-förslag utan tomma omskrivningar',
    summary:
      'När AI föreslår ändringar på hot och sårbarheter i Din resa visas inte längre «Ändras: beskrivningen» om texten är densamma. Om bara källa är ny märks det som källändring, och helt identiska rader filtreras bort.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'AI-analys klarmarkerar utförandefrågor',
    summary:
      'När AI-analysen på steget Frågor från din ClientFlow AI lyckas markeras fliken automatiskt som klar (samma sparning som när ni klickar Klarmarkera). Misslyckad analys lämnar fliken oklar.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Klarmarkera sparar och går vidare',
    summary:
      'När du klarmarkerar eller tar bort klarmarkering i Din resa sparas ändringen direkt (samma sparväg som vanligt sparande). Efter lyckad klarmarkering går du vidare till nästa steg; misslyckad sparning visar fel och stannar kvar.'
  },
  {
    date: '2026-09-13',
    importance: 2,
    title: 'Eget svar på utförandefrågor',
    summary:
      'På utförandefrågorna i Din resa finns en diskret penna per fråga. Där kan ni lägga till ett eget eller kompletterande svar som sparas med tjänsten och ingår när AI analyserar.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Byråprofil: kundbranscher som översikt',
    summary:
      'Frågan Vilka branscher har ni era kunder i? använder nu bredare grupper (Bygg, IT, Handel m.m.) i stället för varje SNI-kod. Hämtning från Clientflow aggregerar automatiskt, och befintliga detaljerade rader kan sammanfogas med en knapp — högriskbranscher påverkas inte.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Tjänstekort: progresscirkel i stället för ikon',
    summary:
      'På Vilka tjänster erbjuder ni? visar varje kort en cirkel som fylls när ni klarmarkerar delar i Din resa — tom från start, delvis ifylld under vägen, och solid teal med bock när tjänsten är klar.'
  },
  {
    date: '2026-09-13',
    importance: 2,
    title: 'Klarmarkera längst ner till höger i Din resa',
    summary:
      'I tjänst- och riskfaktormodalerna ligger Klarmarkera nu längst ner till höger i steginnehållet, så «Lägg till eget» och övriga tilläggsknappar får stå själva uppe till höger.'
  },
  {
    date: '2026-09-13',
    importance: 2,
    title: 'Tydligare hjälptext för närståendetillgångar',
    summary:
      'I utförandefrågorna för anläggningsregister förklaras nu vad frågan om tillgångar med koppling till ägare, närstående eller koncernbolag betyder — så att ni kan svara utifrån hur uppdragen brukar se ut.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Byråprofil: betalningsmönster som flerval',
    summary:
      'Frågan om typiska betalningsmönster är nu kryssrutor (kontant, kort, Swish, faktura m.m.) med möjlighet att lägga till egna alternativ. Tidigare fritextsvar matchas mot alternativen automatiskt.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'NRA som källtagg — ingen separat checklista',
    summary:
      'Nationell riskbedömning är nu en källa i metodkatalogen, inte en sexpunktschecklista. Terrorfinansiering ligger under Vilka är våra kunder; Formella intyg som valbar tjänst. Slutgodkännande kräver ifylld källkatalog.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Byråprofil: tydligare val för kundkontakt och onboarding',
    summary:
      'Under Distributionskanaler finns nu beskrivande alternativ för hur ni möter kunder (endast distans, främst fysiskt, hybrid, onboarding fysiskt sedan distans, eller kraftigt varierande modell). Äldre svar På plats/Distans/Blandat mappas automatiskt.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Utförandesvar dolda i tjänstöversikten',
    summary:
      'När ni fäller ut Visa översikt på ett tjänstkort visas risknivå, tjänstebeskrivning, hot, sårbarheter och åtgärder — utan utförandesvar. Svaren finns kvar under Redigera / Din resa.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Byråprofil: högriskbransch-sök stängs korrekt',
    summary:
      'Förslagslistan under Sök högriskbransch… öppnas inte längre permanent över fälten under. Den stängs med klick utanför, Escape och när ni lämnar sökfältet.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: sidfot med två bilder sparas utan 422-fel',
    summary:
      'Uppladdade porträtt/loggor i Inställningar · sidfot komprimeras till mejlstorlek innan sparning, så Airtable inte längre ger "Request failed with status code 422". Om något ändå är för stort visas ett tydligt svenskt fel.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Byråprofil: hämta statistik från Clientflow',
    summary:
      'I byråprofil-enkäten kan ni på kundstock och geografi fylla antal kunder, bolagsformer, branscher, PEP, internationell handel m.m. direkt från era aktiva kunder i Clientflow.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Riskfaktoranalys: samma Din resa som tjänster',
    summary:
      'På Övriga riskfaktorer och Vilka är våra kunder följer analysmodalen samma sju steg som tjänsteanalysen: Frågor från din ClientFlow AI, Översikt, Hot och modus, Sårbarheter, Inneboende risk, Riskreducerande åtgärder och Residualrisk — med klarmarkering och progress.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: spara till uppdragskörning syns på körningen',
    summary:
      'Spara mejl/bilagor till Uppdragskörning landar nu där ClientFlow visar dokumentation (på uppdraget, med deadline i filnamnet) och dual-write:as till körningsraden. Toasten bekräftar vilken körning filerna sparades till.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Sparad riskanalys syns och går att öppna igen',
    summary:
      'Efter Analysera från byråprofilen fylls tomma Din resa-fält vid AI, saknade obligatoriska fält ger tydligt fel på rätt flik, och lyckad sparning scrollar till det markerade kortet under Kundkategorier och geografi.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Inga 400-felstormar vid laddning av riskfaktorer',
    summary:
      'När Övriga riskfaktorer eller Kundrisker mm laddades kunde automatiska namn-/typmigreringar skicka hundratals misslyckade PUT-anrop (saknad PT/TF eller motivering). Migreringar sparar nu bara namn/typ, och servern tillåter sådana lätta uppdateringar utan full riskanalys.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: se var mejl och bilagor är sparade',
    summary:
      'I mejldetaljen syns nu destinationer i ClientFlow (Dokumentation, Uppdrag, Uppdragskörning), om mejl/bilagor är sparade, privat/delning, plus länkar till kundkortets rätt flik.'
  },
{
    date: '2026-09-13',
    importance: 4,
    title: 'Checklista för analyser från byråprofilen',
    summary:
      'Under Från byråprofilen syns nu per rad om förslaget är analyserat, avstått eller kvar. Ni kan avstå utan att skapa kort, ångra avstå, och status sparas per byrå.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'AI-förslag rensas vid ny riskanalys',
    summary:
      'När ni öppnar en ny eller annan riskfaktor (t.ex. via Analysera från byråprofilen) rensas tidigare AI-förslag i modalen, så att text från en annan analys inte ligger kvar under fälten.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: spara till uppdragskörning fungerar igen',
    summary:
      'Spara mejl/bilagor till Uppdragskörning (och Uppdrag/Dokumentation) hittar rätt Airtable-tabell även utan env-id, skapar Mejlarkiv vid behov och visar tydliga fel i stället för tekniska 403-meddelanden.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Varning när kund-PEP saknar analys',
    summary:
      'Om en kund markeras som PEP (screening/KYC) utan att byrån har en aktuell PEP-analys under Vilka är våra kunder visas ett rött utropstecken i menyn. Skapa analysen via förslaget under Från byråprofilen så att kundattributet kopplas till AR.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: Markera privat fungerar utan tidigare sparning',
    summary:
      'Markera privat (och dela/maska) skapar nu Mejlarkiv-posten automatiskt om mejlet inte sparats i ClientFlow ännu. Saknas Airtable-tabellen skapas den vid behov, och felmeddelanden är tydligare än tekniska 403/500-koder.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Mejl: tydligare Nytt mejl-formulär',
    summary:
      'Nytt mejl är uppdelat i kort för mottagare, öppet innehåll, BankID-skyddat innehåll, bilagor och uppföljning — samma funktioner, klarare struktur.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: förhandsgranska och ladda ner bilagor',
    summary:
      'Öppna bilagor direkt från mejldetaljen: förhandsgranska bilder, PDF och text i en dialog, eller ladda ner med rätt filnamn. Andra filtyper får tydlig nedladdningsväg.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Analysförslag från byråprofilen på Vilka är våra kunder',
    summary:
      'Under Från byråprofilen finns knappar som föreslår analyskort utifrån bolagsformer, branscher (högrisk per bransch, övriga grupperbara), kontanter, ägarskap/PEP, geografi m.m. Ni väljer själva med kryssrutor vad som ska slås ihop eller analyseras var för sig.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'NRA-checklista i tydligare kort',
    summary:
      'Varje scenario ligger i eget kort med typikon, NRA-tagg, kompakta Ja/Nej-knappar och en tunn progressbar — samma visuella språk som övriga AML-profilen.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Mejl: etiketter dolda tills du öppnar dem',
    summary:
      'Etikettpanelen i mejldetaljen är ihopfälld som standard. Klicka på tagg-ikonen bredvid rubriken för att visa och ändra Gmail-etiketter och kundkoppling.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: Maska markering fungerar i HTML-vy',
    summary:
      'Maska markering hittar nu markerad text även när mejlet visas som HTML — whitespace, radbrytningar och entiteter normaliseras, och både text- och HTML-versionen maskeras i arkivet.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: Hanterat och Att hantera',
    summary:
      'Markera mejl som hanterat (grönt i listan, utan förhandsvisning) eller att hantera (orange). Status sparas lokalt per användare och mejl.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: Inställningar · sidfot fungerar igen',
    summary:
      'Fliken Inställningar · sidfot öppnar sidfotspanelen igen. Klickhanterare för sidfot, BankID-markering och underlagsfrågor återställdes efter en merge.'
  },
  {
    date: '2026-09-13',
    importance: 3,
    title: 'Läsbarare NRA-checklista',
    summary:
      'Checklistan har tydligare avdelare, kortare texter, NRA-referens vid titeln och en diskret typmarkering. Bugg med dubbel ”Ja” på klientmedel är åtgärdad.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: spara, dela, privat och maska',
    summary: 'Från mejldetaljen kan du spara bilagor och hela mejlet till kundens Dokumentation, uppdrag eller körning (bulk eller uppdelat), dela med kollegor, markera privat (syns inte vid omfördelning) och maska känslig text (bara du och ClientFlow-admin ser originalet).'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: BankID-vägg, underlag och sidfot',
    summary: 'I Mejl kan du skydda text och bilagor bakom BankID, skicka frågor/begär underlag som i Samarbete, och spara en personlig mejl-sidfot (fyra layouter) som bifogas automatiskt vid skicka.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: snabbare inkorg med inkrementell sync',
    summary:
      'Inkorgen visar sparade mejl direkt vid sidladdning och hämtar bara nya via Gmail History API. Uppdatera synkar inkrementellt (Shift+Uppdatera = full sync).'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Mejl: genväg till kundkort',
    summary:
      'När ett kundmejl är kopplat till en kund syns “Öppna kundkort” vid kundnamnet i listan och i detaljvyn, så du slipper leta upp kunden separat.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Kundrisk: Driven av-kedja och katalogversion',
    summary: 'På kundkortets riskbedömning syns nu vilka byråfaktorer som driver residualen, med länkar till tjänst/riskfaktor. Bedömd residual förblir förvald till beräknad nivå (motivering krävs vid avvikelse), och katalogversion/omprofilering visas i kortet.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: koppla Gmail-etikett till kund',
    summary:
      'Felaktig auto-match kan rättas i ClientFlow: koppla KUNDER-etiketten till rätt kund utan att ändra Gmail. Sparad koppling väger tyngre än e-post och namnmatch. Valfritt kan du också uppdatera Gmail-etiketten samtidigt.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: visa och ändra Gmail-etiketter',
    summary: 'I mejldetaljen syns Gmail-etiketter (särskilt KUNDER/…). Du kan byta eller skapa kundetikett direkt i ClientFlow – samma ändring som i Gmail – så felmatchade kunder kan rättas.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Mejl: renare sida, Skickat och radera',
    summary: 'Samarbete-raden och den stora Gmail-rutan är borta. Till vänster finns Inkorg och Skickat under KUNDER, listan visar kund + avsändare (nyast först), och du kan radera mejl till Gmails papperskorg från detaljvyn.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Gmail: matchar kunder via etikett och e-post',
    summary: 'Mejl under KUNDER kopplas till rätt kund via etikettnamn (t.ex. True Horses → TRUE HORSES AB) och/eller exakt e-post i From/To/Cc mot företags- eller kontaktperson-adress på kundkortet.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Stramare kundåtkomst och VH-gate',
    summary: 'Publika kundformulärlänkar läcker inte längre byråinterna fält eller riskbedömning via vilka frågor som visas. VH Osäker/Nej blockerar också KYC-utskick och residualsparning. Äldre katalogstämpel ger behöver_omprofilering vid hämtning av kundkort.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'NRA-checklista med tre frågetyper',
    summary: 'Checklistan skiljer nu på genuint ja/nej, inneboende risker där ni bara beskriver kontroller, och klientmedel som härleds automatiskt från aktiv tjänst i tjänstelistan. Räknaren räknar alla sex som klara på rätt sätt.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Analyskort utan innerscroll + klarmarkering per del',
    summary: 'Textfälten i tjänsteanalysen växer med innehållet så ni slipper scrolla i rutan. Varje steg i Din resa kan klarmarkeras med bock, och när alla delar är klara markeras hela tjänsten som klar i översikten.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Gmail: skicka mejl till kund fungerar igen',
    summary: 'Mejl-sidan gav felaktigt ”Ingen behörighet till kunden” trots att kunden fanns i listan. Behörighetskollen vid skicka använder nu samma kund-ID och Ledare/byrå-access som kundlistan.'
  },
  {
    date: '2026-09-13',
    importance: 5,
    title: 'Kundresa med VH-gate och automatiska påminnelser',
    summary: 'På kundkortet syns en sexstegs kundresa (Bolagsverket → VH → screening → kundformulär → riskprofil → godkännande). Osäker/Nej på VH blockerar vidare steg, kundlänk, KYC-synk, KYC-utskick och residualsparning. Skickade kundformulär får automatiska påminnelsemejl, och ni kan synka svar till KYC-utkast utan full merge.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'AI föreslår inte klientmedelskonto-hot vid Nej',
    summary: 'När ni svarat att byrån inte har klientmedelskonto under Betalningsuppdrag filtreras katalogunderlag och AI-förslag om genomgångskonto/klientmedelskonto bort.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Gmail: bättre matchning av kundetiketter',
    summary: 'Mejl under KUNDER matchar kundnamn mer generöst (å/ä/ö, &/och, AB-suffix, små stavfel). Om en etikett inte träffar en kund visas namnet så ni ser vad som saknas.'
  },
  {
    date: '2026-09-13',
    importance: 4,
    title: 'Gmail: tydligare fel vid fel Render-tjänst',
    summary: 'Mejl-status visar nu API-host och om OAuth-nycklar är tomma (längd) utan hemligheter. Gmail-env måste sitta på clientflow-api-proxy-1 (www.app.clientflow.se), inte den äldre tjänsten utan -1.'
  },
  {
    date: '2026-09-12',
    importance: 3,
    title: 'Kundformulär: statusstrip och påminnelse',
    summary: 'Under Kundformulär syns stegen från utkast till signering, och när länken är skickad kan ni mejla en påminnelse till kundens e-post utan att byta länk.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Kundformulär kan skickas som länk',
    summary: 'Under Kundformulär skapar ni en delbar länk som kunden öppnar utan inloggning, fyller i och skickar in. BankID-signering kommer i nästa steg.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Aktiv NRA-checklista i AML-profilen',
    summary: 'När ni markerar nationell riskbedömning som Använder fyller ni en kort ja/nej-checklista per scenario (med varför vid nej) innan slutgodkännande.'
  },
  {
    date: '2026-09-12',
    importance: 3,
    title: 'Gmail-env accepterar fler variabelnamn',
    summary: 'Mejl-sidan känner igen vanliga alias för Google OAuth (t.ex. GOOGLE_GMAIL_CLIENT_ID) och visar tydligare vilka nycklar som saknas respektive är satta – utan att visa hemligheter.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'CFA krävs för BankID-signering av AR',
    summary: 'Allmän riskbedömning och rutiner kan bara skickas för BankID-signering till en bekräftad centralt funktionsansvarig (CFA). Utse CFA under Byrå → Användare; ensam firma bekräftar rollen en gång.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'AI-förslag kräver redigering vid hög risk',
    summary: 'När residualrisken är Hög eller Oacceptabel måste AI-förslag ändras (eller kommenteras) innan de godtas. Bulk över flera tjänster är fortfarande avstängt.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Separata motiveringar för sannolikhet och konsekvens',
    summary: 'På tjänster och övriga riskfaktorer motiverar ni S och K var för sig. Tidigare fritext sparas som legacy och kan föreslås uppdelad när ni redigerar en post.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Riskfaktorkatalog får versionsnummer',
    summary: 'När ni ändrar övriga riskfaktorer räknas katalogversionen upp. Kundakter stämplas med versionen de bedömdes mot. Om stämpeln ligger efter byråns version markeras kunden med behöver_omprofilering när kundkortet hämtas (lazy cascade). Versionen visas under Driven av byråprofil.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Tydligare Gmail-koppling',
    summary: 'Om Gmail OAuth inte är konfigurerad på servern visar Mejl-sidan vilka miljövariabler som saknas när du klickar Koppla Gmail, i stället för att knappen tyst inte gör något.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Samarbete med BankID-skyddade frågor',
    summary: 'I Begär underlag kan du markera frågor som BankID-skyddade. Mejlet visar bara den offentliga delen; kunden legitimerar sig via länken och svarar på skyddade frågor. Verifierade svar markeras i kundkortet. BankID körs i demoläge tills riktig provider kopplas.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Gmail-mejl i ClientFlow',
    summary: 'Koppla din Gmail under Mejl. Mejl under etiketten KUNDER (med kundnamn som underetikett) visas i ClientFlow, och du kan skicka mejl så att de kommer från ditt Gmail-konto.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Samma analysresa för riskfaktorer',
    summary: 'Övriga riskfaktorer och Vilka är våra kunder använder nu samma Din resa-flöde som tjänsteanalysen: översikt, inneboende risk, åtgärder och residualrisk i flikar.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Översikt: ett kort per kategori',
    summary: 'När ni fäller ut Visa översikt på en tjänst ligger alla hot och modus i samma kort, likadant för sårbarheter och åtgärder — färre kort, lättare att skanna.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'AML-profilen visar nästa steg',
    summary: 'Stegkorten i Byråns AML-profil visar status direkt: klart (grönt), nästa steg (blått), kräver uppmärksamhet (rött) och ej påbörjat — med ikon per steg och meningsskrivning i rubriken.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Kundformulär = kundvy (ingen VH för enskild firma)',
    summary: 'På Kundformulär visas exakt samma fält som kunden ser och skickar in. För enskild firma och fysisk person döljs verklig huvudman — den är inte aktuell. Inskickat formulär visas låst.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Kundformulär enligt PTL-fältmodell',
    summary: 'Kundformuläret har tjänster (byråns val), förväntad omfattning, VH-bekräftelse Ja/Osäker/Nej, separat ombud och villkorade kontrollfrågor per tjänst. Neutral faktayta utan riskpoäng.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Extra underlag och egna hot till AI',
    summary: 'Vid Generera AI-analys kan ni skriva Extra underlag till analysen (t.ex. falska mejl som ser ut att komma från kunden). På Hot, Sårbarheter och Åtgärder finns Lägg till eget — era poster sparas, märks som eget och behålls när AI körs om.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Egna tjänster: mini-analys innan live',
    summary: 'Egna tjänster sparas som utkast och kan aktiveras först när mini-analysen är klar (inneboende risk, minst en åtgärd och residualrisk). Aktivering loggas och markerar AR som delta-pending.'
  },
  {
    date: '2026-09-12',
    importance: 2,
    title: 'Enklare betalningsfrågor',
    summary: 'Under Så här görs tjänsten för Betalningsuppdrag har vi tagit bort frågan om byrån utför betalningar — tjänsten i sig innebär det. Övriga betalningsfrågor visas alltid.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Tjänstrader utan riskkant',
    summary: 'På Byråns tjänster är vänsterkanten och ikonrutan neutrala igen — risknivån syns bara i badgearna. Oacceptabel har egen lila färg (tydligt svårare än Hög) så badge aldrig blir tom.'
  },
  {
    date: '2026-09-12',
    importance: 3,
    title: 'Klientmedelskonto i betalningsfrågor',
    summary: 'Under Så här görs tjänsten för Betalningsuppdrag frågar vi nu om byrån har klientmedelskonto (Ja/Nej), så AI-analysen får med det underlaget.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Menyn visar klar och varning',
    summary: 'Sidomenyn får bock på klara steg i byråns AML-profil och rött utropstecken när något behöver hanteras. Första regeln: kunder med skatterättslig hemvist i annat land medan byrån inte angett riskfaktorn — då varnas Vilka är våra kunder med tydlig förklaring på sidan.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Tydligare tjänstöversikt',
    summary: 'När ni fäller ut Visa översikt visas hot, sårbarheter och åtgärder som egna paneler med färg och ikon — enklare att skanna utan tät textvägg.'
  },
  {
    date: '2026-09-12',
    importance: 3,
    title: 'Tydligare risklistor',
    summary: 'På riskfaktorer, tjänster och Vilka är våra kunder visas Förhöjd i amber (inte blått), Ta bort bakom …-menyn, och tjänster har unika ikoner. Listorna sorteras med högst risk först. Risknivå syns i badgearna.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Byråns AML-profil i sidomenyn',
    summary: 'Byråns resa heter nu Byråns AML-profil (för att skilja från byråprofil-enkäten). Den ligger som ett statuskort högst upp i menyn med progressbar — X av Y steg klara — så ni ser ofärdigt arbete utan att öppna sidan.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Övriga riskfaktorer: driven av byråprofil',
    summary: 'På Övriga riskfaktorer syns fakta från byråprofilen (anställda, leveranssätt, marknad m.m.) och förslag på verksamhetsspecifika/distributionsrisker ni kan acceptera eller avfärda. Byråns geografiska marknad hålls skild från kundens hemvist.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Enkätsvar syns på Vilka är våra kunder',
    summary: 'På Vilka är våra kunder visas en read-only sammanfattning av svaren från byråprofil-enkäten om kundstock, geografi och kundintroduktion. Saknas svar finns en länk till att fylla i enkäten.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Byråprofil: tydligare branschval',
    summary: 'I enkäten är de inre frågekorten borttagna. Ni lägger till kundernas branscher via sök, och högriskbranscher väljs på samma sätt med antal per bransch — utan långa inre listor.'

  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Full tjänstöversikt utan att redigera',
    summary: 'När ni fäller ut Visa översikt på ett tjänstkort visas risknivåer och motiveringar, tjänstebeskrivning, hot, sårbarheter och åtgärder — utan avklippning. Utförandesvaren finns kvar i Redigera.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Fällbar översikt på tjänstekorten',
    summary: 'På Vilka tjänster erbjuder ni? kan ni klicka Visa översikt på ett kort för att se riskmotivering, hot, sårbarheter och åtgärder utan att öppna Redigera.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Ta bort tjänst från katalogen',
    summary: 'På varje tjänstkort syns nu Ta bort uppe till höger. Egna och standardtjänster kan tas bort från listan. Standardtjänster kan läggas till igen via Lägg till standardtjänst. Finns kunder kopplade visas ett tydligt fel och borttagning blockeras.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Tjänstesidan: lägg till standard eller egen längst ner',
    summary: 'Under tjänstlistan finns knapparna Lägg till standardtjänst och Skapa egen tjänst. Header-knappen för egen tjänst är dold så valet samlas längst ner.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Hot och modus: källa är valfritt',
    summary: 'På hot och sårbarheter behöver ni inte fylla i källa. Fältet är ihopfällt bakom Lägg till källa (valfritt), och hjälptexten kräver det inte längre.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Tjänstesidan: välj standard eller egna först',
    summary: 'När ni öppnar tjänstekatalogen första gången får ni välja: använd ClientFlows förvalda standardtjänster, eller börja tomt och lägg till egna. Listan fylls inte i automatiskt innan ni valt.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Byråprofil: Klarmarkera på sista steget',
    summary: 'På sista sidan i byråprofil-enkäten visas bara Klarmarkera (inte Nästa). Klick sparar profilen, ikryssar Kom igång-steget och tar dig tillbaka till översikten — eller visar tydligt vilka frågor som saknas.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Tjänstekatalog: översikt, ta bort och lägg till',
    summary: 'På tjänstesidan kan ni fälla ut en översikt utan att öppna redigera, ta bort tjänster från katalogen, och längst ner välja Lägg till standardtjänst eller Skapa egen tjänst. Källa på hot/sårbarhet är valfri. Byråprofilen frågar antal kunder i utsatta områden när svaret är Ja.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Vilka är våra kunder',
    summary: 'Sidan Kundrisker mm heter nu Vilka är våra kunder. Kundens geografi (egen hemvist och motparters geografi) samlas där. Övriga riskfaktorer handlar om byråns arbetssätt: distribution och verksamhetsspecifikt.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Byråprofil och tjänstekatalog: tydligare start',
    summary: 'Enkäten har tätare marginaler för bolagsformer/antal, följdfråga om antal vid Ja (högrisktjänster och vissa kundfrågor), och Klarmarkera på sista steget fungerar igen. På tjänstesidan får ni först välja standardtjänster eller egna tjänster.'
  },
  {
    date: '2026-09-12',
    importance: 3,
    title: 'Egna källor i Byråns AML-profil',
    summary: 'I källkatalogen kan ni lägga till egna källor (namn + valfri länk) utöver standardlistan. Dekorativa ikoner i rubrikerna är borttagna.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Kundformulär på kundkortet',
    summary: 'Ny flik Kundformulär: samma formulär som kunden ska besvara. Byrån kan prefilla uppgifter, se svar och när kunden svarat. BankID-signering byggs ut härnäst.'
  },
  {
    date: '2026-09-12',
    importance: 3,
    title: 'Tätare källkatalog i Byråns AML-profil',
    summary: 'Källorna visas som rader med Tagit del / Använder / Inte relevant – utan förval. Motivering syns bara när ni väljer Inte relevant, och progress visar hur många som är granskade.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'Byråprofil: antal anställda sparas igen',
    summary: 'Enkäten Byråns interna profil kunde inte spara antal anställda (Airtable-fel). Värdet skickas nu som text, som fältet kräver.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'Byråns AML-profil – ny primär väg',
    summary: 'Under Riskbedömning finns Byråns AML-profil: åtta steg som pekar in i befintliga sidor, plus en källkatalog (tagit del / använder / inte relevant) som måste fyllas innan slutgodkännande. Byrårutiner har fått egen rubrik för behandling av personuppgifter.'
  },
  {
    date: '2026-09-12',
    importance: 4,
    title: 'AML-kollen sparar utan Airtable-setup',
    summary: 'Fältet för AML-kollen-körningar skapas automatiskt i KUNDDATA vid första sparningen, så analysen inte längre fastnar på saknat fält.'
  },
  {
    date: '2026-09-12',
    importance: 5,
    title: 'AML-kollen via uppladdning (kontoutdrag + SIE)',
    summary: 'På kundkortets Dokumentation (Aktuell riskbedömning) kan ni nu köra en engångs-AML-koll genom att ladda upp kontoutdrag och SIE. Resultatet sparas på kunden med flaggade signaler (inkl. matchning bank↔bokföring och bruttomarginal mot SCB) som input till er riskbedömning.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Radera egna tjänster från katalogen',
    summary: 'Egna tjänster (Lägg till egen tjänst) kan tas bort från byråns katalog med bekräftelse. Finns kunder kopplade blockeras radering — samma skydd som vid inaktivering. Standardmallar behålls och inaktiveras i stället.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Stabilare sparning av utförandesvar',
    summary: 'När ni svarar snabbt på utförandefrågor och hämtar Clientflow-statistik sparas svaren utan rate-limit-fel. Autosparning köas och tillfälliga överbelastningar försöks igen automatiskt.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Ingen «Bekräftad» i sårbarhetstext',
    summary: 'Evidensetiketter som Bekräftad/Tjänstetypisk/Saknad information läggs inte längre in sist i sårbarhetsbeskrivningen. De syns inte i UI och rensas bort om AI ändå läcker dem — inklusive redan sparade texter när du öppnar tjänsten.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Ny standardtjänst: Kapitalvinstberäkningar',
    summary: 'Kapitalvinstberäkningar finns nu som fördefinierad byråtjänst med AML-utförandefrågor om tillgångsslag, underlag, utlandskoppling och närståendeförsäljningar.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Färre frågor för årsredovisning',
    summary: 'Utförandefrågan om uppgifter till bank, investerare eller annan extern part är borttagen från årsredovisningsmallen — årsredovisningar är offentliga underlag.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'AI-förslag i tre zoner',
    summary: 'På Hot och modus (samt sårbarheter och åtgärder) delas AI-förslag upp i Föreslås tas bort, Nytt förslag och Oförändrat. Bannerknapparna är Granska alla och Avfärda alla.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Tydligare: komplettera i efterhand',
    summary: 'Alternativet «Kunden får komplettera» i utförandefrågor heter nu «Kunden får komplettera i efterhand», så det framgår att kompletteringen sker efteråt. Tidigare sparade svar räknas fortfarande.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Utförandefrågor: kunder i stället för kunden',
    summary: 'Ja/nej-frågorna om kund- och leverantörsreskontra frågar nu om byrån hanterar reskontra åt kunder (generellt), inte «åt kunden».'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Klarmarkera steg i Din resa',
    summary: 'I tjänstmodalen kan du klarmarkera varje steg under «Din resa». Klarmarkerade steg behåller ifylld cirkel även när du byter flik, och sparas med tjänsten.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Aktiva tjänster skyddas och styrs till kund',
    summary: 'Tjänster som är kopplade till minst en kund kan inte inaktiveras i katalogen. På kundens riskbedömning går det bara att välja byråns aktiva tjänster — inte inaktiva.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Skarpare AI-kalibrering av S×K',
    summary: 'AI undervärderar inte längre sannolikhet och konsekvens mot Normal som default. Vid ansökan + betalningsuppgifter ska inneboende risk oftast vara minst Förhöjd (S×K ≥ 10), medan residual fortfarande kan sänkas av faktiska kontroller.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Feedback längst ner på residualrisk',
    summary: 'Synpunktsfältet på residualriskfliken ligger nu längst ner i panelen, i samma petroltonade kortstil som övriga delar av tjänstmodalen.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Exakt tjänstnamn i kundstatistik',
    summary: 'När ni hämtar Clientflow-statistik till en tjänst räknas bara kunder med samma tjänstnamn (eller samma kopplade tjänst-id). Olika namnvarianter slås inte längre ihop via alias, och raden «Matchade kundernas tjänst» visas inte.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Tydligare hot-kort',
    summary: 'Hot och modus (samt sårbarheter och åtgärder) har klarare ytor: varningskant till vänster, lugnare beskrivningsfält, en källrad utan upprepning, och en tydligare Lägg till-knapp.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Tjänstmodalen som en resa',
    summary: 'Vänsterspalten i tjänstmodalen är nu en luftig tidslinje under etiketten «Din resa», utan bakgrundsyta och antal-markörer. Svarschipsen är mer pillformade.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Komplett AI-analys av tjänsten',
    summary: 'Generera AI-analys ger förslag på alla flikar (Översikt, Hot, Sårbarheter, Inneboende risk, Åtgärder och Residualrisk) — inte bara Översikt — utifrån byråquiz, utförandefrågor, statistik och hjälpdokument.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Tjänstelistan som kort',
    summary: 'På Riskbedömning av byråns tjänster visas varje tjänst som ett kort med ikon, växel för aktiv/inaktiv och samma accentstil som tjänstmodalen.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Tillgångar i lantbruk',
    summary: 'Utförandefrågan om vilka typer av tillgångar som hanteras (anläggningsregister) har fått alternativet Tillgångar i lantbruk.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Putsad tjänstmodal',
    summary: 'AI-förslagsraden sitter i modalhuvudet, svarschips wrappas utan att klippas, statistikraderna har jämnare rytm, och chips får tydligare hover.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Tydligare S×K-motivering',
    summary: 'Sannolikhet och konsekvens har nu egna ord (t.ex. 3 = medel/kännbar). AI-motiveringen ska använda samma ordlista och inte kalla en Normal risk (S×K 9) för «förhöjd sannolikhet».'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Nytt svarsalternativ för materialkanal',
    summary: 'Utförandefrågan om hur byrån får material har fått alternativet Uppladdning i kundmapp (utan BankID-inlogg), bland annat för löpande bokföring och bokslut.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Feedback på residualrisk',
    summary: 'På residualriskfliken i tjänstmodalen kan ni skicka synpunkter direkt till feedback@clientflow.se. Mejlet inkluderar inloggad användare, byrå och tjänstnamn.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Tydligare färger i tjänstmodalen',
    summary: 'Aktiv sektion, svarsalternativ och antal-markörer använder samma petrolton som sparaknappen, och frågekorten skiljer sig tydligare från bakgrunden.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Sidonavigering i tjänstmodalen',
    summary: 'När ni redigerar en tjänst ligger sektionerna i en vänsterspaltsmeny i stället för en horisontell flikrad. Frågor från din ClientFlow AI visas som kort, och AI-markeringen är en diskret gnistra bredvid sektionsnamnet.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Renare tjänstekort',
    summary: 'Tjänstekort med befintlig riskbedömning visar inte längre hjältexten under verktygsraden. Öppna analysen med Redigera eller genom att klicka på tjänstnamnet. Kort utan analys har kvar knapparna för AI-utkast och manuell redigering.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Konkretare AI-hot och modus',
    summary: 'När AI skriver hot och modus ska den förklara mekanismen steg för steg: vilken uppgift som kan vara felaktig, hur pengar kan komma in eller flyttas, vilken roll byrån får, och om det avser penningtvätt, terrorismfinansiering eller båda. För ROT/RUT lyfts bland annat oriktiga ansökningar och felaktiga utbetalningar från Skatteverket. Terrorismfinansiering avfärdas inte bara för att tjänsten inte gäller ideell verksamhet eller utland.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Utförandefrågor först i tjänsteanalysen',
    summary: 'När ni öppnar en tjänst landar ni på Utförandefrågor. Därefter kommer Översikt, Hot och modus, Sårbarheter, Inneboende risk, Riskreducerande åtgärder och Residualrisk.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Utförandefrågor på egen flik',
    summary: 'I tjänsteanalysen ligger utförandefrågorna på en egen flik mellan Översikt och Hot. Knappen Generera AI-analys finns längst ner på den fliken.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Tydligare Redigera på tjänstekort',
    summary: 'Varje tjänst har nu en synlig Redigera-knapp i kortets verktygsrad, och tjänstnamnet går att klicka på för att öppna riskbedömningen.'
  },
  {
    date: '2026-09-03',
    importance: 5,
    title: 'Tjänstekort går att redigera igen',
    summary: 'Knapparna för att öppna och redigera riskbedömning på tjänstekorten syntes inte efter flikombyggnaden. Kortens innehåll visas nu som det ska.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Tydligare flikar i tjänsteanalysen',
    summary: 'Utförandefrågor ligger på översiktsfliken i redigeringsvyn. Inneboende risk (S×K och motivering) och residualrisk har egna flikar — åtgärdsfliken visar bara riskreducerande åtgärder.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'TF-motivering borttagen',
    summary: 'Separat TF-motivering per tjänst finns inte längre. Den gula varningen, spärreglerna och AI-kraven på TF-täckning är borttagna — ni behöver inte längre motivera varför PT-analysen räcker när tjänsten saknar TF-hot.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Enklare rader i tjänsteanalysen',
    summary: 'Hot och sårbarheter visas med titel, beskrivning och källa. PT/TF, kategori och evidensetiketter är dolda i listan och i redigeringsraderna. Åtgärder har fortfarande Befintlig/Föreslagen och åtgärdstyp.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Enklare rader i tjänsteanalysen',
    summary: 'Ni behöver inte längre klassificera varje rad. Skriv vad som kan gå fel, varför det kan hända hos er, hur ni hanterar risken och vilken residualrisk som återstår. PT/TF, kategori och evidensstatus är borttagna från formuläret.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Tydligare tjänstebeskrivning och hot',
    summary: 'AI:n beskriver bara vad tjänsten innebär och vilka moment byrån utför — inte kontroller, bemanning eller residualrisk. Hot och modus förklarar konkret hur tjänsten kan missbrukas, med praktiska exempel som osanna fakturor i stället för svepande terrorismscenarier.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Statistik från Clientflow räknar rätt tjänst',
    summary: 'När ni hämtar statistik på utförandefrågorna räknas nu kunder även om tjänsten heter lite olika i katalogen och hos kunderna, till exempel Bokföring och Löpande bokföring. Misslyckas hämtningen visas ett fel i stället för nollor.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Tjänsteanalysen följer era utförandesvar',
    summary: 'AI:n bedömer tjänster strikt ur AML-perspektiv och utifrån hur ni faktiskt utför dem. «Kunden får komplettera» räknas som en svag, reaktiv åtgärd. Residualrisken blir inte låg bara för att någon åtgärd finns, och spekulativ terrorfinansiering sätts inte som huvudhot.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Exaktare källor i AI-förslag',
    summary: 'När AI föreslår ett hot ska källan peka på det konkreta dokumentet och kapitlet — till exempel nationell riskbedömning 2024/2025, kap. 4 — inte myndighetens startsida.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Hämta kundstatistik till tjänstefrågorna',
    summary: 'Högst upp på utförandefrågorna kan ni välja att hämta statistik från Clientflow: antal kunder med tjänsten, kontanter, utlandstransaktioner och liknande. Väljer ni Nej används byråns kundantal och ni anger ungefär hur många som har tjänsten.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'Kortare utförandefrågor för alla tjänster',
    summary: 'Varje standardtjänst har nu 4–6 konkreta frågor om hur den normalt utförs: vilket underlag som används, om byrån kan påverka redovisning eller betalning, vilka kunduppgifter som behövs och hur avvikelser hanteras. Följdfrågor visas bara när tjänsten faktiskt utförs.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Tydligare utförandefrågor för bokslut',
    summary: 'Bokslut har nu åtta korta frågor om hur tjänsten normalt görs: vem som bokfört under året, vilka andra tjänster som ingår, hur underlag kommer in, vilka kunduppgifter som behövs, bokslutsbokningar, kontroll av avvikelser, oklara poster och transaktioner med ägare eller närstående.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Tjänstens namn högst upp',
    summary: 'När ni redigerar en tjänst står namnet överst i rutan, ovanför flikarna.'
  },
  {
    date: '2026-09-03',
    importance: 4,
    title: 'En vy per tjänst',
    summary: 'Riskbedömningen av varje tjänst visas bara i tjänstekatalogen, inte en extra lista under. Saknas analys väljer ni AI-utkast eller manuell hantering.'
  },
  {
    date: '2026-09-03',
    importance: 2,
    title: 'Kortare tjänstesida',
    summary: 'Ingressen under Vilka tjänster erbjuder ni? är borttagen så sidan börjar direkt på tjänstekorten.'
  },
  {
    date: '2026-09-03',
    importance: 3,
    title: 'Tydligare tjänstekort',
    summary: 'Utförandefrågor och riskbedömning sitter i en renare växel. Frågorna är grupperade och svaren är chip i stället för en tät lista.'
  },
  {
    date: '2026-09-02',
    importance: 4,
    title: 'Frågor och riskbedömning per tjänst',
    summary: 'På Riskbedömning av byråns tjänster väljer ni per tjänst om ni vill öppna utförandefrågorna eller se själva riskbedömningen — beskrivning, hot, sårbarheter, åtgärder och residualrisk.'
  },
  {
    date: '2026-09-02',
    importance: 5,
    title: 'Byråspecifik AI-analys av varje tjänst',
    summary: 'Ni aktiverar era tjänster och svarar på korta praktiska frågor om hur de utförs. AI:n analyserar sedan hot, sårbarheter, inneboende risk och residualrisk utifrån era svar, kunddata och byråprofil — utan att hitta på fakta som saknas.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Följdfrågor visas bara vid Ja',
    summary: 'I Kom igång och Byråinformation döljs beskrivningsfält för outsourcing, near misses, tillsyn och stora kundberoenden tills ni svarar Ja. Ni behöver inte längre skriva Inga vid Nej.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Near misses inkluderar avböjda uppdrag',
    summary: 'I byråprofilen räknas near misses även som uppdrag ni tackat nej till när risken kunden innebar inte gick att hantera – inte bara avslutade kunder vid misstanke.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Högriskbranscher med uppskattat antal',
    summary: 'I Kom igång och Byråinformation anger ni högriskbranscher som flerval med ungefärligt antal kunder per bransch. Alternativet Delvis är borttaget från byråprofilens Ja/Nej-frågor.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Bolagsformer med antal – Delvis borttaget',
    summary: 'I Kom igång och Byråinformation bockar ni bolagsformer (AB, enskild firma, BRF, ideell förening m.fl.) och anger ett uppskattat antal per form. Fritextfältet är ersatt. Alternativet Delvis är borttaget från Ja/Nej-frågorna.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Byråprofilens val sparas säkert till Airtable',
    summary: 'Tomma rutor i Kom igång-enkäten och Byråinformation rensas innan sparning. Högriskbranscher och IT-system sparas som text så flerval inte krockar med Airtable-listor.'
  },
  {
    date: '2026-09-02',
    importance: 4,
    title: 'Flerval av IT-system i byråprofilen',
    summary: 'Under Byråinformation och i Kom igång-enkäten bockar ni ett eller flera bokförings-, boksluts- och kundhanteringssystem (med Annat + fritext). Sparningen undviker Airtable-select-fel.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Tydligare rubriker i tjänsteanalysen',
    summary: 'Tjänsteanalyserna använder nu ordningen Tjänsten → Hot och modus → Sårbarheter → Motivering av inneboende risk → Riskreducerande åtgärder → Motivering av residualrisk.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Ny vägledning för byråns tjänster',
    summary: 'På Riskbedömning av byråns tjänster finns nu en infällbar 5-stegsmetod, konkret bokslutsexempel och vanliga fällor från Länsstyrelsens sanktionsbeslut.'
  },
  {
    date: '2026-09-02',
    importance: 4,
    title: 'IT-system som kolumner i byråprofilen',
    summary: 'Under Byråinformation och i Kom igång-enkäten väljer ni bokförings-, boksluts- och kundhanteringssystem i listor (med Annat + fritext) i stället för ett fritt textfält.'
  },
  {
    date: '2026-09-02',
    importance: 4,
    title: 'Egna bilagor på uppdragsavtal',
    summary: 'På kundkortet kan ni ladda upp kundspecifika PDF-bilagor till uppdragsavtalet – t.ex. särskild tjänstebeskrivning eller annat avtal – utöver byråns standardbilagor.'
  },
  {
    date: '2026-09-02',
    importance: 4,
    title: 'Utökad byråprofil: historik, högrisktjänster och outsourcing',
    summary: 'Byråprofilen täcker nu även track record (Finanspolisen/Länsstyrelsen/near misses), kundberoenden, tjänster med förhöjd risk, kundintroduktion och underleverantörer.'
  },
  {
    date: '2026-09-02',
    importance: 5,
    title: 'Byråprofil-enkät i Kom igång',
    summary: 'Nytt steg 1 i Kom igång samlar byråns interna profil, kundstock, distribution, tjänster och geografi – inklusive fråga om kunder i Polisens utsatta områden. Svaren syns under Byråinformation och kalibrerar AI-riskbedömningen.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Identitet via ClientFlow utan datum',
    summary: 'När du väljer BankID via ClientFlow under Roller behöver du inte fylla i datum – metoden räcker.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Räkenskapsår som lista',
    summary: 'På kundkortet väljer ni räkenskapsår i en lista: kalenderår eller brutet år som feb-mars, mars-april och så vidare.'
  },
  {
    date: '2026-09-02',
    importance: 3,
    title: 'Högriskbranscher i byråprofilen',
    summary: 'Under Byrå & användare väljer ni högriskbranscher i kundstocken via flerval i stället för fritext.'
  },
  {
    date: '2026-09-01',
    importance: 3,
    title: 'AI-användning per användare',
    summary: 'ClientFlowAdmin kan under AI-användning se vilka användare och rutter som anropar OpenAI, inklusive tokens.'
  },
  {
    date: '2026-09-01',
    importance: 4,
    title: 'AML-nyheter visar bara nya artiklar',
    summary: 'Flödet döljer äldre inlägg, ämnessidor och siduppdateringar. Bara riktiga nyhetsartiklar med publiceringsdatum från 1 september 2026 och framåt visas.'
  },
  {
    date: '2026-09-01',
    importance: 3,
    title: 'Dölj Kom igång när allt är klart',
    summary: 'När alla steg i Kom igång är ibockade får du frågan om flödet ska försvinna från startsidan. Visa det igen via länken Visa Kom igång.'
  },
  {
    date: '2026-09-01',
    importance: 4,
    title: 'Lägre AI-kostnad för AML-nyheter',
    summary: 'AI-sammanfattningar av nyheter körs med tak per dygn, billigare modell och utan omkörning av gamla arkivposter vid varje dashboard-besök.'
  },
  {
    date: '2026-08-31',
    importance: 3,
    title: 'Samma AML-nyheter för alla byråer',
    summary: 'Nyheterna filtreras inte längre mot byråprofilen. Alla redovisningsbyråer ser samma aktuella flöde.'
  },
  {
    date: '2026-08-31',
    importance: 3,
    title: 'Bara aktuella AML-nyheter',
    summary: 'Nyhetsflödet visar artiklar från ungefär det senaste halvannat året. Äldre arkivsidor, till exempel från 2019 och 2020, döljs.'
  },
  {
    date: '2026-08-31',
    importance: 3,
    title: 'Inget veckobrev med AML-nyheter',
    summary: 'ClientFlow skickar inte längre ut ett veckovist nyhetsbrev med AML-nyheter. Nyheterna finns kvar i appen.'
  },
  {
    date: '2026-08-28',
    importance: 4,
    title: 'Identitetskontroll på Roller',
    summary: 'På varje person under Roller kan du ange när och hur identiteten kontrollerats. För verklig huvudman finns även «Huvudman kontrollerad mot Bolagsverket [datum]».'
  },
  {
    date: '2026-08-28',
    importance: 5,
    title: 'Två geografiska riskfaktortyper i databasen',
    summary: 'Hemvist (byråns kunder) och motparter (kundens kunder & leverantörer) är nu två skilda Typ av riskfaktor. Listorna på Övriga riskfaktorer och Kundrisker mm filtreras efter typ — samma faktor syns inte längre på båda sidorna. Befintliga mallar migreras automatiskt.'
  },
  {
    date: '2026-08-28',
    importance: 3,
    title: 'AI utgår från riskfaktorns namn',
    summary: 'När du genererar AI-förslag för en riskfaktor styrs texten av riskfaktorns benämning — inte bara av typen (t.ex. geografisk kategori).'
  },
  {
    date: '2026-08-28',
    importance: 2,
    title: 'Enklare uppdragsmall utan PTL-uppladdning',
    summary: 'Rutan «Underlag till PTL-åtgärd» är borttagen från redigering av uppdragsmall. Underlag laddas upp via fliken Dokumentation.'
  },
  {
    date: '2026-08-28',
    importance: 2,
    title: 'Tydligare datumfält och dropdowns',
    summary: 'Datumväljaren visar bara en kalendersymbol (utan siffror) och datumrutorna är kortare. Dropdowns i uppdragsredigering har samma stil som övriga listor i appen.'
  },
  {
    date: '2026-08-28',
    importance: 3,
    title: 'Renare vy för aktuella körningar',
    summary: 'När du fäller ut en körning på kundkortet visas en enklare layout utan upprepad titel och utan lådor runt varje del. Tom rutin och tomma riskåtgärder tar inte längre plats.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Renare redigering av uppdragsmall',
    summary: 'När du redigerar ett uppdrag på kundkortet visas ett enklare formulär: färre lådor, tydligare fält och valfria delar (schemalagd förfrågan) är ihopfällda tills du behöver dem.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Tydligare redigering av uppdrag',
    summary: 'På kundkortets flik Uppdrag ligger Alla uppdrag överst med tydlig Redigera-knapp och sammanfattning av mallen. Den utfällda körningsvyn är renare med tydliga block för rutin, åtgärder, underlag, anteckning och dokumentation.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Snabbare klarmarkering av uppdragskörningar',
    summary: 'När du klarmarkerar en körning på uppdragsboarden uppdateras status direkt utan att vänta på att alla framtida körningar ska skapas om i bakgrunden. Boarden hoppar inte heller längre till en full omladdning.'
  },
  {
    date: '2026-08-27',
    importance: 5,
    title: 'Kundrisker, omstrukturerad AR och tydligare geografi',
    summary: 'En ny sida Kundrisker mm samlar kundtyp, varningsflaggor och risksänkande faktorer. Allmän riskbedömning har omstrukturerats och kundens riskbedömning på kundkortet är justerad. Geografiska riskfaktorer är uppdelade i två spår: byråns kunder respektive kundens kunder/leverantörer.'
  },
  {
    date: '2026-08-27',
    importance: 5,
    title: 'Tydligare listor på dashboarden',
    summary: '«Kunder utan aktuell riskbedömning» visar bara saknad riskbedömning. KYC och uppdragsavtal har egna listor. Sparad riskbedömning syns direkt — du behöver inte öppna kundkortet för att listan ska uppdateras.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Snabbare sidladdning',
    summary: 'Kundkort och övriga sidor laddar typsnitt och skript mer effektivt. Hjälptexten under Verksam organisation är flyttad till ett frågetecken så första innehållet syns fortare, och layouten hoppar mindre under laddning.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Tydligare adressstatistik mot Polisen',
    summary: 'Under Utsatta områden visas ungefärlig ortskontroll separat från «Ej i utsatt område». Kundlistan öppnas bara för träffar och geokodningsfel — inte för kunder där allt redan är OK. Leads och avslutade räknas inte.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'KYC-formulär går att spara igen',
    summary: 'Ett tekniskt fel vid uppdatering av riskfaktorer efter sparning kunde ge felmeddelande trots att KYC faktiskt sparades. Det är åtgärdat — spara fungerar och vyn uppdateras som tänkt.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Utskickat KYC syns igen efter kunduppdatering',
    summary: 'Om KYC-formuläret redan skickats för signering via Inleed försvinner inte längre status och länkar när du uppdaterar kunden eller sparar andra fält. Systemet hittar utskicket även om företagsnamnet ändrats.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Tyskland och EU-länder styr Europa korrekt',
    summary: 'KYC-länder som Tyskland kopplas nu till geografisk residual Europa — inte närområde — även om internationell handel tidigare stod som Nej. AI-riskbedömningen får tydligare geografiskt underlag från KYC.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Renare kort på riskbedömningen',
    summary: 'Horisontella avdelare på riskbedömningskorten är borttagna — samma innehåll, enklare layout med luft och rubriker istället för streck.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Oacceptabel som varningsflagg-klass',
    summary: 'I Kundrisker mm kan en varningsflagga klassas som Oacceptabel. När den är ikryssad på kundkortet blir hela riskbedömningen Oacceptabel direkt — utan att andra faktorer behöver kombineras.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Bara aktiva varningsflaggor på kundkortet',
    summary: 'Övriga förslag i Kundrisker mm visas inte längre som val på kundens riskbedömning förrän byrån lagt till dem i katalogen.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Inaktiva tjänster tas bort från kunder',
    summary: 'Tjänster som är inaktiverade i byråns katalog ligger inte längre kvar som dolda val på kundkortet. Äldre okatalogiserade tjänster (t.ex. Avstämning) rensas automatiskt när kundkortet öppnas.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Renare riskfaktorer i KYC',
    summary: 'På kundkortet under Övrig KYC visas bara riskfaktorer som faktiskt gäller kunden — övriga dolda. Geografiska och verksamhetsfaktorer styrs fortfarande automatiskt från länder och KYC-svar.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Bättre geokodning av gårdsadresser',
    summary: 'Landsbygdsadresser som SIMONTORP 1175, 28994 GLIMÅKRA geokodas nu via postnummer + ort när exakt adress saknas i OpenStreetMap. Tidigare geokodningsfel körs om automatiskt när kundkortet öppnas.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Större popup vid redigering av tjänst',
    summary: 'Dialogen Lägg till / Redigera tjänst tar nu nästan hela skärmen i bredd och höjd — mer plats för hot, sårbarheter och åtgärder utan att scrolla i onödan.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Renare layout för AI-förslag på hot och sårbarheter',
    summary: 'När AI föreslår ändringar i en hot-rad visas fälten nu staplade med tydliga etiketter (typ, titel, beskrivning, källa) — inte ihoptryckta på en rad.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Bättre geokodning av landsbygdsadresser',
    summary: 'När en exakt gårds- eller landsbygdsadress saknas i OpenStreetMap försöker systemet nu med ort och postnummer i stället — så fler adresser kan kontrolleras mot Polisens utsatta områden.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Tydligare uppdelning i tjänstformuläret',
    summary: 'Fältet heter nu bara Tjänstebeskrivning (eller Beskrivning för övriga riskfaktorer). Inneboende risk finns kvar i S×K-bedömningen och motiveringen — inte dubbelt i rubriken.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Rätt lagrum på allmän riskbedömning (PDF)',
    summary: 'Första sidan i exporterad allmän riskbedömning och rutiner hänvisar nu till 2 kap. 1–2 §§ och 8 § lagen (2017:630) — inte 4 kap. 3 § som gäller misstankeanmälan till Polisen.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Mer luft före geografiska riskfaktorer',
    summary: 'På Övriga riskfaktorer och Kundrisker mm har rubriken «Geografisk riskfaktorer - här finns byråns kunder» fått extra mellanrum ovanför för tydligare avdelning från föregående sektion.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'AI anpassad för redovisningsbyråer',
    summary: 'AI-förslag för tjänster, riskfaktorer och riskbedömning utgår nu tydligt från redovisningsbyråns verklighet — inte banksektorns AML-rutiner som transaktionsmonitorering och kontouttag.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Renare rubriker på Övriga riskfaktorer',
    summary: 'Sektionsrubriken «Distribution, geografi och verksamhet» ovanför filter och listan är borttagen — sidans huvudrubrik och underrubrik räcker.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Tydligare AI-förklaringar vid tjänst och riskfaktor',
    summary: 'När AI föreslår att lägga till, ändra eller ta bort hot, sårbarheter och text visar den nu varför — per rad och med kort sammanfattning av vad som ändras.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'AI använder tjänstkatalog vid analys',
    summary: 'När du genererar AI-förslag för en tjänst (t.ex. Bokföring eller Kundreskontra) får modellen nu strukturerat underlag med hot, sårbarheter, indikatorer och åtgärder från ClientFlows riskanalys-katalog — matchat på tjänstnamn.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Aktivera övrig riskfaktor sparas korrekt',
    summary: 'Knappen Aktivera på Övriga riskfaktorer sparar nu status i Airtable (tidigare försvann värdet och raden förblev grå). Motiveringskrav blockar inte längre enbart statusbyte.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Aktivera övrig riskfaktor fungerar igen',
    summary: 'Knappen Aktivera på Övriga riskfaktorer och Kundrisker mm misslyckades tidigare eftersom servern krävde PT/TF även vid enbart statusbyte. Det är åtgärdat.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Övriga förslag för varningsflaggor',
    summary: 'Under Kundrisker mm kan ni välja bland färdiga varningsflaggor per kategori (A–C) — t.ex. mutförsök, osanna fakturor och svårighet att verifiera VH. Klicka plus för att lägga till i byråns katalog.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Ny varningsflagga: mutförsök',
    summary: 'Under Hur samarbetar vi? finns nu «Kunden erbjuder pengar, ersättning eller ovanliga förmåner» som Hög-aktiv varningsflagga (mutförsök mot konsulten).'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Klickbar kundlista för utsatta områden',
    summary: 'På Statistik kan ni klicka på raderna under Utsatta områden (Polisen) för att se vilka kunder som ligger i respektive kategori — t.ex. ej i utsatt område eller kunde inte geokoda.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Korrekt kundantal per tjänst i statistik',
    summary: '«Kunder per tjänst» räknar nu unika kunder. Dubbla tjänst-länkar till samma tjänst (t.ex. två poster med namnet BOKSLUT) gav tidigare för högt antal jämfört med kundlistan.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Vägledande fråga i AR 2.1.5',
    summary: 'Under Verksamhetsspecifika omständigheter visas en vägledande fråga om hur byråns organisation, arbetssätt, kompetens och kontrollmiljö påverkar möjligheten att upptäcka missbruk av redovisningstjänster. Samma fråga finns i infotexten och i AI-förslagen.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Kompakt utsatt-område vid adressen',
    summary: 'På kundkortet visas Polisens utsatt-områdeskontroll direkt vid adressen: grön om ok, röd om träff, grå om geokodning misslyckas. Förklaring i tooltip — ingen separat sektion eller «Kontrollera igen»-knapp.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Kundantal och inaktivera riskfaktorer',
    summary: 'På Kundrisker mm, Övriga riskfaktorer och Byråns tjänster syns hur många aktiva kunder som har varje riskfaktor, tjänst eller varningsflagga. Riskfaktorer och tjänster kan inaktiveras — de blir då bleka utan färg.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Ny rubrik för geografi på Kundrisker mm',
    summary: 'Geografisektionen på Kundrisker mm heter nu «Geografisk riskfaktorer - här finns kundens kunder». På Övriga riskfaktorer behålls «…byråns kunder».'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Geografiska riskfaktorer tillbaka på Övriga riskfaktorer',
    summary: 'Geografisk riskfaktorer - här finns byråns kunder ligger igen på Övriga riskfaktorer. Samma byråspecifika poster visas också i eget block på Kundrisker mm — ändringar på en sida gäller båda.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Ny ordning i sidomenyn',
    summary: 'Under Riskbedömning byrå ligger Övriga riskfaktorer nu ovanför Kundrisker mm.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Ny rubrik för distributionskanaler',
    summary: 'På sidan Övriga riskfaktorer heter sektionen nu «Distrubutionskanaler - såhär möter vi våra kunder».'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Ny sida: Kundrisker mm',
    summary: 'Kundresidual, geografiska riskfaktorer, varningsflaggor och risksänkande faktorer ligger nu på sidan Kundrisker mm. Övriga riskfaktorer visar distribution och verksamhetsspecifika risker.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Geografisk risk under Vem är kunden?',
    summary: 'Geografiska riskfaktorer heter nu «Geografisk riskfaktorer - här finns byråns kunder» och ligger under kort B på kundkortet tillsammans med kundresidual. På Kundrisker mm visas de som underrubrik under Riskfaktorer kopplat till kund.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Utländska huvudmän kopplat till hemvist',
    summary: 'Riskfaktorn «Kunder med utländska huvudmän» styrs nu från skatterättslig hemvist hos både verklig huvudman och företrädare i KYC-formuläret.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Kontanter täcks av kundresidual',
    summary: 'Varningsflaggan «Kontantintensiv verksamhet» är borttagen. Kontanthantering styrs i stället av riskfaktorn «Kunder med mycket kontanta transaktioner» via KYC och kundresidual.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Högriskländer kopplat till KYC',
    summary: 'Riskfaktorn heter nu «Kunden har handel med högriskländer» och ligger under kundresidual. Den styrs automatiskt när KYC avsnitt 6 anger handel med länder på EU:s högriskförteckning.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'KYC: kryptovaluta och koppling till risk',
    summary: 'KYC-formuläret har en ny fråga om kryptovaluta. Svar Ja styr verksamhetsresidual (som kontanter). Dashboarden varnar om byrån saknar riskfaktorn och kan skapa ett utkast på Övriga riskfaktorer.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Senast uppdaterad från Bolagsverket',
    summary: 'På kundkortet visas nu när Bolagsverket-uppgifterna senast hämtades eller sparades, bredvid knappen Uppdatera.'
  },
  {
    date: '2026-08-27',
    importance: 5,
    title: 'Utsatta områden: statistik och geografisk risk',
    summary: 'Träffar mot Polisens utsatta områden syns på statistiksidan och i AR under geografi. Kunder med adress i särskilt utsatt område kopplas automatiskt till riskfaktorn «Särskilt utsatt område i Sverige» under geografisk residual.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Utsatta områden på kundkortet',
    summary: 'Kundens adress kontrolleras automatiskt mot Polisens lista över utsatta och särskilt utsatta områden. Resultatet visas under Bolagsverket-uppgifter med tydlig flagga.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'AR: redigera rubriker och dölja diagram',
    summary: 'På Allmän riskbedömning kan du ändra rubriker och dölja statistikblock (diagram, auto-text). Spara anpassningar i sidhuvudet. Verksamhetsspecifika omständigheter visar inte längre kunddiagram.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'AR 2.1.5: AI fokuserar på byrån',
    summary: 'AI-förslag under Verksamhetsspecifika omständigheter handlar nu om byråns storlek och komplexitet – t.ex. få anställda och många kunder att ha koll på – i stället för kundernas risknivåer och branscher.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Statistik: omsättning och anställda',
    summary: 'På statistiksidan för riskbedömning ser du nu hur många kunder som har respektive omsättningsintervall och antal anställda. Klicka på en rad för att se vilka företag det gäller.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Kontant, krypto och betalkort under kundresidual',
    summary: 'Riskfaktorerna «Kunder med mycket kontanta transaktioner», «Kunder som handlar med kryptovaluta» och «Kunder med transaktioner via Betalkort» ligger nu under Riskfaktorer kopplat till kund på sidan Övriga riskfaktorer. Befintliga poster flyttas automatiskt.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'AR: distributionsdiagram utan varningsflaggor',
    summary: 'Cirkeldiagrammet «Andel kunder per distributionskanal» visar nu bara faktiska kanaler (t.ex. fysiskt möte, distans med BankID) – inte övriga flaggor under Hur samarbetar vi? som «Ovanlig tidsnöd».'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'AR: rätt faktorer i distributionsdiagram',
    summary: '«Kundens egna kunder är på distans» ligger kvar under Vad gör kunden? på kundkortet men visas inte längre i AR:s diagram över distributionskanaler.'
  },
  {
    date: '2026-08-27',
    importance: 1,
    title: 'AR: enklare formuleringar',
    summary: 'Texterna i allmän riskbedömning säger nu byrå/byrån i stället för inloggad byrå.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Statistik: PEP från KYC-formuläret',
    summary: 'PEP-statistiken bygger nu på KYC punkt 4 (PEP-status och familjemedlem/medarbetare till PEP), inte på automatiska screeningträffar mot företaget.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Verklig huvudman: 25 % eller mer',
    summary: 'AML-grundkursen och KYC-formuläret har uppdaterats: tröskeln för verklig huvudman är numera 25 % eller mer (nytt från juli 2026), inte mer än 25 %. '
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Uppdragsavtal fylls i från dokumentation',
    summary: 'Finns ett uppdragsavtal i dokumentationen som är yngre än fem år fylls avtalsdatum och markeringen utanför ClientFlow i automatiskt på fliken Uppdragsavtal.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Dokumentation - historik sist',
    summary: 'Kortet Dokumentation - historik ligger nu längst ner på dokumentationsfliken på kundkortet.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Datum vid dokumentuppladdning',
    summary: 'När du laddar upp dokument på kundkortet kan du ange skapat datum direkt i uppladdningsrutan — i stället för att sätta det i efterhand.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Datum för senaste riskbedömning',
    summary: 'Vid knappen Dokumentera riskbedömning på kundkortet syns nu när kundens senaste riskbedömning gjordes eller dokumenterades.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Inga &nbsp; i KYC från kundkortet',
    summary: 'Text från Verksamhet, Kostnader och Intäkterna på kundkortet avkodas nu korrekt när KYC-formuläret fylls i — HTML-entiteter som &nbsp; följer inte längre med.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Redigera i AR fungerar igen',
    summary: 'När du klickade på pennan i avsnitt 2 kunde hela sektionen försvinna. Redigering öppnar nu bara det aktuella fältet.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Statistik räknar bara aktiva kunder',
    summary: 'Sidan Statistik och kundstatistik i Allmän riskbedömning byrå inkluderar nu endast pågående kunder — leads, avslutade och dolda kunder räknas inte med.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Bolagsformer slås ihop i AR-statistik',
    summary: 'I kundstatistik under 2.1.2 räknas AB och Aktiebolag som samma form, liksom EF, enskild firma och fysisk person — inga dubbla bolagsformsrader längre.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Smartare kundstatistik i AR 2.1.2',
    summary: 'Länsstyrelsens krav visas som hover vid rubriken. Branscher och omsättning/anställda beskrivs i kategorier och löpande text — AI föreslår samma narrativa stil med fokus på högriskbranscher.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Renare layout i AR avsnitt 1–2',
    summary: 'Under Allmän riskbedömning byrå är avsnitt 1 och 2 utplattade — inga kort i kort längre. Rubriker och text flyter i samma block.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'Spara AR-kartläggning fungerar',
    summary: 'Texter under 2.1.2–2.1.5 sparas utan felet Unknown field name: AR Kartläggning (JSON). Fältet skapas automatiskt i Airtable vid behov.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Renare 2.1.1 Våra tjänster',
    summary: 'Under kartläggningen heter avsnittet nu 2.1.1 Våra tjänster. Introtext och extra rubrik i stapeldiagrammet är borttagna — antal kunder per tjänst syns direkt i diagrammet.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Tjänstanalys är nu avsnitt 3',
    summary: 'Analys av våra produkter och tjänster är omnumrerad till avsnitt 3. Källtext och stapeldiagram-hänvisning är borttagna från blocket.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Metod för riskbedömning under avsnitt 1',
    summary: 'Metod för riskbedömning ligger nu som 1.1 under Syfte och omfattning i stället för som eget avsnitt 3.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Byråns nyckeltal borttaget från AR',
    summary: 'Sektionen Byråns nyckeltal (antal anställda, omsättning, antal kundföretag) finns inte längre under Allmän riskbedömning byrå. Uppgifterna redigeras i Byrå → Användare.'
  },
  {
    date: '2026-08-27',
    importance: 4,
    title: 'AR avsnitt 2 – kartläggning med statistik och AI',
    summary: 'Under Beskrivning av byråns verksamhet finns nu 2.1 Kartläggning med tjänster (stapeldiagram), kunder, distributionskanaler, geografi och verksamhetsspecifika omständigheter. AI kan skriva text utifrån statistik och Länsstyrelsens krav.'
  },
  {
    date: '2026-08-27',
    importance: 3,
    title: 'Registrera utbildning med namn och kursintyg',
    summary: 'Under Byrå → Utbildningar kan du ange anställd, ladda upp kursintyg och spara mot rätt Airtable-fält. Felet "Unknown field name: Namn" är åtgärdat.'
  },
  {
    date: '2026-08-27',
    importance: 2,
    title: 'Enklare riskbedömningssida på kundkortet',
    summary: 'Rutan Kunden & verksamheten (frekvens, verklig huvudman m.m.) visas inte längre på riskbedömningssidan — uppgifterna finns kvar på övriga flikar i kundkortet.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'Motivering syns i listor och dokumentation',
    summary: 'Motivering av inneboende och residual risk visas nu när du expanderar en tjänst eller riskfaktor, samt i Dokumentation och allmän riskbedömning.'
  },
  {
    date: '2026-08-26',
    importance: 4,
    title: 'AI föreslår motivering av S och K',
    summary: 'När du genererar med AI på Byråns tjänster eller Övriga riskfaktorer fyller AI i motivering av inneboende och residual risk om fälten är tomma — eller visar förslag att kopiera in vid granskning.'
  },
  {
    date: '2026-08-26',
    importance: 5,
    title: 'Obligatorisk motivering vid hög risk i allmän riskbedömning',
    summary: 'På Byråns tjänster och Övriga riskfaktorer: motivera S och K var för sig (minst 50 tecken) vid Förhöjd/Hög/Oacceptabel. Exporten visar S, K och motivering separat — poster som saknar text flaggas.'
  },
  {
    date: '2026-08-26',
    importance: 4,
    title: 'Tydligare varning om aktuell riskbedömning',
    summary: 'Dashboarden visar bara kunder som saknar något i aktuell riskbedömning: dokumenterad kundens riskbedömning, signerat KYC, samt PEP/sanktionssökning på företag och personer inom ett år.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'S×K synligt per tjänst i riskbedömningen',
    summary: 'Inneboende och residual visas med sannolikhet och konsekvens. Tjänstrutan fälls ihop efter sparning och visar korrigerad risk i rubriken.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'Tydligare kundens riskbedömning',
    summary: 'Förutsättningar och risknivå är förenklade: en rad visar vad som påverkar beräkningen, S×K-justering ligger under ”Justera risk”, och förutsättningar döljs när du redigerar bedömningen.'
  },
  {
    date: '2026-08-26',
    importance: 4,
    title: 'KYC kopplas till dokumentationen',
    summary: 'Dokument under KYC-formulär bockar i ”Finns utanför ClientFlow” och sätter utfört datum. Underkategori väljs vid uppladdning och redigering.'
  },
  {
    date: '2026-08-26',
    importance: 4,
    title: 'KYC-uppföljning efter kundrisk',
    summary: 'KYC-formulär flyttas till historik efter riskbaserade intervall: lågrisk vart 5:e år, normalrisk vart 3:e år och högrisk (PEP, kontantintensiv, högriskland) årligen. Ny adress, ägarförändring eller ovanlig transaktion flyttar också KYC till historik tills nytt formulär signeras.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'Enklare dokumentlista',
    summary: 'Klicka på dokumentnamnet för att öppna det. Visa- och Ladda ner-knapparna är borttagna – ladda ner från förhandsvisningen. Skapat datum ändras genom att klicka på datumet (eller pennan om datum saknas) och accepterar format som 2026-01-01, 20260101 och 260101.'
  },
  {
    date: '2026-08-26',
    importance: 4,
    title: 'Aktuell riskbedömning med underrubriker',
    summary: 'Dokumentation riskbedömning heter nu Aktuell riskbedömning och grupperar KYC, kundens riskbedömning, PEP-sökningar och övrigt. Äldre versioner flyttas automatiskt till Historik riskbedömning efter regler eller när ny version skapas.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'Ny kategori: Historik Riskbedömning',
    summary: 'På Dokumentation kan du nu ladda upp och sortera äldre riskbedömningar under den egna kategorin Historik Riskbedömning.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'Dokument går att spara igen',
    summary: 'Redigering av namn, kategori och skapat datum på Dokumentation misslyckades ibland med fel 422 – det är åtgärdat.'
  },
  {
    date: '2026-08-26',
    importance: 3,
    title: 'Skapat datum på dokumentationen',
    summary: 'På fliken Dokumentation visas kolumnen Skapat datum. Du kan ändra datumet för uppladdade filer; dokument som skapats via ClientFlow visar signeringsdatum och är låsta.'
  },
  {
    date: '2026-08-25',
    importance: 2,
    title: 'Kompakt lista för risksänkande faktorer',
    summary: 'Under Övriga riskfaktorer ligger namn, förklaring och källa på samma rad, som varningsflaggorna ovanför.'
  },
  {
    date: '2026-08-25',
    importance: 3,
    title: 'Rätt datum på AML-nyheter',
    summary: 'Nyheterna visar publiceringsdatum från källan. Saknas datum visas inget datum i stället för dagen då artikeln hämtades.'
  },
  {
    date: '2026-08-25',
    importance: 2,
    title: 'Rubrik ovanför beskrivningsrutorna',
    summary: 'På kundkortet står Verksamhet, Kostnader, Intäkterna och Bokföring med förklaringen ovanför den grå rutan, inte inuti den.'
  },
  {
    date: '2026-08-25',
    importance: 3,
    title: 'Tomt verksamhetsfält utan malltext',
    summary: 'Verksamhet under Beskrivning av kunden öppnas tomt i stället för att visa den förifyllda texten Beskrivning av kunden.'
  },
  {
    date: '2026-08-25',
    importance: 2,
    title: 'Längre text i varningsflagg-diagrammet',
    summary: 'I allmän riskbedömning får namnen på varningsflaggor mer plats, och staplarna är kortare.'
  },
  {
    date: '2026-08-25',
    importance: 2,
    title: 'Samma typsnitt på byråns tjänster',
    summary: 'Riskbedömning av byråns tjänster använder ett typsnitt genom hela sidan, så intro, kort och lista inte blandar olika fonts.'
  },
  {
    date: '2026-08-25',
    importance: 3,
    title: 'Diagram i allmän riskbedömning',
    summary: 'Avsnitt 5 visar staplar för varningsflaggor och cirkeldiagram över andelar för distribution, hemvist och verksamhet. Distributionskanalerna ligger ovanför diagrammet.'
  },
  {
    date: '2026-08-25',
    importance: 4,
    title: 'Risksänkande faktorer per byrå',
    summary: 'Under Övriga riskfaktorer kan byrån lägga till, redigera och ta bort risksänkande faktorer med förklaring och källa. Kundkortet visar byråns lista.'
  },
  {
    date: '2026-08-25',
    importance: 3,
    title: 'Länder från KYC-formuläret',
    summary: 'Under Vad gör kunden? hämtas länderna kunden handlar med från KYC-formuläret, avsnitt 6. De styr fortfarande geografisk residual.'
  },
  {
    date: '2026-08-25',
    importance: 3,
    title: 'Lugnare varningsflaggor',
    summary: 'Varningsflaggorna är neutrala tills de är ibockade. Då syns rött eller orange som signal, utan texterna Hög-aktiv och Bidrar vid kombination på varje rad.'
  },
  {
    date: '2026-08-25',
    importance: 2,
    title: 'Högriskbransch röd bara när den gäller',
    summary: 'Rubriken Kunden verkar i en högriskbransch är röd bara när en bransch är vald, till exempel från SNI. Annars ser den ut som övriga riskfaktorer.'
  },
  {
    date: '2026-08-25',
    importance: 5,
    title: 'Analys av tjänster i allmän riskbedömning',
    summary: 'Avsnitt 4 heter nu Analys av våra produkter och tjänster och visar byråns tjänstekort plus ett stapeldiagram över kunder per tjänst, filtrerat på inloggad byrå. Avsnitt 5 är Identifierade risker och sårbarheter med kundtyper, distribution, geografisk hemvist och verksamhetsspecifika faktorer.'
  },
  {
    date: '2026-08-25',
    importance: 1,
    title: 'Plus för ny varningsflagga',
    summary: 'Under Övriga varningsflaggor är Lägg till en plusknapp i samma storlek som ta bort, så att fälten linjerar.'
  },
  {
    date: '2026-08-25',
    importance: 1,
    title: 'Luft mellan A, B och C i katalogen',
    summary: 'Under Övriga varningsflaggor har rubrikerna Hur samarbetar vi?, Vem är kunden? och Vad gör kunden? mer marginal ovanför sig.'
  },
  {
    date: '2026-08-25',
    importance: 2,
    title: 'Kortare riskbedömning',
    summary: 'Informationsrutan Riskfaktorer ovanför A-, B- och C-korten är borttagen. Korten Hur samarbetar vi?, Vem är kunden? och Vad gör kunden? ligger direkt under tjänsterna.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Länder under Vad gör kunden?',
    summary: 'Geografiska riskfaktorer ligger nu i kortet Vad gör kunden? tillsammans med bransch och övriga verksamhetsflaggor. Valda länder styr fortfarande geografisk residual.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Varningsflaggor i A, B och C',
    summary: 'Under Övriga varningsflaggor kopplar ni varje flagga till Hur samarbetar vi?, Vem är kunden? eller Vad gör kunden? så att den syns i rätt kort på kundkortet.'
  },
  {
    date: '2026-08-24',
    importance: 3,
    title: 'Scroll i tjänstmodalen',
    summary: 'Under Åtgärder, Hot och Sårbarheter går det att scrolla listan så att alla rader syns. Residualrisk och Spara sitter kvar längst ner.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Verklig huvudman med hemvist',
    summary: 'I KYC anges verklig huvudman med namn, personnummer och skatterättslig hemvist, samma som företrädare. Utländsk hemvist kryssar utländska huvudmän på riskbedömningen.'
  },
  {
    date: '2026-08-24',
    importance: 3,
    title: 'Högriskbransch infälld med SNI',
    summary: 'Under Vem är kunden? är högriskbransch infälld som standard. Värdet kommer från SNI-koden och ni kan fortfarande bocka fler eller skriva en egen bransch.'
  },
  {
    date: '2026-08-24',
    importance: 5,
    title: 'Länder mot EU:s högrisklista',
    summary: 'I KYC och under Geografiska riskfaktorer väljer ni länder. De styr residualen: närområde, Europa, utanför EU och högriskland kryssas automatiskt mot EU:s förteckning.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Beskrivning av kunden i ett kort',
    summary: 'Verksamhet, Kostnader, Intäkterna och Bokföring ligger nu inne i Beskrivning av kunden. Befintlig beskrivningstext flyttas automatiskt till Verksamhet. Samma fält syns i KYC.'
  },
  {
    date: '2026-08-24',
    importance: 5,
    title: 'Kundspecifika åtgärder på tjänsten',
    summary: 'Fäll ut tjänsten på kundkortet för att bocka av kundspecifika åtgärder och se både inneboende och residual. Ni kan korrigera S och K. Värdet följer med till kundens riskbedömning. Under Åtgärder visas förslag från tjänsternas risksänkande åtgärder som ska kopplas till uppdragskörningar.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Tre typer av tjänsteåtgärder',
    summary: 'Varje åtgärd i tjänstmodalen klassas som byrårutin, kundspecifik åtgärd eller risksänkande åtgärd som kopplas till specifika uppdragskörningar.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Kvitto efter signering till byrå och kund',
    summary: 'När KYC, uppdragsavtal eller byråns riskbedömning är färdigsignerat skickas kvittot till den byrå som skickade dokumentet och till den som signerat – inte till det delade Inleed-kontot.'
  },
  {
    date: '2026-08-24',
    importance: 5,
    title: 'Riskfaktorer i tre kort',
    summary: 'A. Hur samarbetar vi?, B. Vem är kunden? och C. Vad gör kunden? innehåller nu både byråns vanliga riskfaktorer och kompletterande varningsflaggor. Länder och geografisk residual ligger under Vad gör kunden?'
  },
  {
    date: '2026-08-24',
    importance: 3,
    title: 'Tjänstmodalen tar mindre plats',
    summary: 'Namn och inneboende risk syns bara på Översikt. Hot-, sårbarhets- och åtgärdsflikarna har mer yta och går att scrolla.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Beskrivning av kunden i fyra kort',
    summary: 'På kundkortet finns nu korten Verksamhet, Kostnader, Intäkterna och Bokföring. Verksamhet, Kostnader och Intäkterna syns också i KYC-formuläret och sparas åt båda håll.'
  },
  {
    date: '2026-08-24',
    importance: 5,
    title: 'Förutsättningar på kundens riskbedömning',
    summary: 'Kundberoende förutsättningar kryssas nu direkt på Kundens riskbedömning (uppfylld / ej uppfylld). Ej uppfylld höjer den beräknade residualen. AI föreslår en kompletterande åtgärd som ni måste godkänna, och vissa kan läggas på uppdragskörningen.'
  },
  {
    date: '2026-08-24',
    importance: 5,
    title: 'Kundberoende åtgärder på tjänster',
    summary: 'Tjänsteåtgärder klassas som byrårutin eller kundberoende förutsättning. På kundkortet anger ni om förutsättningen är uppfylld. Är den Nej används inte mallens låga residual — då räknas tjänstens inneboende risk tills ni sätter en kundspecifik residual.'
  },
  {
    date: '2026-08-24',
    importance: 4,
    title: 'Hot-varningen stoppar inte längre sparning',
    summary: 'Du kan spara tjänstehot som de är. AI föreslår fortfarande bara PT- och TF-tillvägagångssätt, inte drift- eller HR-risk som «ekonomiska förluster».'
  },
  {
    date: '2026-08-22',
    importance: 4,
    title: 'Signera och godkänn riskbedömning i dokumentationen',
    summary: 'PDF-export på dokumentationsfliken sparas inte längre automatiskt. Skicka i stället till en användare på byrån för BankID-signering i Inleed. Det signerade dokumentet lagras, och godkännandedatumet blir dagen det signerades.'
  },
  {
    date: '2026-08-22',
    importance: 4,
    title: 'Mobilvänligare ClientFlow',
    summary: 'På telefon fälls menyn undan så sidorna får hela bredden, och en menyknapp öppnar sidomenyn. Utseendet på dator är oförändrat.'
  },
  {
    date: '2026-08-22',
    importance: 5,
    title: 'Tjänster och riskfaktorer måste väljas från katalogen',
    summary: 'Kundens tjänster kan bara väljas från byråns tjänstekatalog. Varje kund behöver minst ett val per riskdimension, och beräknad residual visas inte förrän underlaget är komplett. PT/TF är obligatoriskt på övriga riskfaktorer.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Oacceptabel-golv vid varningstecken plus koncentration',
    summary: 'När Hög-golv från varningstecken sammanfaller med minst två tjänster eller riskfaktorer på Förhöjd eller högre höjs den beräknade residualen till Oacceptabel. Kortet visar vilket golvskikt som slår.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Residual syns på tjänster och varningstecken',
    summary: 'Riskbedömningens PDF och kundkortet visar residualnivå på varje tjänst, riskfaktor och varningstecken — inte bara den samlade residualen.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Riskaptit i allmän riskbedömning kan redigeras',
    summary: 'Avsnitt 9 Riskaptit är nu ett vanligt kort med penna och Spara. Tomt fält fylls med standardpolicyn så ni kan anpassa den.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Övriga riskhöjande faktorer höjer beräknad residual',
    summary: 'Kryssen under Riskhöjande faktorer övrigt räknas in i beräknad residual. Hög-golv och kombinationer markeras på varje berörd tagg. Inga kan inte kryssas samtidigt som andra faktorer.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Högriskbransch räknas in i beräknad residual',
    summary: 'När kunden är i en högriskbransch följer residualnivån från byråns riskfaktor med in i den beräknade residualen — inte bara som en lista med valda branscher.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Kundens riskbedömning har en bedömd residual',
    summary: 'Inneboende risk väljs inte längre på kundkortet — den lever på tjänster och riskfaktorer. Kortet visar bedömd residual plus en rad för den beräknade residualen. Avvikelse motiveras bara när de skiljer sig.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Kundens riskbedömning visar bara det som behövs',
    summary: 'Kortet visar residual, inneboende och motivering. Den beräknade startpunkten syns bara om residualen avviker — inte som en jämförelseruta.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Kundkortet visar residualrisk för tjänster och riskfaktorer',
    summary: 'På kundens riskbedömning följer residual-S×K med från byråns tjänster och riskfaktorer — inte inneboende risk eller det gamla Riskbedömning-fältet.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Tydligare vägledning för tjänster och övriga riskfaktorer',
    summary: 'På sidorna för byråns tjänster och övriga riskfaktorer förklaras skillnaden mellan penningtvätt och terrorfinansiering. Inneboende risk och residualrisk visas som två likvärdiga kort, inte som en ruta i rutan.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Föreslagen risknivå räknas fram som startpunkt',
    summary: 'Kundkortet visar en beräknad residualnivå från högsta S×K bland valda tjänster och riskfaktorer. Du väljer fortfarande den slutgiltiga nivån, men måste motivera om den avviker från förslaget.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Kundens riskprofil väljs som inneboende och residual',
    summary: 'På kundkortet är risknivån två val — inneboende och residual — plus en motivering utan slutsatsmening. Hög residual kräver beslut, oacceptabel överskrider riskaptiten. En högrisktjänst varnar om residual sätts lägre.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Statistik i dokumentet visar byråns kunder igen',
    summary: 'Exporten till Länsstyrelsen och AI-texterna hämtar nu samma kundstatistik som statistiksidan. Tidigare kunde en intern omväg nollställa alla siffror i dokumentet.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Dokumentet visar om hoten är PT, TF eller båda',
    summary: 'I dokumentationen och i den exporterade texten syns om en tjänst har penningtvättshot, TF-hot eller båda. En tjänst med båda märks [PT/TF], inte bara [TF].'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Identifierade risker visas som samma kort som på källsidorna',
    summary: 'I dokumentationen och den allmänna riskbedömningen ligger tjänster och övriga riskfaktorer i expanderbara kort med S×K-brickor, hot och sårbarheter — samma layout som på Byråns tjänster och Övriga riskfaktorer.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Övriga riskfaktorer går att spara igen',
    summary: 'Uppdatering av en övrig riskfaktor ska inte längre stanna på Unknown field «PT/TF-relevans». Saknade fält skapas i Airtable när det går; annars sparas resten av ändringen.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Åtgärder kan sparas som ni skriver dem',
    summary: 'Det finns ingen gul kontroll som stoppar en åtgärd. Ni ansvarar för texten. AI föreslår fortfarande vad ni faktiskt gör, inte vaga avsikter som «inför striktare krav» eller «förbättra dokumentationen».'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'AI-förslag syns i era faktorkort',
    summary: 'När AI analyserar en tjänst läggs förslagen i samma layout: ny text under kortet, strykning som överstrykning och nya faktorer i grönt. AI förklarar när det inte är självklart. Inget sparas förrän du väljer.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'AI-förslag på varje flik och tydligare källor',
    summary: 'När AI analyserar en tjänst ligger kommentarer och förslag på Översikt, Hot, Sårbarheter och Åtgärder. Kortet visar vad som läggs till eller justeras — inte en ord-för-ord-markering i texten. Källor visar undersida och sökväg.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI söker i kunskapsbasen för tjänster och övriga risker',
    summary: 'När AI analyserar byråns tjänster eller övriga riskfaktorer använder den samma kunskapsbas som chatten och sektion 4, så hot, TF och källor kan grundas i uppladdad myndighetsvägledning.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'AI gör en egen analys – inte bara språkgranskning',
    summary: 'När det redan finns text tar AI fram kompletta egna förslag på beskrivning, hot, sårbarheter, åtgärder och S×K. Er text är underlag, inte facit. Jämför, redigera och kopiera in det ni vill behålla. Tomma fält fylls fortfarande i automatiskt.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Identifierade risker pekar på källsidorna',
    summary: 'Sektion 4 i den allmänna riskbedömningen hänvisar till Byråns tjänster och Övriga riskfaktorer. Hela underlaget från de sidorna visas i Dokumentationen och i den exporterade PDF:en.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI föreslår TF-hot när det saknas',
    summary: 'Om en tjänst saknar TF-hot kommer AI med ett konkret TF-förslag eller en motivering, i stället för att bara lämna den gula varningen tom.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'AI visar bara riktiga ändringar',
    summary: 'Granskningen hoppar över förslag som är samma text som redan står i fältet, så du inte får kort som ser ut som ändringar men inte ändrar något.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Tydligare status när avvikelse rapporterats',
    summary: 'Statusen heter nu Rapporterad till Finanspolisen (FM) överallt. Den korta varianten Rapporterad till FM slås ihop med den längre, så det inte finns två namn för samma sak.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Redigera AI-förslag och jämför med nuvarande text',
    summary: 'När AI granskar ifyllda fält ser du nuvarande text, om förslaget ändrar eller lägger till, och kan redigera texten innan du kopierar in den.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Polisens rapporter i AML-nyheter',
    summary: 'Omvärldsbevakningar, nationella riskbedömningar och forskningsrapporter från Polisens samordning mot penningtvätt visas nu på AML-nyheter, tillsammans med Finanspolisens övriga publikationer.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Inneboende risk och residualrisk förklaras',
    summary: 'Brickorna på tjänster och övriga riskfaktorer säger nu Inneboende risk respektive Residualrisk. En kort förklaring finns i sidhuvudet, i formulären och som hjälptext när du håller musen över brickan.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'TF-täckning på varje tjänst',
    summary: 'En tjänst som ska användas i den allmänna riskbedömningen måste ha minst ett TF-hot eller en motivering till varför PT-analysen räcker. Utkast kan fortfarande sparas utan det.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI granskar ifyllda texter',
    summary: 'När en tjänst eller riskfaktor redan har text tittar AI på den och lämnar kommentarer. Du kan kopiera in ett ändringsförslag eller avfärda det, utan att fälten skrivs över automatiskt.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'AI-beskrivning utan byrån',
    summary: 'AI-förslag för tjänstebeskrivning och inneboende risk nämner inte längre byrån, personal eller kapacitet. Fältet beskriver bara tjänsten och risken i sig.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'AI fungerar efter Assistants-API',
    summary: 'ClientFlow-AI använder OpenAI Responses i stället för Assistants API, som stängs 26 augusti 2026. Chatten och AI-förslag fungerar som tidigare. Ett öppet chattfönster från innan bytet startar en ny konversation.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Tydligare inneboende risk i formulären',
    summary: 'Tjänst och övriga riskfaktorer använder samma typ av fält: beskrivning plus inneboende risk, utan byråns åtgärder. Åtgärderna ligger i eget fält.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Snabbare AI-förslag',
    summary: 'AI-förslag för tjänster, övriga riskfaktorer och kundrisk läser inte längre in hela kunskapsbasen. Chatten och den allmänna riskbedömningen gör det fortfarande när det behövs.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Revisionslogg på Dokumentation',
    summary: 'Ledare ser en sökbar revisionslogg per byrå: riskändringar, AI-innehåll att granska, screeningträffar och avvikelser. Loggen är append-only och bevaras även om en kund döljs.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Exportera dokument som ZIP',
    summary: 'På kundkortets Dokumentation kan du bocka i filer och ladda ner valda som ZIP. På sidan Dokumentation finns också en knapp för att exportera byråns PDF:er och alla kunddokument.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Personregister på person- och orgnr',
    summary: 'Sök företrädare och verkliga huvudmän på personnummer eller organisationsnummer, även på dolda och avslutade kunder, och se bolag och uppdrag de senaste fem åren.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'S×K på övriga riskfaktorer',
    summary: 'Övriga riskfaktorer bedöms med sannolikhet och konsekvens (1–5). Inneboende risk och residualrisk efter åtgärd räknas som S×K, och PT/TF-relevans syns i listan och exporten.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Sannolikhet och konsekvens på byråns tjänster',
    summary: 'Risknivån för en tjänst räknas som S×K. Du sätter sannolikhet och konsekvens (1–5) och får inneboende risk samt residualrisk efter åtgärder.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Nya risknivåer går att spara',
    summary: 'Förhöjd, Normal och Oacceptabel kan sparas på tjänster, övriga riskfaktorer och kund. Tidigare fanns bara de gamla valen i underlaget.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Skriv in datum med tangenterna',
    summary: 'Datumfält som Utförd datum på KYC kan skrivas som ÅÅÅÅ-MM-DD. Kalendern finns kvar bredvid.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Aktuella körningar överst på kundkortet',
    summary: 'På fliken Uppdrag ligger aktuella körningar ovanför listan med alla uppdrag.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Datum för uppdragsavtal utanför ClientFlow',
    summary: 'När uppdragsavtalet finns utanför ClientFlow kan du ange avtalsdatum direkt i rutan på kundkortet.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Egna uppdrag och fler frekvenser',
    summary: 'På kundkortet kan du lägga upp uppdrag i fritext när standardtyperna inte räcker. Frekvensen kan vara veckovis eller engång.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Dra in dokument på kundkortet',
    summary: 'På fliken Dokumentation kan du släppa filer på en kategori eller öppna uppladdningen genom att släppa dem i fliken.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Byt namn och kategori på dokument',
    summary: 'På fliken Dokumentation kan du byta visningsnamn och flytta filer mellan kategorier, inklusive Dokumentation - historik.'
  },
  {
    date: '2026-08-21',
    importance: 4,
    title: 'Rätt start och deadline på årsvisa körningar',
    summary: 'Bokslut och deklaration flyttar startdatum ett år fram, inte till föregående deadline. Försenade körningar syns före nästa års.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Datum för KYC utanför ClientFlow',
    summary: 'När KYC finns utanför ClientFlow kan du ange utförd-datum direkt i rutan på kundkortet.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Förhandsgranska dokument på kundkortet',
    summary: 'På fliken Dokumentation kan du öppna PDF och bilder i en förhandsvisning utan att ladda ner dem.'
  },
  {
    date: '2026-08-21',
    importance: 5,
    title: 'Femgradig riskskala',
    summary: 'Tjänster, övriga riskfaktorer, kund och byrå använder samma skala: Låg, Normal, Förhöjd, Hög och Oacceptabel. Tidigare Medel visas som Normal.'
  },
  {
    date: '2026-08-21',
    importance: 3,
    title: 'Statistik i den allmänna riskbedömningen',
    summary: 'Dokumentationssidan och den exporterade PDF:en visar byråns kundstatistik. Siffrorna syns inte på redigeringssidan.'
  },
  {
    date: '2026-08-21',
    importance: 2,
    title: 'Snabbare uppdatering från Bolagsverket',
    summary: 'När du klickar Uppdatera på kundkortet är alla förändringar redan ibockade, så du kan spara direkt.'
  },
  {
    date: '2026-08-20',
    importance: 3,
    title: 'Dokumentation - historik på kundkortet',
    summary: 'Filer i Airtable-fältet Dokumentation - historik syns nu som en egen sektion under fliken Dokumentation.'
  },
  {
    date: '2026-08-19',
    importance: 2,
    title: 'Skicka feedback från dashboarden',
    summary: 'Länken Skicka feedback öppnar ett formulär. Meddelandet går till hej@clientflow.se.'
  },
  {
    date: '2026-08-19',
    importance: 5,
    title: 'AML-nyheter på dashboarden',
    summary: 'Nyheter från bland annat AMLA, Finanspolisen, Skatteverket, SRF och Revisorsinspektionen, med AI-sammanfattningar skrivna för små redovisningsbyråer.'
  },
  {
    date: '2026-08-19',
    importance: 5,
    title: 'KYC och uppdragsavtal via Inleed',
    summary: 'Signeringslänkar syns på KYC och avtalet, mejlet går till klientansvarig och byrån syns som avsändare – utan extra lagtext i inbjudan.'
  },
  {
    date: '2026-08-19',
    importance: 4,
    title: 'Export av rutiner och riskbedömning i historik',
    summary: 'När du exporterar till PDF sparas filen i historiken med datum, så du hittar tidigare underlag till Länsstyrelsen.'
  },
  {
    date: '2026-08-19',
    importance: 4,
    title: 'Dölj kund i listan',
    summary: 'Du kan dölja en kund från kundlistan. Länken finns kvar under Dokumentation så posten inte försvinner.'
  },
  {
    date: '2026-08-18',
    importance: 4,
    title: 'Tydligare uppdrag och tidsfrister',
    summary: 'Uppdrag visar färgade tidsfrister, du kan tilldela en körning till en kollega och bara öppna perioder syns på kundkortet.'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'Reviderad och godkänd-datum',
    summary: 'Allmän riskbedömning visar när dokumentet senast reviderades och godkändes.'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'KYC-rutin och identifierade risker',
    summary: 'Kundkännedomsåtgärder visar byråns KYC-rutin, och identifierade risker hämtas live från tjänster och övriga riskfaktorer.'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'Varning för SNI 46872 metallskrot',
    summary: 'Kundkortet varnar när verksamheten träffar högrisk-SNI 46872 (metallskrot, SNI 2025).'
  },
  {
    date: '2026-08-19',
    importance: 3,
    title: 'Fler dokument och verksam organisation',
    summary: 'Kundkortet tar emot flera dokument i vald kategori och visar F-skatt, moms och arbetsgivare från Bolagsverket.'
  },
  {
    date: '2026-08-11',
    importance: 3,
    title: 'Enklare KYC och ifylld risk-PDF',
    summary: 'KYC-formuläret är förenklat, och riskbedömningens PDF fylls med uppgifter som redan finns i ClientFlow.'
  },
  {
    date: '2026-08-03',
    importance: 2,
    title: 'Skapa företag utan organisationsnummer',
    summary: 'På kundlistan kan du lägga upp ett företag med plusknappen även när org.nr saknas.'
  }
];

const MONTHS_SV = ['jan.', 'feb.', 'mars', 'apr.', 'maj', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];

function parseEntryDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatSvDate(iso) {
  const d = parseEntryDate(iso);
  if (!d) return '';
  return `${d.getUTCDate()} ${MONTHS_SV[d.getUTCMonth()]}`;
}

function selectWhatsNew(entries, options) {
  const now = options && options.now ? new Date(options.now) : new Date();
  const days = options && options.days != null ? Number(options.days) : DEFAULT_DAYS;
  const limit = options && options.limit != null ? Number(options.limit) : DEFAULT_LIMIT;
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  return (entries || [])
    .filter((entry) => {
      if (!entry || !entry.title || !entry.summary) return false;
      const date = parseEntryDate(entry.date);
      return date && date >= cutoff && date <= now;
    })
    .sort((a, b) => {
      const ia = Number(a.importance) || 0;
      const ib = Number(b.importance) || 0;
      if (ib !== ia) return ib - ia;
      const da = parseEntryDate(a.date).getTime();
      const db = parseEntryDate(b.date).getTime();
      if (db !== da) return db - da;
      return String(a.title).localeCompare(String(b.title), 'sv');
    })
    .slice(0, Math.max(0, limit))
    .map((entry) => ({
      date: entry.date,
      dateLabel: formatSvDate(entry.date),
      title: entry.title,
      summary: entry.summary
    }));
}

function getWhatsNewPayload(options) {
  return {
    intro: 'ClientFlow är under ett intensivt utvecklingsarbete! Här listar vi de ändringar som vi gjort den senaste tiden.',
    outro: 'Testa gärna och ge oss din feedback!',
    feedbackEmail: 'hej@clientflow.se',
    items: selectWhatsNew(WHATS_NEW_ENTRIES, options)
  };
}

module.exports = {
  WHATS_NEW_ENTRIES,
  DEFAULT_DAYS,
  DEFAULT_LIMIT,
  parseEntryDate,
  formatSvDate,
  selectWhatsNew,
  getWhatsNewPayload
};
