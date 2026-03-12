# Säkerhetsgenomgång ClientFlow

## Åtgärdat i koden

1. **JWT_SECRET i produktion** – Servern startar inte i produktion om `JWT_SECRET` saknas i miljövariabler. Sätt den på Render (Environment).
2. **PATCH /api/kunddata/:id** – Det finns nu behörighetskontroll: endast ClientFlowAdmin, Ledare för egen byrå eller Anställd kopplad till kunden får uppdatera posten.

---

## Kvarvarande rekommendationer

### 1. Lösenord lagras i klartext (Airtable)
- **Nu:** Inloggning jämför lösenord med `password === user.password` (klartext i Airtable).
- **Risk:** Vid läckage av Airtable-data exponeras alla lösenord.
- **Rekommendation:** Lagra lösenord som bcrypt-hash i Airtable och använd `bcrypt.compare(incomingPassword, user.password)` vid login. Kräver att ni hash:ar befintliga lösenord (t.ex. vid nästa lösenordsändring eller via ett engångsskript).

### 2. Rate limiting
- **Nu:** Ingen rate limiting på login eller API.
- **Risk:** Brute force på inloggning, eller överbelastning av API.
- **Rekommendation:** Lägg till t.ex. `express-rate-limit` för `/api/auth/login` (t.ex. max 5–10 försök per IP per 15 min) och eventuellt en mjukare gräns för övriga API-anrop.

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

### 7. Tvåfaktorsautentisering (2FA)
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
