# Server Setup Guide

## Enkel och konsekvent server-konfiguration

### Problem som var lösta:
- ❌ Blandade portar (3001, 3002, 3003)
- ❌ Förvirrande startkommandon
- ❌ Inkonsekvent CORS-konfiguration
- ❌ Frontend som anropar fel portar

### Lösningen:
- ✅ **Standardiserad port 3001** för allt
- ✅ **Enkla startskript** för Windows
- ✅ **Konsekvent CORS-konfiguration**
- ✅ **Alla frontend-filer uppdaterade**

## Snabbstart

### 1. Starta servern (välj ett alternativ)

**Windows Batch (enklast):**
```bash
start-server.bat
```

**PowerShell:**
```powershell
.\start-server.ps1
```

**Manuellt:**
```powershell
$env:BOLAGSVERKET_ENVIRONMENT="prod"
$env:BOLAGSVERKET_CLIENT_ID="ivtjfo81tY1J0H9aSdALV8pV6XIa"
$env:BOLAGSVERKET_CLIENT_SECRET="JetRMoVWInJPuyJwfQsEtpZRW9Aa"
$env:PORT=3001
node index.js
```

### 2. Verifiera att servern fungerar

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/health"
```

Du ska få: `{"status":"OK","service":"API Proxy Service"}`

### 3. Testa Bolagsverket API

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/api/bolagsverket/organisationer" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"organisationsnummer": "5567223705"}'
```

### 4. Öppna frontend

Starta Live Server på din frontend (port 5500) och navigera till:
- `http://127.0.0.1:5500/public/index.html` (huvudsida)
- `http://127.0.0.1:5500/public/riskbedomning-byra.html` (riskbedömning)

## Konfiguration

### Portar:
- **Backend API:** Port 3001
- **Frontend (Live Server):** Port 5500
- **CORS:** Tillåter 127.0.0.1:5500 och localhost:5500

### Miljövariabler:
- `PORT=3001`
- `BOLAGSVERKET_ENVIRONMENT=prod`
- `BOLAGSVERKET_CLIENT_ID=ivtjfo81tY1J0H9aSdALV8pV6XIa`
- `BOLAGSVERKET_CLIENT_SECRET=JetRMoVWInJPuyJwfQsEtpZRW9Aa`

## Filer som är konfigurerade:

### Backend:
- `index.js` - CORS-konfiguration för port 3001
- `start-server.bat` - Windows batch-skript
- `start-server.ps1` - PowerShell-skript

### Frontend:
- `public/app.js` - Använder port 3001
- `public/js/riskbedomning-byra.js` - Använder port 3001
- `config.js` - Använder port 3001

## Felsökning

### "Port already in use"
```powershell
taskkill /F /IM node.exe
```
Starta sedan servern igen.

### "Failed to fetch"
Kontrollera att:
1. Servern körs på port 3001
2. Frontend använder Live Server (port 5500)
3. CORS är korrekt konfigurerat

### "Bolagsverket disconnected"
Kontrollera att:
1. Miljövariabler är satta korrekt
2. Produktionsmiljö används (`BOLAGSVERKET_ENVIRONMENT=prod`)
3. Rätt credentials används

## Nästa steg

När servern fungerar korrekt kan du:
1. Testa index-sidan med organisationsnummer
2. Testa riskbedömningssidan
3. Konfigurera Airtable API-nyckel för full funktionalitet
