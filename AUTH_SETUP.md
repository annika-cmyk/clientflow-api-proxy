# ClientFlow Inloggningssystem

## Översikt
Ett komplett inloggningssystem har implementerats för ClientFlow-applikationen med JWT-baserad autentisering.

## Funktioner
- ✅ **Inloggning** - E-post och lösenord
- ✅ **JWT Token** - Säker session-hantering
- ✅ **Automatisk omdirigering** - Till inloggning om inte autentiserad
- ✅ **Utloggning** - Säker utloggning och token-rensning
- ✅ **Användarinfo** - Visar användarnamn och roll i sidebar
- ✅ **Rollbaserad åtkomst** - Admin och användarroller

## Testanvändare

### Administratör
- **E-post:** `admin@clientflow.se`
- **Lösenord:** `password`
- **Roll:** `admin`
- **Byrå:** `Huvudkontor`

### Användare
- **E-post:** `user@clientflow.se`
- **Lösenord:** `password`
- **Roll:** `user`
- **Byrå:** `Stockholm`

## Hur det fungerar

### 1. Inloggning
- Användare går till `login.html`
- Anger e-post och lösenord
- System verifierar mot backend
- JWT token genereras och sparas i localStorage
- Omdirigeras till huvudapplikationen

### 2. Autentiseringskontroll
- Varje sida kontrollerar om användare är inloggad
- Om inte inloggad → omdirigeras till `login.html`
- Token verifieras mot backend vid varje kontroll

### 3. Session-hantering
- Token sparas i localStorage
- Token utgår efter 24 timmar
- Automatisk utloggning vid utgången token

### 4. Utloggning
- Klick på "Logga ut" i sidebar
- Token raderas från localStorage
- Omdirigeras till inloggningssidan

## Teknisk implementation

### Backend (Node.js/Express)
- **JWT-baserad autentisering**
- **bcrypt** för lösenordshashning
- **Middleware** för token-verifiering
- **Endpoints:**
  - `POST /api/auth/login` - Inloggning
  - `GET /api/auth/verify` - Verifiera token
  - `POST /api/auth/logout` - Utloggning
  - `GET /api/auth/me` - Hämta användarinfo

### Frontend (JavaScript)
- **AuthManager-klass** för autentiseringshantering
- **Automatisk omdirigering** vid saknad autentisering
- **LocalStorage** för token-lagring
- **UI-uppdatering** med användarinfo

### Säkerhet
- **HTTPS** rekommenderas för produktion
- **JWT Secret** bör ändras från standard
- **Lösenord** hashas med bcrypt
- **Token-utgång** efter 24 timmar

## Installation och setup

### 1. Installera dependencies
```bash
npm install jsonwebtoken bcryptjs
```

### 2. Konfigurera JWT Secret
Lägg till i `.env` filen:
```
JWT_SECRET=din-super-hemliga-nyckel-här
```

### 3. Starta servern
```bash
.\start-server.ps1
```

### 4. Testa inloggning
- Gå till `http://localhost:5500/login.html`
- Logga in med testanvändarna ovan

## Produktionsanpassningar

### 1. Databas-integration
Ersätt mock-användare med riktig databas:
```javascript
// I index.js, ersätt users-array med databas-query
const user = await db.users.findByEmail(email);
```

### 2. Lösenordshantering
Implementera:
- Lösenordsåterställning via e-post
- Lösenordskomplexitet
- Lösenordshistorik

### 3. Säkerhet
- Använd HTTPS
- Implementera rate limiting
- Lägg till CSRF-skydd
- Använd säkra cookies istället för localStorage

### 4. Rollbaserad åtkomst
Implementera detaljerad behörighetskontroll:
```javascript
// Exempel på rollbaserad åtkomst
if (user.role === 'admin') {
  // Tillåt admin-funktioner
}
```

## Felsökning

### Vanliga problem

1. **"Failed to fetch" vid inloggning**
   - Kontrollera att servern är igång på port 3001
   - Kontrollera CORS-inställningar

2. **Omdirigeras till login trots inloggning**
   - Rensa localStorage: `localStorage.clear()`
   - Kontrollera att token inte har gått ut

3. **Användarinfo visas inte**
   - Kontrollera att auth.js laddas före andra scripts
   - Kontrollera console för JavaScript-fel

### Debug-loggning
Aktivera debug-loggning i `auth.js`:
```javascript
console.log('Auth check:', AuthManager.isAuthenticated());
console.log('Current user:', AuthManager.getCurrentUser());
```

## Nästa steg
- [ ] Integrera med riktig databas
- [ ] Implementera lösenordsåterställning
- [ ] Lägg till rollbaserad åtkomstkontroll
- [ ] Implementera session-timeout
- [ ] Lägg till tvåfaktorsautentisering
