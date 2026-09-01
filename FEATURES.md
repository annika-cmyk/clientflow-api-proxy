# ClientFlow – feature list för Tobias

Det här är en inventering av **prototypen** (live: `https://www.app.clientflow.se`). Syftet är att du ska veta **vad produkten gör idag** och vad en säljbar applikation måste täcka – inte att du ska kopiera Airtable, Render-proxyn eller den nuvarande frontend-stacken.

**ClientFlow** är ett PTL-system (penningtvättslagen) för svenska redovisningsbyråer. Byrån dokumenterar sin allmänna riskbedömning, sina tjänster och rutiner, gör kundkännedom (KYC) och individuell riskbedömning, screenar personer, hanterar uppdrag/körningar och kan exportera underlag till Länsstyrelsen.

Minibok (bokföring) läser uppdrag och AML via den här produkten. Det gränssnittet behöver finnas kvar eller ersättas med ett avtalat API.

---

## 1. Vem som använder det

Tre roller:

| Roll | Vad de får göra |
|---|---|
| **Ledare** | Allt på den egna byrån. Ser alla kunder. Hanterar användare, behörigheter, kataloger, allmän riskbedömning och dokumentation. |
| **Anställd** | Ser bara kunder hen är kopplad till (fältet *Användare* / kundbehörighet). När hen har tillgång till en kund: fullt arbete på det kundkortet. |
| **ClientFlowAdmin** | Plattformsadmin. Ser alla byråer. |

Äldre data kan ha rollen «Användare» – den ska behandlas som Anställd.

**Kundbehörighet:** Ledare tilldelar en eller flera byråanvändare till en kund (en kund i taget eller i bulk från byråsidan). Anställd som inte är kopplad ska inte kunna öppna eller ändra kunden.

---

## 2. Inloggning och skal

- E-post + lösenord. Session via httpOnly-cookie (JWT).
- Skyddade sidor: ej inloggad → login.
- Sidomeny med sök på företag, org.nr och kontakt.
- Mobil: menyn fälls undan, hamburgare öppnar den.
- Feedback till `hej@clientflow.se`.
- Dashboard visar «senaste ändringar» (produktnyheter).

---

## 3. Byråns grunddata (måste finnas innan kundarbetet)

Det här är byråns PTL-underlag. «Kom igång» på dashboarden leder genom det i den här ordningen.

### 3.1 Byråns tjänster (`riskbedomning-byra`)

Katalog över tjänster byrån säljer. Kunden får **bara** välja tjänster härifrån.

Per tjänst:

- Namn, beskrivning
- **Inneboende risk** och **residualrisk** som S×K (sannolikhet × konsekvens) på skalan Låg / Normal / Förhöjd / Hög / Oacceptabel
- **Hot** – ska klassas som penningtvätt (PT), terrorfinansiering (TF) eller båda. En tjänst kan ha båda. TF-täckning krävs innan tjänsten räknas som publicerbar.
- **Sårbarheter**
- **Åtgärder** – varje åtgärd klassas som:
  - **Byrårutin** (alltid byråns ansvar), eller
  - **Kundberoende förutsättning** (måste kryssas Ja/Nej på varje kund)
- AI-analys mot en kunskapsbas (myndighetsvägledning). Förslag visas per flik (Översikt, Hot, Sårbarheter, Åtgärder). Inget sparas förrän användaren väljer. Tomma fält kan fyllas automatiskt; befintlig text är underlag, inte facit.

### 3.2 Övriga riskfaktorer (`ovriga-riskfaktorer`)

Byråns mallar för riskfaktorer **utanför tjänsterna**, grupperade i dimensioner:

- Geografiska riskfaktorer
- Riskfaktorer kopplat till kund
- Distributionskanaler
- Verksamhetsspecifika riskfaktorer

Plus en katalog med **övriga varningsflaggor** (allvarlighet: Hög-aktiv / Bidrar vid kombination / Informativ). Byrån kan ta bort default-flaggor; borttagna ska stanna borttagna.

Samma S×K, hot (PT/TF), sårbarheter, åtgärder och AI-stöd som på tjänster. PT/TF är obligatoriskt.

### 3.3 Allmän riskbedömning byrå

