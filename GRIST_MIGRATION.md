# Migrering från Airtable till Grist

Du har importerat databasen till Grist. Här är nästa steg för att koppla ClientFlow-backend till Grist.

---

## 1. Grist-inställningar

### API-nyckel
1. Logga in på Grist (docs.getgrist.com eller er team-URL).
2. Klicka på din profil (uppe till höger) → **Profile Settings**.
3. Scrolla till **API** → **Create** för att skapa en API-nyckel.
4. Kopiera nyckeln (visas bara en gång).

### Dokument-ID (Doc ID)
1. Öppna det importerade dokumentet i Grist.
2. Dokument-ID finns i URL:en:  
   `https://docs.getgrist.com/doc/XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`  
   eller under **Document settings** (kugghjulet) → **Document ID**.

### Tabellnamn (Table IDs)
I Grist används **Table ID** (syns i Raw Data / tabellens flik). Vid import från Airtable blir det ofta:
- **Application Users** eller liknande för användare
- **KUNDDATA** för kunddata
- Andra tabeller heter som i Airtable

Kolla under **Raw Data** i Grist vilka tabell-ID:n ni har (t.ex. `Application_Users`, `KUNDDATA`).

---

## 2. Miljövariabler

Lägg till i `.env` (lokal utveckling) och i Render (produktion):

```env
# Grist (används om satt – annars Airtable)
GRIST_API_KEY=din_grist_api_nyckel
GRIST_DOC_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRIST_SERVER=https://docs.getgrist.com

# Tabell-ID:n i Grist (om de skiljer sig från nedan)
# Standard efter import är ofta: Application Users, KUNDDATA, etc.
GRIST_TABLE_USERS=Application_Users
GRIST_TABLE_KUNDDATA=KUNDDATA
```

- **GRIST_SERVER**: `https://docs.getgrist.com` för personligt konto. För team: `https://<TEAM>.getgrist.com`.
- **GRIST_TABLE_***: Namnet på tabellen i Grist (Raw Data). Mellanslag kan behöva ersättas med understreck beroende på hur Grist normaliserar.

---

## 3. Vad som är gjort i koden

- **lib/grist.js** – Grist API-klient (hämta/lista/post/patch records).
- **index.js** – Inloggning och `/api/auth/me` använder **Grist** om `GRIST_API_KEY` och `GRIST_DOC_ID` är satta; annars Airtable.

Så fort du satt API-nyckel och Doc ID kan du testa inloggning mot Grist.

---

## 4. Nästa steg (i prioritetsordning)

| Steg | Beskrivning | Status |
|------|-------------|--------|
| 1 | Sätt `GRIST_API_KEY`, `GRIST_DOC_ID`, ev. `GRIST_SERVER` i .env | Du |
| 2 | Verifiera tabell-ID för användare (ev. `GRIST_TABLE_USERS`) | Du |
| 3 | Testa inloggning (login + /api/auth/me) mot Grist | Du |
| 4 | Byta övriga endpoints till Grist (kunddata, avvikelser, riskbedömning, etc.) | Pågår stegvis |

---

## 5. Viktigt om record-ID:n

- **Airtable**: record-ID är strängar (`recXXXXXXXXXXXXXX`).
- **Grist**: record-ID är **heltal** (t.ex. `1`, `2`, `3`).

Efter migrering returnerar API:et Grist:s id (tal). Frontend som använder `id` från API-svar fungerar som tidigare. Om ni har sparade länkar eller externa referenser som använder Airtable record-id måste de uppdateras eller mappas (t.ex. extra kolumn i Grist med gamla id under övergången).

---

## 6. Felsökning

- **401 Unauthorized**: Kontrollera `GRIST_API_KEY` (ingen extra mellanslag, hela nyckeln).
- **404 / tabell hittas inte**: Dubbelkolla `GRIST_DOC_ID` och tabell-ID (Raw Data). Prova med understreck istället för mellanslag, t.ex. `Application_Users`.
- **Inloggning visar fortfarande Airtable-användare**: Kontrollera att både `GRIST_API_KEY` och `GRIST_DOC_ID` är satta och att servern startats om efter ändring i .env.
