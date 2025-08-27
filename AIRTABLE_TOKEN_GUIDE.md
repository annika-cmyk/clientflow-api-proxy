# Airtable Personal Access Token Guide

## Problem
Din nuvarande Airtable Personal Access Token ger 401 Unauthorized-fel, vilket betyder att den är ogiltig eller har gått ut.

## Lösning: Generera ny Personal Access Token

### Steg 1: Gå till Airtable
1. Öppna [airtable.com](https://airtable.com)
2. Logga in på ditt konto

### Steg 2: Gå till Account Settings
1. Klicka på din profilbild i övre högra hörnet
2. Välj "Account"

### Steg 3: Generera ny Personal Access Token
1. Scrolla ner till "Personal access tokens"
2. Klicka "Create new token"
3. Ge token ett namn (t.ex. "ClientFlow API")
4. **Viktigt**: Välj rätt behörigheter:
   - Välj din base: `appPF8F7Vv05XYB50`
   - Välj rätt tabell: `tbl0IuLQS2Dqm0QWe`
   - Välj behörigheter: `data.records:read` och `data.records:write`
5. Klicka "Create token"

### Steg 4: Kopiera den nya token
1. Kopiera den nya token (börjar med `pat`)
2. Uppdatera `.env` filen med den nya token

### Steg 5: Testa den nya token
Kör följande kommando för att testa:
```bash
node test_token.js
```

## Alternativ: Använd API Key istället
Om Personal Access Token inte fungerar, kan du också använda en API Key:
1. Gå till din base i Airtable
2. Klicka på "Help" → "API Documentation"
3. Kopiera API Key
4. Uppdatera `.env` filen med `AIRTABLE_API_KEY` istället för `AIRTABLE_ACCESS_TOKEN`

## Nuvarande konfiguration
- **Token**: `patCIRfqURVJTDlZi.4765696675fe8f736900da3e5647af17620e2487528d4838d1496bc71d3d24a9`
- **Base ID**: `appPF8F7Vv05XYB50`
- **Table Name**: `tbl0IuLQS2Dqm0QWe`

## Test-kommandon
```bash
# Testa miljövariabler
node -e "require('dotenv').config(); console.log('Token:', process.env.AIRTABLE_ACCESS_TOKEN ? 'SET' : 'MISSING');"

# Testa Airtable-anslutning
node test_token.js

# Testa servern
curl http://localhost:3000/api/airtable/test
```
