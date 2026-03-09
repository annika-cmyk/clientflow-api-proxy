# Migrering från Airtable till Grist

Du har importerat databasen till Grist. Här är nästa steg för att koppla ClientFlow-backend till Grist.

---

## 1. Grist-inställningar

### API-nyckel
1. Logga in på Grist (docs.getgrist.com eller er team-URL).
2. Klicka på din profil (uppe till höger) → **Profile Settings**.
3. Scrolla till **API** → **Create** för att skapa en API-nyckel.
4. Kopiera nyckeln (visas bara en gång).

### Behörighet så att appen får läsa och skriva (som med Airtable)
I Grist har API-nyckeln **samma behörighet som det användarkonto** som skapade nyckeln. För att ClientFlow ska kunna hämta och redigera data i dokumentet måste därför det konto som äger API-nyckeln ha **minst Redigera (Editor)** till dokumentet.

- **Om du skapade dokumentet** (eller importerade det till ditt konto): du är redan ägare → inget mer behövs.
- **Om dokumentet ägs av någon annan eller ligger i en team-site**:  
  1. Öppna dokumentet i Grist.  
  2. Klicka **Share** / **Dela** (eller kugghjulet → **Access**).  
  3. Lägg till **samma e-postadress** som det Grist-konto där du skapade API-nyckeln.  
  4. Ge rollen **Editor** (eller **Owner**).  
  5. Spara.

Då kan API-anrop med din nyckel både läsa och skriva i dokumentet, ungefär som med Airtable-nyckeln.

### Dokument-ID (Doc ID)
ClientFlow-dokumentet i Grist har följande ID för API-användning:

- **Doc ID:** `tj5tAKWhksejtd9ReFCDKt`

(Dokument-ID finns även i Grist under **Document settings** (kugghjulet) → **Document ID**, eller i dokumentets URL.)

### Tabell- och fältnamn (Table IDs / kolumnnamn)
ClientFlow är anpassad till er Grist-struktur. Använda tabeller och fält:

| Tabell (Table ID)   | Användning     | Viktiga kolumnnamn |
|---------------------|----------------|--------------------|
| **Application_Users** | Inloggning, användare | Email, password, Full_Name, Role, Byra, Orgnr_Byra, Byra_ID_i_text_2, Byraer, Logga |
| **KUNDDATA**        | Kundkort, kundlista | Airtable_Id, Byra_ID, Anvandare, Namn, Orgnr, … |

- **Airtable_Id** i KUNDDATA används för att öppna gamla länkar med `rec...`-id.
- **Byra_ID** (KUNDDATA) och **Byra_ID_i_text_2** (Application_Users) används för behörighet (Ledare).
- **Anvandare** (KUNDDATA, numeriskt) används för behörighet (Anställd).

Standard i koden: `GRIST_TABLE_USERS=Application_Users`, `GRIST_TABLE_KUNDDATA=KUNDDATA`. Ändra bara om era tabeller heter annorlunda.

---

## 2. Miljövariabler

Lägg till i `.env` (lokal utveckling) och i Render (produktion):

```env
# Grist (används om satt – annars Airtable)
GRIST_API_KEY=din_grist_api_nyckel
GRIST_DOC_ID=tj5tAKWhksejtd9ReFCDKt
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

Efter migrering returnerar API:et Grist:s id (tal). Frontend som använder `id` från API-svar fungerar som tidigare.

### Gamla Airtable-länkar (recXXX) – valfritt

Om ni vill att gamla länkar med Airtable-id (t.ex. `kundkort.html?id=rec5sMR7cIVi5tIjR`) ska fungera mot Grist:

1. I Grist, lägg till en kolumn i KUNDDATA-tabellen som innehåller det gamla Airtable record-id (t.ex. namn **"Airtable Record ID"** eller **"AirtableId"**).
2. Fyll i kolumnen för varje rad med motsvarande `rec...`-värde (från Airtable-export eller era gamla länkar).
3. I `.env` sätt variabeln:  
   `GRIST_COLUMN_AIRTABLE_REC_ID=Airtable Record ID`  
   (använd exakt det kolumnnamn som visas i Grist.)
4. Starta om servern.

Då svarar `GET /api/kunddata/recXXX` med kunden från Grist om en rad har det Airtable-id:t i den kolumnen.

---

## 6. Felsökning

- **401 Unauthorized**: Kontrollera `GRIST_API_KEY` (ingen extra mellanslag, hela nyckeln).
- **403 Forbidden** (vid läs/skriv): Användarkontot som äger API-nyckeln har inte tillräcklig behörighet till dokumentet. Ge kontot minst **Editor** på dokumentet (Share/Access i Grist).
- **404 / tabell hittas inte**: Dubbelkolla `GRIST_DOC_ID` och tabell-ID (Raw Data). Prova med understreck istället för mellanslag, t.ex. `Application_Users`.
- **Inloggning visar fortfarande Airtable-användare**: Kontrollera att både `GRIST_API_KEY` och `GRIST_DOC_ID` är satta och att servern startats om efter ändring i .env.
