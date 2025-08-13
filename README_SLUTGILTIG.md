# API Proxy Lösningar för Softr

Detta projekt innehåller flera olika lösningar för att skapa en API-proxy mellan din Softr-applikation och externa API:er. Välj den lösning som passar dig bäst baserat på dina behov och tekniska kunskaper.

## 🚀 Snabbstart - Enklaste lösningen

**För dig som vill komma igång snabbt utan installation:**

1. Öppna `simple_proxy.html` i din webbläsare
2. Ange API URL och organisationsnummer
3. Testa API-anropet
4. Generera kod för Softr

**Begränsningar:** Fungerar endast för API:er som stöder CORS.

---

## 📋 Tillgängliga lösningar

### 1. 🎯 Enkel HTML-lösning (Rekommenderad för snabbstart)
- **Fil:** `simple_proxy.html`
- **Fördelar:** Ingen installation, fungerar direkt i webbläsaren
- **Begränsningar:** CORS-begränsningar
- **Användning:** Öppna filen i webbläsaren

### 2. 🐍 Python Flask-lösning
- **Filer:** `api_proxy.py`, `requirements.txt`
- **Fördelar:** Enkel att installera, bra prestanda
- **Krav:** Python installerat
- **Användning:** `pip install -r requirements.txt && python api_proxy.py`

### 3. ⚡ Node.js Express-lösning
- **Filer:** `server.js`, `package.json`
- **Fördelar:** Robust, många funktioner
- **Krav:** Node.js installerat
- **Användning:** `npm install && npm start`

---

## 🔧 Detaljerad guide för varje lösning

### Lösning 1: Enkel HTML-lösning

**Steg:**
1. Öppna `simple_proxy.html` i webbläsaren
2. Ange din API URL (t.ex. `https://api.example.com/organizations/`)
3. Ange organisationsnummer (t.ex. `556123-4567`)
4. Lägg till API-nyckel om det behövs
5. Klicka "Gör API Anrop"
6. Klicka "Generera Softr Kod" för att få kod att använda i Softr

**Integration med Softr:**
```javascript
// Lägg till denna kod i Softr JavaScript-fält
const orgNumber = record.organization_number;
const apiUrl = `https://din-api-url.com/organizations/${orgNumber}`;

fetch(apiUrl, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer din_api_nyckel' // Om det behövs
    }
})
.then(response => response.json())
.then(data => {
    // Hantera svaret här
    console.log(data);
    
    // Exempel: Uppdatera ett fält
    // record.company_name = data.name;
})
.catch(error => {
    console.error('Fel:', error);
});
```

### Lösning 2: Python Flask-lösning

**Installation:**
```bash
# Installera Python från python.org om du inte har det
pip install -r requirements.txt
```

**Konfiguration:**
Skapa en `.env`-fil:
```env
PORT=3000
EXTERNAL_API_URL=https://api.example.com/organizations
EXTERNAL_API_KEY=din_api_nyckel_här
ALLOWED_ORIGINS=https://din-softr-app.softr.app
```

**Starta servern:**
```bash
python api_proxy.py
```

**Testa:**
Öppna `test_api.html` i webbläsaren

### Lösning 3: Node.js Express-lösning

**Installation:**
```bash
# Installera Node.js från nodejs.org om du inte har det
npm install
```

**Konfiguration:**
Skapa en `.env`-fil:
```env
PORT=3000
EXTERNAL_API_URL=https://api.example.com/organizations
EXTERNAL_API_KEY=din_api_nyckel_här
ALLOWED_ORIGINS=https://din-softr-app.softr.app
```

**Starta servern:**
```bash
npm start
# eller för utveckling:
npm run dev
```

**Testa:**
```bash
node test.js
```

---

## 🌐 Deployment-alternativ

### Gratis hosting-alternativ:

1. **Vercel** (Node.js/React)
   - Ladda upp Node.js-versionen
   - Automatisk deployment

2. **Netlify** (Static HTML)
   - Ladda upp HTML-versionen
   - Fungerar för CORS-kompatibla API:er

3. **Heroku** (Python/Node.js)
   - Ladda upp Python eller Node.js-versionen
   - Gratis tier tillgänglig

4. **Railway** (Python/Node.js)
   - Enkel deployment
   - Gratis tier tillgänglig

### Lokal hosting:
- **Windows:** Använd Windows Subsystem for Linux (WSL)
- **Mac:** Använd Terminal
- **Linux:** Använd terminal

---

## 🔍 Felsökning

### CORS-fel
**Symptom:** "CORS policy blocked" i webbläsaren
**Lösning:** Använd server-baserad lösning (Python eller Node.js)

### API-nyckel fel
**Symptom:** "Unauthorized" eller "401" fel
**Lösning:** Kontrollera att API-nyckeln är korrekt

### Nätverksfel
**Symptom:** "Network error" eller timeout
**Lösning:** Kontrollera internetanslutning och API URL

### Valideringsfel
**Symptom:** "Ogiltigt organisationsnummer format"
**Lösning:** Använd 10-11 siffror (t.ex. 556123-4567)

---

## 📞 Support

### Vanliga frågor:

**Q: Vilken lösning ska jag välja?**
A: Börja med HTML-lösningen. Om du får CORS-fel, använd Python-lösningen.

**Q: Hur integrerar jag med Softr?**
A: Använd webhook-funktionen i Softr eller JavaScript-koden som genereras.

**Q: Kan jag använda detta för andra API:er?**
A: Ja, ändra bara API URL:en och anpassa koden efter behov.

**Q: Är det säkert?**
A: Ja, API-nycklar hanteras säkert och skickas inte till klienten.

---

## 🎯 Nästa steg

1. **Testa HTML-lösningen** först
2. **Om CORS-fel:** Installera Python och använd Flask-lösningen
3. **För produktion:** Deploya till en hosting-tjänst
4. **Integrera med Softr** med webhook eller JavaScript

---

**Lycka till med din API-integration! 🚀**
