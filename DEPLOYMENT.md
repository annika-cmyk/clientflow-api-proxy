# Deployment Guide för API Proxy Service

## Snabbstart - Railway (Rekommenderat)

### 1. Förberedelse
- Gå till [railway.app](https://railway.app)
- Logga in med GitHub
- Klicka "New Project"

### 2. Deploya från GitHub
- Välj "Deploy from GitHub repo"
- Välj ditt repository
- Railway kommer automatiskt att upptäcka att det är en Node.js-app

### 3. Konfigurera miljövariabler
I Railway dashboard, gå till "Variables" och lägg till:

```env
# Server Configuration
PORT=3000
NODE_ENV=production
ALLOWED_ORIGINS=https://din-softr-app.softr.app,https://din-softr-app.com

# Bolagsverket API (Värdefulla Datamängder)
BOLAGSVERKET_CLIENT_ID=ivtjfo81tY1J0H9aSdALV8pV6XIa
BOLAGSVERKET_CLIENT_SECRET=JetRMoVWInJPuyJwfQsEtpZRW9Aa
BOLAGSVERKET_ENVIRONMENT=test

# DocSign API (om du använder det)
DOCSIGN_API_KEY=a8a928b1-14ac-4e05-b9a3-3ee759b62f0a
DOCSIGN_BASE_URL=https://docsign.se/api/documents
```

### 4. Få din API URL
- Railway kommer att ge dig en URL som: `https://din-app-name.railway.app`
- Denna URL är din API portal!

## Alternativ 2 - Heroku

### 1. Installera Heroku CLI
```bash
# Windows
winget install --id=Heroku.HerokuCLI

# Eller ladda ner från: https://devcenter.heroku.com/articles/heroku-cli
```

### 2. Deploya
```bash
# Logga in
heroku login

# Skapa app
heroku create din-api-proxy-name

# Deploya
git add .
git commit -m "Deploy API proxy"
git push heroku main

# Sätt miljövariabler
heroku config:set BOLAGSVERKET_CLIENT_ID=ivtjfo81tY1J0H9aSdALV8pV6XIa
heroku config:set BOLAGSVERKET_CLIENT_SECRET=JetRMoVWInJPuyJwfQsEtpZRW9Aa
heroku config:set BOLAGSVERKET_ENVIRONMENT=test
heroku config:set NODE_ENV=production
```

## Alternativ 3 - Render

### 1. Gå till [render.com](https://render.com)
### 2. Skapa "Web Service"
### 3. Koppla till GitHub repository
### 4. Konfigurera:
- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- **Environment:** Node

## Testa din deployed API

Efter deployment, testa:

```bash
# Testa health check
curl https://din-app-name.railway.app/health

# Testa Bolagsverket API
curl https://din-app-name.railway.app/api/bolagsverket/isalive

# Testa organisationsnummer
curl -X POST https://din-app-name.railway.app/api/bolagsverket/organisationer \
  -H "Content-Type: application/json" \
  -d '{"organisationsnummer": "5567223705"}'
```

## Uppdatera Softr-applikationen

I din Softr-applikation, ändra API URL:en från:
```
http://localhost:3000
```
Till:
```
https://din-app-name.railway.app
```

## Säkerhet

- ✅ **HTTPS** - Automatiskt på alla molntjänster
- ✅ **CORS** - Konfigurerat för dina domäner
- ✅ **Rate limiting** - Implementerat
- ✅ **Helmet** - Säkerhetsheaders
- ✅ **Environment variables** - Känslig data är säker

## Monitoring

- **Railway:** Inbyggt monitoring i dashboard
- **Heroku:** `heroku logs --tail`
- **Render:** Logs i dashboard

## Support

Om du har problem:
1. Kolla loggarna i molntjänstens dashboard
2. Verifiera att alla miljövariabler är satta
3. Testa lokalt först med `npm start`
