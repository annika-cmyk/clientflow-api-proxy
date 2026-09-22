# Gmail-integration (Mejl)

Koppla användarens Gmail till ClientFlow för att:

1. **Läsa** mejl under etiketten `KUNDER` (underetiketter = kundnamn, t.ex. `KUNDER/Acme AB`)
2. **Skicka** mejl från ClientFlow via Gmail API så avsändaren är användarens egen Gmail

## Google Cloud-setup

1. Skapa projekt i [Google Cloud Console](https://console.cloud.google.com/)
2. Aktivera **Gmail API** och **Google Calendar API**
3. Konfigurera OAuth-consent screen (External eller Internal för Workspace)
4. Skapa OAuth-klient (typ **Web application**)
5. Lägg till **Authorized redirect URI** (måste matcha `GOOGLE_GMAIL_REDIRECT_URI` exakt):
   - Prod (kanonisk host): `https://www.app.clientflow.se/api/gmail/oauth/callback`
   - Ev. alias utan www om ni använder det i OAuth: `https://app.clientflow.se/api/gmail/oauth/callback`
   - Lokal: `http://localhost:3001/api/gmail/oauth/callback`
6. Kopiera **Client ID** och **Client Secret**

OAuth-scopes som begärs: Gmail (läsa/skicka/etiketter) + `calendar.events` (skapa/uppdatera händelser i användarens primära kalender).

## Google-kalender (envägs från ClientFlow)

När Gmail är kopplad med kalenderbehörighet:

1. Öppna **Kalender**
2. Klicka **Koppla** om du saknar kalenderscope (annars räcker befintlig Gmail-koppling efter omkoppling)
3. Slå på **Google: på** – planerade tidblock sparas då till din Google-kalender
4. **Synka** skickar synliga tidblock i vyn; bokade möten pushas när kunden bokar

**Begränsningar (v1):** bara ClientFlow → Google (inte vice versa). Deadlines utan avsatt tidblock synkas inte. Google-händelser som du redigerar i Google skrivs inte tillbaka till ClientFlow.

## Render-miljövariabler

**Viktigt – rätt tjänst:** Live-appen (`www.app.clientflow.se`) pekar på Render-tjänsten
**`clientflow-api-proxy-1`**. Sätt Gmail-variablerna där.

Sätt dem **inte** bara på den äldre tjänsten `clientflow-api-proxy` (utan `-1`) – den
används inte av Mejl-sidan, även om Environment-listan där ser komplett ut.

1. Render → **clientflow-api-proxy-1** → Environment  
2. Lägg in variablerna nedan → **Save Changes**  
3. Om auto-deploy inte startar: **Manual Deploy → Deploy latest commit**

```
GOOGLE_CLIENT_ID=...          # från Google Cloud OAuth-klienten
GOOGLE_CLIENT_SECRET=...      # från Google Cloud OAuth-klienten
GOOGLE_GMAIL_REDIRECT_URI=https://www.app.clientflow.se/api/gmail/oauth/callback
PUBLIC_BASE_URL=https://www.app.clientflow.se
# Valfritt – annars JWT_SECRET (används för att kryptera tokens + OAuth-state):
GMAIL_TOKEN_SECRET=...
# Valfritt – standard KUNDER:
GMAIL_KUNDER_LABEL=KUNDER
```

Klistra **inte** in värden med citattecken (`"..."`) – Render sparar då citattecknen som del av värdet.
### Accepterade alias (första icke-tomma vinner)

| Fält | Kanoniskt namn (rekommenderat) | Alias |
|------|-------------------------------|-------|
| Client ID | `GOOGLE_CLIENT_ID` | `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GMAIL_CLIENT_ID` |
| Client Secret | `GOOGLE_CLIENT_SECRET` | `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_CLIENT_SECRET` |
| Redirect URI | `GOOGLE_GMAIL_REDIRECT_URI` | `GOOGLE_REDIRECT_URI`, `GOOGLE_OAUTH_REDIRECT_URI`, `GMAIL_REDIRECT_URI` |

Tomma eller bara whitespace räknas som saknade. Använd gärna de kanoniska namnen.

När variablerna saknas visar Mejl-sidan status **Ej konfigurerad**. `/api/gmail/status` returnerar `missingEnv`, `envPresent` (boolean), `envLengths` (teckenlängd, 0 = tom), `envResolvedFrom`, `requestHost` och `expectedService` – utan att läcka secret-värden.

## Airtable

Fältet `Gmail OAuth` (multilineText) skapas automatiskt i **Application Users** vid första kopplingen, eller manuellt:

```
node scripts/setup-gmail-fields.js
```

Tokens lagras krypterade (AES-256-GCM).

## Användning

1. Öppna **Mejl** i sidomenyn
2. Klicka **Koppla Gmail** och godkänn behörigheter i Google
3. Se inkorg från etiketter under KUNDER
4. Skicka nya mejl – de går ut från ditt Gmail och kan etiketteras med kundnamn


## Mejlarkiv (spara / dela / privat / maska)

På mejldetaljen:

1. **Spara…** – hela mejlet och/eller bilagor till Dokumentation, Uppdrag eller Uppdragskörning (samma ställe eller uppdelat).
2. **Dela…** – välj byråkollegor med kundbehörighet.
3. **Markera privat** – syns bara för dig, dem du delat med, och ClientFlow-admin (inte vid omfördelning till andra).
4. **Maska markering** – maskerad text syns bara för ägare och ClientFlow-admin.

Airtable-tabell **Mejlarkiv** (krävs för arkivmetadata; skapas automatiskt vid sparning om token har schema-behörighet):

```
node scripts/setup-mejlarkiv.js
# eller POST /api/setup/airtable-mejlarkiv (Ledare/Admin)
```

Valfri env: `AIRTABLE_TABLE_MEJLARKIV_ID` (om satt fel → 403 “Invalid permissions…”; ta bort eller sätt till rätt table id).

Spara till **Uppdragskörning** skriver filen primärt till **Uppdrag**-postens `Dokumentation`/`Attachments` med filnamn `YYYY-MM-DD - …` (samma modell som kundkortets körningsdokumentation / `POST /api/uppdrag/run-docs`), och dual-write:ar även till körningsradens `Dokumentation` i tabellen `Uppdragskörningar`. Env `AIRTABLE_TABLE_UPPDRAG_RUNS_ID` / `AIRTABLE_TABLE_UPPDRAG_ID` är valfria — saknas de resolvas tabellerna via namn.

Spara till **Dokumentation** skriver till KUNDDATA (`Dokumentation`/`Attachments`). Spara till **Uppdrag** skriver direkt till Uppdrag-postens bilagefält.

## Inkorgscache (senaste 30 dagarna)

Gmail-synken hämtar **bara mejl ≤ 30 dagar** (`newer_than:30d`). Äldre mejl hämtas inte.

- **List-cache:** fältet `Gmail Sync Cache` på Application Users (historyId + metadata).
- **Body-cache:** Airtable-tabellen **Gmail Mejlcache** (en rad per användare + Gmail Message ID, inkl. body). Öppnade mejl läses härifrån när de finns, utan ny Gmail-hämtning. Synken skriver bara nya/ändrade bodies.

```
node scripts/setup-gmail-mejlcache.js
# eller POST /api/setup/airtable-gmail-mejlcache (Ledare/Admin)
# (körs även av setup-gmail-fields.js när schema-token finns)
```

Valfri env: `AIRTABLE_TABLE_GMAIL_MEJLCACHE_ID`. Utan Gmail-koppling visas sparade mejl från den senaste månaden från cachen när de finns.

## Felsökning

| Symptom | Åtgärd |
|--------|--------|
| Status "Ej konfigurerad" trots att nycklar syns i Render | Du tittar troligen på **fel tjänst**. Kopiera samma tre Google-vars till **`clientflow-api-proxy-1`**, Save + Manual Deploy. Kolla `requestHost` / `envLengths` i `/api/gmail/status`. |
| Status "Ej konfigurerad" | Kontrollera att alla tre OAuth-fält finns (kanoniskt eller alias) på **clientflow-api-proxy-1** och att tjänsten startat om efter Save |
| `envPresent` false / `envLengths` 0 trots att du lagt in vars | Fel tjänst, fel variabelnamn, tomt värde, citattecken runt värdet, eller saknad redeploy efter Save |
| Knappen visar toast med saknade env | Lägg in dem i Render på **clientflow-api-proxy-1**; alias fungerar också |
| `redirect_uri_mismatch` efter Google-login | Redirect URI i Google Cloud måste vara **exakt** samma som `GOOGLE_GMAIL_REDIRECT_URI` (inkl. `www`) |
| Status "Ej kopplad" / toast om att koppla igen | Vanligtvis **förväntat**: Google har ogiltigförklarat refresh-tokenen. Vanliga orsaker: OAuth-appen är i **Testing**-läge (token går ut efter ~7 dagar), användaren bytt Google-lösenord, eller återkallat åtkomst under [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Klicka **Koppla Gmail** igen. Deploy raderar **inte** sparade tokens (de ligger krypterade i Airtable). |
| Koppling lyckas men inkorg tom | Skapa Gmail-etikett `KUNDER` och underetiketter med kundnamn |

**Exakt prod-redirect:** `https://www.app.clientflow.se/api/gmail/oauth/callback`  
(Måste finnas både i Google Cloud → Authorized redirect URIs och i Render-env.)

---

# Samarbete – BankID-skyddade frågor

Frågor i *Begär underlag* kan vara **offentliga** (syns i mejlet) eller **BankID-skyddade** (bara teaser i mejlet; kunden ser/svarar efter legitimering på `samarbete-svar.html`).

## Miljövariabler

```
# mock (default) | disabled | provider (när GrandID/Criipto finns)
SAMARBETE_BANKID_MODE=mock
# HMAC-hemlighet för sessionscookie (annars GMAIL_TOKEN_SECRET / JWT_SECRET)
SAMARBETE_BANKID_SECRET=...

# Senare, när riktig provider kopplas:
# GRANDID_API_KEY=...
# CRIIPTO_DOMAIN=...
```

I demoläge slutförs BankID automatiskt efter ~2,5 s och sätter en HttpOnly-cookie. Svar på BankID-frågor sparas med `verifiedByBankId` i svar-JSON.


---

## Mejl-sidfot

Under **Mejl → Inställningar · sidfot** sparas en personlig HTML-signatur per användare i Application Users-fältet `Mejl Sidfot` (JSON). Fyra dispositionsmallar finns. Tomma fält renderas inte. Sidfoten bifogas automatiskt vid skicka via `/api/mejl/compose-prepare`.

Uppladdade bilder (Bild 1/2) komprimeras i webbläsaren till sidfotsstorlek innan sparning. Airtable long text har ~100 000 tecken; råa telefonbilder som base64 data-URL ger annars `422`. Alternativt kan du ange en bild-URL.

Vid skicka konverteras data-URL-bilder till **inline CID-bilagor** (multipart/related) så Gmail/mottagare inte strippar dem. Mejltexten kodas som UTF-8 base64 så svenska tecken (åäö) behålls.

## BankID-skydd i utgående mejl

Markera text eller bilagor som BankID-skyddade i Nytt mejl. Offentlig del går i Gmail; skyddad del + filer nås via `mejl-skyddad.html` efter BankID (återanvänder `lib/samarbete-bankid.js`, mock default).

API:
- `POST /api/mejl/protected` – skapa skyddat innehåll
- `GET /api/mejl/protected/:token` – meta / innehåll efter BankID
- `POST /api/mejl/bankid/start|collect` – mock/provider-flöde
- `POST /api/mejl/compose-prepare` – bygg HTML med sidfot + länkar

## Frågor / begär underlag från Mejl

Compose kan skapa samma Samarbete-förfrågan som kundkortet (`POST /api/samarbete/requests`) med offentlig/BankID per fråga, och koppla till uppdragskörning eller kunddokumentation.
