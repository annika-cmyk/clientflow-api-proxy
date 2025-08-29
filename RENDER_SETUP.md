# Render Deployment Setup Guide

## Miljövariabler för Render

För att systemet ska fungera på `app.clientflow.se` behöver du sätta följande miljövariabler i Render's dashboard:

### Steg 1: Gå till Render Dashboard
1. Logga in på [render.com](https://render.com)
2. Gå till din `clientflow-api-proxy-1` service
3. Klicka på "Environment" i sidomenyn

### Steg 2: Lägg till miljövariabler

Kopiera och klistra in följande variabler:

```
# Server Configuration
PORT=3001
NODE_ENV=production

# Airtable API (VIKTIGT: Använd din nya token här!)
AIRTABLE_ACCESS_TOKEN=din_nya_airtable_token_här
AIRTABLE_BASE_ID=appPF8F7VvO5XYB50
AIRTABLE_TABLE_NAME=Organisationer
AIRTABLE_API_URL=https://api.airtable.com/v0

# DocSign API
DOCSIGN_API_KEY=a8a928b1-14ac-4e05-b9a3-3ee759b62f0a
DOCSIGN_BASE_URL=https://docsign.se/api/documents

# Bolagsverket API
BOLAGSVERKET_CLIENT_ID=O_MKFi5uAzNN1VPjeHyvtnE7G4Ea
BOLAGSVERKET_CLIENT_SECRET=uTH9r9yroLu6jpPby_05fr3icWEa
BOLAGSVERKET_ENVIRONMENT=prod
BOLAGSVERKET_TOKEN_URL=https://portal.api.bolagsverket.se/oauth2/token
BOLAGSVERKET_BASE_URL=https://portal.api.bolagsverket.se

# Säkerhet
ENCRYPTION_KEY=din_32_tecken_långa_krypteringsnyckel
SESSION_SECRET=din_64_tecken_långa_session_secret
JWT_SECRET=din_64_tecken_långa_jwt_secret

# GDPR och datalagring
DATA_RETENTION_DAYS=90
AUTO_DELETE_LOGS=true

# Proxy Configuration
PROXY_URL=http://localhost:3001/api/lookup
```

### Steg 3: Uppdatera Airtable Token
**VIKTIGT**: Ersätt `din_nya_airtable_token_här` med din nya Airtable Personal Access Token.

### Steg 4: Spara och deploya
1. Klicka "Save Changes"
2. Render kommer automatiskt att deploya om med de nya variablerna

## Testa deploymenten

Efter deployment, testa:
1. `https://clientflow-api-proxy-1.onrender.com/health`
2. `https://app.clientflow.se` (frontend)
3. Logga in och testa att skapa riskfaktorer

## Lokal utveckling vs Render

- **Lokal**: Använder `.env` fil (som inte syns på GitHub)
- **Render**: Använder miljövariabler i dashboard
- **Frontend**: `config.js` detekterar automatiskt vilken miljö som används

## Felsökning

Om du får 401-fel från Airtable:
1. Kontrollera att token är korrekt i Render
2. Generera ny token om nödvändigt
3. Uppdatera både lokal `.env` och Render-variabler
