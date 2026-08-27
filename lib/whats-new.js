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
