# Säkerhetsgenomgång ClientFlow

## Åtgärdat i koden

1. **JWT_SECRET i produktion** – Servern startar inte i produktion om `JWT_SECRET` saknas i miljövariabler. Sätt den på Render (Environment).
2. **PATCH /api/kunddata/:id** – Det finns nu behörighetskontroll: endast ClientFlowAdmin, Ledare för egen byrå eller Anställd kopplad till kunden får uppdatera posten.
3. **Känslig data i loggar (punkt 4)** – Login loggar inte längre `req.body` eller lösenord (endast del av e-post för felsökning). `/api/notes`, simple/test save-to-airtable och andra ställen loggar inte full request body; hjälpfunktionen `redactForLog()` finns för framtida användning.
4. **Debug-endpoints utan auth (punkt 5)** – `/debug-softr` (GET och POST) är i produktion avstängda (404). I utveckling krävs inloggning (`authenticateToken`); svar returnerar inte längre rå body/query, endast fältnamn.

---

## Kritiska problem (prioriterad lista)

| # | Problem | Risk |
|---|--------|------|
| 1 | Lösenord sparas i klartext i Airtable – bcrypt är importerat men används inte | Kritisk |
| 2 | Hårdkodade API-nycklar i config.js (t.ex. DocSign) och i dokumentation | Kritisk |
| 3 | ~~Ingen rate limiting på `/api/auth/login` – öppet för brute force~~ | Åtgärdat |
| 4 | ~~Känslig data i loggar – request body loggas (inkl. lösenord vid inloggning)~~ | Åtgärdat |
| 5 | ~~Debug-endpoints utan auth – `/debug-softr` loggar all inkommande data~~ | Åtgärdat |

---

## Saker att förbättra

- **index.js ~10 000 rader** – Monolitisk fil som bör delas upp i router-moduler.
- **Inkonsekvent XSS-skydd** – `innerHTML` används i frontend utan konsekvent sanitisering.
- **Ingen CSRF-skydd** – Cookies utan CSRF-tokens.
- **Ingen test-suite** – Inga automatiserade tester överhuvudtaget.

---

## Sammanfattning

**65/100** – Funktionellt och välstrukturerad affärslogik, men kritiska säkerhetsluckor måste åtgärdas innan riktig kunddata hanteras.

---

## Kvarvarande rekommendationer

### 1. Lösenord lagras i klartext (Airtable)
- **Nu:** Inloggning jämför lösenord med `password === user.password` (klartext i Airtable).
- **Risk:** Vid läckage av Airtable-data exponeras alla lösenord.
- **Rekommendation:** Lagra lösenord som bcrypt-hash i Airtable och använd `bcrypt.compare(incomingPassword, user.password)` vid login. Kräver att ni hash:ar befintliga lösenord (t.ex. vid nästa lösenordsändring eller via ett engångsskript).

### 2. Rate limiting (åtgärdat för login)
- **Åtgärdat:** `/api/auth/login` använder nu `express-rate-limit` (max 10 försök per IP per 15 minuter) med tydligt felmeddelande.
- **Rekommendation:** Överväg mjukare rate limiting även för övriga API-endpoints vid behov.

### 3. CSRF (Cross-Site Request Forgery)
- **Nu:** Cookie-baserad auth utan CSRF-token.
- **Risk:** Om någon lurar en inloggad användare att öppna en skadlig sida kan den sidan i vissa fall skicka förfrågningar med cookien (SameSite=None i produktion).
- **Rekommendation:** Överväg CSRF-token för state-changing requests (POST/PATCH/DELETE), eller begränsa SameSite/cookie-inställningar om det räcker för er användning.

### 4. XSS (Cross-Site Scripting)
- **Nu:** Många ställen använder `innerHTML`/`insertAdjacentHTML`; kundkort använder ofta `_esc()` för användardata.
- **Rekommendation:** Se till att all användar- eller extern data som hamnar i HTML alltid escapas (t.ex. `_esc()`/`escapeHtml()` eller `textContent`). Granska särskilt nya eller redigerade sidor.

### 5. Känsliga data i loggar
- **Nu:** Vissa routes loggar t.ex. e-post eller ID:n.
- **Rekommendation:** Undvik att logga lösenord, tokens eller personnummer. Minska mängden känslig data i loggar i produktion.

### 6. Dataisolering per byrå (rekommendation från IT)
- **Nu:** Alla byråer delar samma databas (Airtable); åtkomst styrs med behörighetslogik i appen (roller, byrå-ID).
- **Risk:** Buggar eller fel i behörighetslogiken kan leda till att en byrå ser en annans data. En komprometterad admin-token ger åtkomst till all data.
- **Rekommendation:** Överväg att varje byrå har egen databas/egen Airtable-base (eller tydlig databas-per-tenant). Ger starkare isolering och enklare att motivera säkerhet gentemot kunder och revisorer.

### 8. Tvåfaktorsautentisering (2FA)
- **Nu:** Inloggning sker endast med användarnamn och lösenord.
- **Risk:** Stulna eller gissade lösenord ger full åtkomst. Särskilt känsligt för roller med bred behörighet.
- **Rekommendation:** Inför 2FA (t.ex. TOTP med app som Google Authenticator eller Authy) för inloggning. Kräver att ni lagrar 2FA-secret per användare (t.ex. i Airtable) och använder t.ex. `speakeasy`/`otplib` för att verifiera koden vid login.

---

## Övriga rekommendationer från extern genomgång

- **Säkra cookies och sessioner**: Säkerställ att autentiseringscookies har `HttpOnly`, `Secure` och lämplig `SameSite`, samt rimlig livslängd och inaktivitetstimeout. Tydlig logout ska rensa session/cookie.
- **Roller och minsta privilegium**: Gå igenom roller (ClientFlowAdmin, Ledare, Anställd) och kontrollera att varje roll bara har de rättigheter som verkligen behövs. Begränsa “superadmin”-behörighet till så få konton som möjligt.
- **Loggning och spårbarhet**: Komplettera tekniska loggar med enklare “audit logg” för viktiga händelser (t.ex. skapande/ändring av kund, ändring av behörigheter), så att det går att se vem som gjort vad vid en incident.
- **Backup och återställning**: Säkerställ backup-rutiner för Airtable-datan (eller framtida databas) och att återställning är testad. Dokumentera hur lång tid det får ta att återställa vid incident.
- **Miljöseparation och hemligheter**: Ha tydlig separation mellan test/stage/produktion och håll alla hemligheter (API-nycklar, JWT-secret, SMTP-lösen osv.) i miljövariabler eller hemlighetshanterare, inte i kod eller Git.

---

## Checklista produktion

- [ ] `JWT_SECRET` satt i miljövariabler (lång, slumpad sträng).
- [ ] Inga hemligheter i frontend eller i Git.
- [ ] HTTPS överallt (Render hanterar det).
- [ ] Överväg hashing av lösenord i Airtable och rate limiting på login.
- [ ] Överväg dataisolering per byrå (egen databas/base) och tvåfaktorsautentisering (2FA).