Dokumentet som motiverar byråns riskbaserade förhållningssätt (2017:630). Byggs från tjänster, övriga riskfaktorer och statistik. Innehåller bland annat riskaptit (redigerbar policy). AI hjälper till att skriva sektioner. Hänvisar till källsidorna (Byråns tjänster / Övriga riskfaktorer) i stället för att duplicera allt.

### 3.4 Byrårutiner

Interna rutiner (4 kap. 3 §). Utkast + AI utifrån det byrån redan angett.

### 3.5 Uppgifter byrå & användare

Flikar:

- **Byråinformation** – namn, org.nr, logga, kontakt
- **Uppdragsbrev** – mall + bilagor
- **Användare** – skapa/hantera byråns personal och roller
- **Utbildningar** – vilka som gått AML-utbildning
- **Behörigheter** – koppla användare ↔ kunder (även bulk)
- **Aktivitetsloggar**
- Prislista kopplad till tjänster (+ fritextrader)

Ledare ser byråns alla användare.

### 3.6 Statistik för riskbedömning

Aggrigerad bild av byråns kunder: tjänster, riskfaktorer, residualnivåer. Samma siffror ska in i Länsstyrelsen-exporten och i AI-texter för den allmänna riskbedömningen.

---

## 4. Skala och residualmotor (kärnregler)

Samma femgradiga skala överallt: **Låg · Normal · Förhöjd · Hög · Oacceptabel**.

### Kundens residual

- **Beräknad residual** = maskinell startpunkt. Högsta residual-S×K bland valda tjänster och valda riskfaktorer, plus varningsflaggor och högriskbransch.
- **Bedömd residual** = byråns aktiva val på kundkortet. Det är den som gäller.
- Avviker bedömd från beräknad → **motivering krävs**. Samma värde kräver ingen motivering.
- Motiveringen får **inte** avslutas med en slutsatsmening («den sammantagna riskbedömningen är Hög»).
- Inneboende risk sätts på **tjänst och riskfaktor**, inte som ett separat kundval.

### Golv från varningsflaggor

- **Hög-aktiv** (GOLV_HOG) ensam → beräknad residual minst **Hög**.
- Två flaggor som **bidrar vid kombination** → samma sak tillsammans.
- «Inga» får inte kryssas samtidigt som andra flaggor.
- Hög-golv **plus** minst två tjänster/riskfaktorer på Förhöjd eller högre → **Oacceptabel**.
- Hög residual kräver riskaptitbeslut. Oacceptabel överskrider aptiten. Beslut: fortsätter med skärpta åtgärder / avslutas / avstår nytt uppdrag (motivering, minst 20 tecken).
- Varnar om bedömd residual sätts lägre än en vald högrisktjänst.

### Dimensioner måste vara kompletta

Varje kund behöver minst ett val i varje dimension byrån faktiskt har mallar för (geografi, kund, distribution, verksamhet). Beräknad residual visas inte förrän underlaget är komplett.

### Kundberoende förutsättningar

På kundens riskbedömning kryssas varje förutsättning **uppfylld / ej uppfylld**.

- **Ej uppfylld** höjer beräknad residual. Mallens låga residual på tjänsten används då inte – inneboende risk räknas tills byrån sätter en kundspecifik residual.
- AI kan föreslå kompletterande åtgärd. Användaren måste godkänna. Vissa åtgärder kan läggas på uppdragskörningen.

---

## 5. Ta in en kund

### Företagssök (dashboard)

Sök på organisationsnummer → Bolagsverket → spara som lead/kund.

- Dubblettspärr: samma org.nr + byrå får bara finnas en gång.
- Hämtar bolagsdata, företrädare, verkliga huvudmän, SNI, status (verksam/avregistrerad).
- SNI som matchar högriskbransch ska synas automatiskt på kundkortet (inte bara som fri text).

### Kundlista

- Lista byråns kunder (filtrerad på roll/behörighet).
- Kundstatus: **Lead / Pågående kund / Avslutad** (standardfilter: Lead + Pågående). Lead kan sparas utan Bolagsverket.
- Compliance-bock när KYC, riskbedömning och uppdragsavtal alla är klara.
- Filter för kunder som kräver riskaptitbeslut.
- Dold kund syns inte här – länken ligger under Dokumentation → Dolda kunder.

### Personregister

