# Gmail-integration (Mejl)

Koppla användarens Gmail till ClientFlow för att:

1. **Läsa** mejl under etiketten `KUNDER` (underetiketter = kundnamn, t.ex. `KUNDER/Acme AB`)
2. **Skicka** mejl från ClientFlow via Gmail API så avsändaren är användarens egen Gmail

## Google Cloud-setup

1. Skapa projekt i [Google Cloud Console](https://console.cloud.google.com/)
2. Aktivera **Gmail API**
3. Skapa OAuth-klient (typ **Web application**)
4. Lägg till Authorized redirect URI:
   - Prod: `https://app.clientflow.se/api/gmail/oauth/callback`
   - Ev. lokal: `http://localhost:3001/api/gmail/oauth/callback`
5. Kopiera Client ID och Client Secret

## Render-miljövariabler

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_GMAIL_REDIRECT_URI=https://app.clientflow.se/api/gmail/oauth/callback
PUBLIC_BASE_URL=https://app.clientflow.se
# Valfritt – annars JWT_SECRET:
GMAIL_TOKEN_SECRET=...
# Valfritt – standard KUNDER:
GMAIL_KUNDER_LABEL=KUNDER
```

## Airtable

Fältet `Gmail OAuth` (multilineText) skapas automatiskt i **Application Users** vid första kopplingen, eller manuellt:

```
node scripts/setup-gmail-fields.js
```

Tokens lagras krypterade (AES-256-GCM).

## Användning

1. Öppna **Mejl** i sidomenyn
2. Klicka **Koppla Gmail** och godkänn behörigheter
3. Se inkorg från etiketter under KUNDER
4. Skicka nya mejl – de går ut från ditt Gmail och kan etiketteras med kundnamn

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
