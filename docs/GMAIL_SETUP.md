# Gmail-integration (Mejl)

Koppla användarens Gmail till ClientFlow för att:

1. **Läsa** mejl under etiketten `KUNDER` (underetiketter = kundnamn, t.ex. `KUNDER/Acme AB`)
2. **Skicka** mejl från ClientFlow via Gmail API så avsändaren är användarens egen Gmail

## Google Cloud-setup

1. Skapa projekt i [Google Cloud Console](https://console.cloud.google.com/)
2. Aktivera **Gmail API**
3. Konfigurera OAuth-consent screen (External eller Internal för Workspace)
4. Skapa OAuth-klient (typ **Web application**)
5. Lägg till **Authorized redirect URI** (måste matcha `GOOGLE_GMAIL_REDIRECT_URI` exakt):
   - Prod (kanonisk host): `https://www.app.clientflow.se/api/gmail/oauth/callback`
   - Ev. alias utan www om ni använder det i OAuth: `https://app.clientflow.se/api/gmail/oauth/callback`
   - Lokal: `http://localhost:3001/api/gmail/oauth/callback`
6. Kopiera **Client ID** och **Client Secret**

## Render-miljövariabler

Sätt dessa på **web service** som kör `app.clientflow.se` (Environment → Environment Variables → **Save Changes**). Om auto-deploy inte startar: **Manual Deploy → Deploy latest commit**.

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

### Accepterade alias (första icke-tomma vinner)

| Fält | Kanoniskt namn (rekommenderat) | Alias |
|------|-------------------------------|-------|
| Client ID | `GOOGLE_CLIENT_ID` | `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GMAIL_CLIENT_ID` |
| Client Secret | `GOOGLE_CLIENT_SECRET` | `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_CLIENT_SECRET` |
| Redirect URI | `GOOGLE_GMAIL_REDIRECT_URI` | `GOOGLE_REDIRECT_URI`, `GOOGLE_OAUTH_REDIRECT_URI`, `GMAIL_REDIRECT_URI` |

Tomma eller bara whitespace räknas som saknade. Använd gärna de kanoniska namnen.

När variablerna saknas visar Mejl-sidan status **Ej konfigurerad**. `/api/gmail/status` returnerar `missingEnv`, `envPresent` (boolean per kanonisk nyckel) och `envResolvedFrom` (vilket alias som gav värde) – utan att läcka secret-värden.

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

## Felsökning

| Symptom | Åtgärd |
|--------|--------|
| Status "Ej konfigurerad" | Kontrollera att alla tre OAuth-fält finns (kanoniskt eller alias) på **rätt** Render-service och att tjänsten startat om efter Save |
| `envPresent` visar false trots att du lagt in vars | Fel variabelnamn, tomt värde, fel service, eller saknad redeploy efter Save |
| Knappen visar toast med saknade env | Lägg in dem i Render (värden från Google Cloud); alias fungerar också |
| `redirect_uri_mismatch` efter Google-login | Redirect URI i Google Cloud måste vara **exakt** samma som `GOOGLE_GMAIL_REDIRECT_URI` (inkl. `www`) |
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
