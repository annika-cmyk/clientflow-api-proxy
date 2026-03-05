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

---

## Checklista produktion

- [ ] `JWT_SECRET` satt i miljövariabler (lång, slumpad sträng).
- [ ] Inga hemligheter i frontend eller i Git.
- [ ] HTTPS överallt (Render hanterar det).
- [ ] Överväg hashing av lösenord i Airtable och rate limiting på login.