Sök företrädare och verkliga huvudmän över byråns kunder. Visa identitet, kopplingar, bolag, om kunden är dold/avslutad.

---

## 6. Kundkortet

Ett kort per kund med status på varje flik (klar / ofullständig).

### 6.1 Företagsinformation

Bolagsdata från Bolagsverket (uppdatera-knapp), kontakter, kundstatus, beskrivning av kunden i fyra kort:

- Verksamhet
- Kostnader
- Intäkterna
- Bokföring

Plus redovisningsuppgifter (metod, momsperiod, räkenskapsår, bokföringsprogram, bank, omsättning) och **befattningshavare & roller** (företrädare, verklig huvudman, styrelse) med PEP/sanktion per person. Screening av bolag och personer (i prototypen Dilisense).

Verksamhet, Kostnader och Intäkterna syns också i KYC och sparas åt båda håll.

Kan dölja kunden från listan utan att radera kortet.

### 6.2 KYC-formulär

Sektioner:

1. Grunduppgifter (hemvist, TIN)
2. Företrädare (flera rader)
3. Verklig huvudman (döljs för enskild firma)
4. PEP
5. Affärsförbindelsens syfte (verksamhet, kostnader, intäkter)
6. Internationell handel
7. Kontanthantering
8. Kundens intygande

KYC-status per delmoment. Spara, PDF, skicka för signering, eller markera KYC utanför ClientFlow + datum.

### 6.3 Riskbedömning (individuell)

Det tyngsta flödet.

**Tjänster** – endast från byråns katalog. Varning om kopplingen saknas i katalogen (visa namn, inte interna id:n).

**Riskdimensioner** (varje kort har egna val + Spara):

1. Geografiska riskfaktorer
2. Riskfaktorer kopplat till kund – inkl. högriskbransch-väljare (fasta branscher + SNI-träffar, SNI går inte att avmarkera)
3. Distributionskanaler – t.ex. fysiskt möte, distans med BankID, distans utan verifiering, via ombud
4. Verksamhetsspecifika riskfaktorer

**Varningsflaggor i samma tre kategori-kort** (inte ett extra block):

- I Distributionskanaler: identitet, kontakt, undvikande, tidsnöd
- I Riskfaktorer kopplat till kund: ägarstruktur, brottshistorik, bulvan, bytt konsult, styrelseändringar
- I Verksamhetsspecifika: kunder på distans, transaktioner utan syfte, bokföringsrutiner, otydlig affärsmodell

Distans, ombud, PEP, högriskbransch och kontanter väljs **bara** som de formella dimensionvalen – inte som dubbletter bland flaggorna.

**Kundens riskbedömning-kort:** bedömd residual, beräknad residual som referens, motivering, åtgärder, förutsättningar Ja/Nej, ev. avvikelsemotivering.

**Risksänkande faktorer** och **kommentar**.

**Uppdraget kan antas** + avtalsdatum.

**Dokumentera riskbedömning** → PDF (risk + bedömningspunkter + tjänstelista utan byråns tjänstanalyser + KYC som bilaga) som sparas på Dokumentationsfliken. Kan skickas för BankID-signering.

### 6.4 Uppdragsavtal

Skapa/skicka uppdragsavtal för signering, eller markera att avtalet slöts utanför ClientFlow (med datum).

### 6.5 Uppdrag

Uppdragstyper:

- Löneuppdrag / Löneuppdrag innevarande / Löneuppdrag efterhand
- Momsredovisning
- Bokslut
- Deklaration
- Eget uppdrag (fritt namn)

Frekvens per typ (månad, kvartal, årsvis, veckovis, engång, …). Systemet genererar **körningar** med deadline, periodnyckel och arbetsfönster.

På körningen:

- Klarmarkering
- Anteckning
- Åtgärder från kundens riskbedömning måste bockas i innan klar
- Försenade / deadline inom 5 dagar markeras
- Ansvarig på körningen
- Vissa körningar syns/döljs beroende på typ och period

Byråöversikt: `uppdrag-oversikt.html` — tavla per typ (lön/moms/bokslut/deklaration/övriga), filter Mina/Byrån, deadline/öppna, klara/ej klara.

### 6.6 Anteckningar

Fria anteckningar på kunden.

### 6.7 Avvikelser

Registrera och följa avvikelser på kunden. Finns också som byråsida och dashboard-kort.

### 6.8 Dokumentation (på kunden)

Uppladdade filer i flera kategorier, KYC-PDF, signerade avtal, riskbedömnings-PDF. Flera filer per kategori. Drag-and-drop.

### 6.9 Samarbete

Förfrågningar till andra parter (t.ex. tidigare byrå). Svar landar på dashboarden («Nyinkomna svar»). Extern svarsida: `samarbete-svar.html`.

---

## 7. Screening och personer

- **PEP / RCA** är Hög-aktiv och höjer residual.
- Sanktionsscreening av bolaget (entity screening) med datum för senaste körning.
- Antal träffar PEP/sanktion loggas.
- Historik över företrädare och verkliga huvudmän (personnummer/org.nr, roller, från/till).
- Personregistret slår ihop personer över kunder.

---

## 8. Signering och kvitton

Via Inleed / Docsign + BankID.

Dokument som kan signeras:

- KYC
- Uppdragsavtal
- Byråns riskbedömning + rutiner (Länsstyrelsen-PDF)
- Kundens dokumenterade riskbedömning

**Kvitto** ska gå till den byrå som skickade dokumentet och till den som signerade – inte till ett delat Inleed-konto. PDF bifogas. Signerat dokument sparas. Godkännandedatum = signeringsdatum.

Vanlig PDF-export av byrådokumentet sparas **inte** automatiskt. «Skicka för signering och godkännande» är den officiella vägen.

---

## 9. Dokumentation på byrån

- Visning av byrårutiner + slutlig allmän riskbedömning
- Godkända (signerade) dokument
- Dolda kunder
- Revisionslogg (append-only, minst fem år): riskändringar, AI-innehåll, screening, avvikelser. Filtrera på aktör, entitet, tid. Varje byrå ser bara sina poster.
- Export: PDF, ZIP med alla dokument
- Länsstyrelsen-export: allmän riskbedömning + rutiner + statistik

---

## 10. Dashboard (att göra)

- Kom igång-flöde (5 steg, avbockningsbart)
- Företagssök
- AML-nyheter (SV/EN, sammanfattningar, filtrerade mot byråns profil)
- Testa dig själv (AML-grundkurs) tills användaren slutfört
- Mina uppgifter
- Nyinkomna samarbetssvar
- Kunder utan riskbedömning
- Kunder som kräver riskaptitbeslut
- Residual avviker från beräknad nivå
- Kunder som saknar uppdragsavtal
- Avvikelser
- Systemstatus

---

## 11. Utbildning och nyheter

- **AML-grundkurs:** sex frågor («de 6 absoluta måsten»), rätt/fel med förklaring, registrera genomförd utbildning.
- **AML-nyheter:** egen sida + kort på dashboard. Språk SV/EN.

---

## 12. AI (PTL-AI)

- Sidomeny-chatt med kunskapsbas (uppladdad myndighetsvägledning).
- Analys av tjänster och övriga riskfaktorer (egna förslag, inte bara språkgranskning).
- Förslag på kundens residualmotivering (får inte själv välja nivå eller hitta på avvikelse).
- Förslag på kompletterande åtgärd när förutsättning är ej uppfylld.
- Fältgranskning / hjälptexter på KYC och beskrivningskort.
- Källor ska visa undersida och sökväg.
- AI-innehåll ska kunna audit-loggas.
- **AI-användning** (`ai-usage.html`): logg per användare. AML-nyhetssammanfattningar har kostnadsspärr så ingest inte skenar.

---

## 13. Integrationer som produkten behöver

| Integration | Används till |
|---|---|
| **Bolagsverket** | Företagssök, bolagsdata, företrädare, UBO, SNI, verksam-status |
| **BankID / Inleed (Docsign)** | Signering av KYC, avtal, riskdokument |
| **E-post (SMTP)** | Kvitton och utskick till rätt byrå + signerare |
| **Sanktions-/PEP-screening** | Bolag och personer (i prototypen Dilisense) |
| **OpenAI + vector store** | PTL-AI-chatt och analyser mot kunskapsbas |
| **Minibok** | API/proxy: uppdrag, körningar, AML-underlag. Ändringar Minibok behöver ska vara live. |

Prototypen lagrar i **Airtable**. En säljbar app ska ha egen databas. Tänk «byrå → användare → kund → tjänster/risker/dokument/uppdrag» – inte Airtable-tabeller.

---

## 14. Sidor i prototypen (karta)

| Sida | Innehåll |
|---|---|
| `login.html` | Inloggning |
| `index.html` | Dashboard |
| `kundlista.html` | Kundlista |
| `kundkort.html` | Kundkortet (alla flikar) |
| `personregister.html` | Företrädare / UBO över kunder |
| `avvikelser.html` | Avvikelser byråöversikt |
| `riskbedomning-byra.html` | Byråns tjänstekatalog |
| `ovriga-riskfaktorer.html` | Riskfaktormallar + varningsflaggor |
| `statistik-riskbedomning.html` | Statistik |
| `allman-riskbedomning-byra.html` | Allmän riskbedömning |
| `byrarutiner.html` | Byrårutiner |
| `amla-nyheter.html` | AML-nyheter |
| `ai-usage.html` | AI-användning per användare |
| `byra-anvandare.html` | Byrå, användare, behörighet, loggar |
| `utbildning.html` | AML-grundkurs |
| `dokumentation.html` | Byrådokument, dolda kunder, audit, export |
| `uppdrag-oversikt.html` | Alla uppdrag/körningar |
| `kyc.html` | Äldre fristående KYC (primär väg är kundkortet) |
| `samarbete-svar.html` | Publik kundsida: lämna underlag utan inloggning |
| `welcome.html` | Äldre välkomstsida |
| `allman-riskbedomning.html` | Legacy/demo, inte byråspecifik |

---

## 15. Viktiga produktregler (checklista)

- [ ] Tjänster och riskfaktorer väljs bara från byråns katalog
- [ ] Minst ett val per dimension som byrån har mallar för
- [ ] Beräknad residual syns inte förrän underlaget är komplett
- [ ] Bedömd residual är byråns val; avvikelse kräver motivering
- [ ] Hög-aktiv / två «bidrar» / Oacceptabel-golv enligt avsnitt 4
- [ ] Högriskbransch (val + SNI) räknas in i residual
- [ ] Ej uppfylld förutsättning släcker mallens låga residual
- [ ] PT/TF på övriga riskfaktorer och tjänstehot
- [ ] Anställd ser bara tilldelade kunder; ledare ser hela byrån
- [ ] En kund per org.nr och byrå
- [ ] Signeringskvitto till avsändande byrå + signerare
- [ ] Länsstyrelsen-PDF använder samma statistik som statistiksidan
- [ ] Revisionslogg append-only, byråisolerad, lång lagring
- [ ] Minibok kan läsa uppdrag och AML

---

## 16. Förslag på byggordning

Bygg i den här ordningen så att varje steg går att sälja och testa:

1. **Konto, byrå, roller, kundbehörighet**
2. **Tjänstekatalog + riskfaktorkatalog + skalan**
3. **Kund + Bolagsverket + kundkort (företagsinfo)**
4. **KYC + dimensioner + varningsflaggor + residualmotor**
5. **Förutsättningar, åtgärder, dokumentera/PDF**
6. **Uppdrag + körningar** (Minibok-API här)
7. **Signering + kvitton**
8. **Allmän riskbedömning, rutiner, Länsstyrelsen-export**
9. **Dashboard-köer, avvikelser, personregister, samarbete**
10. **AI och kunskapsbas** (kan parallelliseras sent; produkten ska fungera utan den)
11. **Utbildning, nyheter, audit-logg**

---

## 17. Prototype vs produkt

Det här ska du **inte** ta med som krav:

- Airtable som datalager eller «källa till sanning»
- Cache-busting med `?v=` på varje JS-fil
- Delat Inleed-konto mellan byråer (det är en bugg vi redan löst i kvittot – bygg rätt från början: en avsändare per byrå)
- Hårdkodade testlösen i gamla setup-dokument

Det här **ska** du ta med, även om koden är rörig:

- Residualmotorn och golvreglerna
- Katalogtvång (inga fria tjänster/risker på kunden)
- Roll + kundbehörighet
- Signering med rätt kvitto-mottagare
- Minibok-API för uppdrag/AML
- Att Länsstyrelsen-dokumentet speglar samma data som i appen
