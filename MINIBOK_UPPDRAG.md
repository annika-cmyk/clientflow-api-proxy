# Minibok ↔ Clientflow: Uppdrag (översikt)

Den här guiden är till för Minibok (Cursor) så att byråsidan kan visa **samma uppdrag** som Clientflow-sidan **Uppdrag (översikt)** och **klarmarkera** dem med synk tillbaka till Clientflow.

## Kort svar: vilka Airtable-tabeller?

| Tabell | Roll i översikten |
|--------|-------------------|
| **Uppdrag** | Primär källa. En rad per kund + uppdragstyp. UI läser främst denna. |
| **Uppdragskörningar** | Sekundär. En rad per uppdrag + period (t.ex. `2026-04`). Status/anteckning/docs per körning. |
| **KUNDDATA** | Enrichment. Kundnamn/orgnr via fältet `Kund ID` på Uppdrag. |

Base: `AIRTABLE_BASE_ID` (default `appPF8F7VvO5XYB50`).

Valfria env-overrides:
- `AIRTABLE_TABLE_UPPDRAG_ID`
- `AIRTABLE_TABLE_UPPDRAG_RUNS_ID`
- `AIRTABLE_TABLE_KUNDDATA_ID` (default `tblOIuLQS2DqmOQWe`)

---

## Vad Clientflow-sidan visar

Filer: `public/uppdrag-oversikt.html` + `public/js/uppdrag-oversikt.js`

Flikar: **Löneuppdrag** · **Momsuppdrag** · **Bokslutsuppdrag** · **Deklarationsuppdrag**

Kolumner per rad:
1. **Klient** (från KUNDDATA via `Kund ID`)
2. **Körning / period** (beräknas från frekvens + deadline / historik)
3. **Status** (`Planerad` / `Pågående` / `Klar` / `Sen` – lagras i `Historik` JSON, synkas till Uppdragskörningar)
4. **Klarmarkera**

Filter: Mina/Byrån · Deadline/Öppna · Klara/Ej klara · månadsnavigering.

### Hur data hämtas i Clientflow (JWT)

```
GET /api/uppdrag/byra?mine=0|1
```

Returnerar Airtable-records från **Uppdrag** filtrerade på inloggad användares `Byrå ID`, med tillagt fält `Kundnamn`.

Periodrader byggs i frontend från:
- `Nästa deadline`, `Frekvens`, `Startdatum`
- `Historik` (JSON-array med `{ periodKey, status, doneAt, deadline, note }`)
- För moms/lön: `public/js/moms-period.js` och `public/js/lone-period.js`

---

## Airtable-fält som Minibok behöver

### Tabell: Uppdrag

| Fält | Typ | Användning |
|------|-----|------------|
| Kund ID | text | Koppling till KUNDDATA (`rec…`) |
| Byrå ID | text | Dataseparering |
| Typ | singleSelect | `Löneuppdrag`, `Löneuppdrag innevarande`, `Löneuppdrag efterhand`, `Momsredovisning`, `Bokslut`, `Deklaration` |
| Frekvens | singleSelect | `Varje månad`, `Varje kvartal`, `Årsvis`, … |
| Startdatum | date | När uppdraget får synas |
| Nästa deadline | date | Nästa körningsdeadline |
| Ansvarig | text | Filter "Mina" |
| Senast utförd | date | Sätts vid klarmarkering |
| Status | singleSelect | `Aktiv` / `Pausad` / `Avslutad` |
| Historik | long text (JSON) | Per-period status + anteckningar |
| Riskåtgärder aktiverade | checkbox | Kräver anteckning vid klarmarkering i CF-UI |
| Riskåtgärder valda | long text | Risksänkande åtgärder på uppdraget (`riskAtgarderValda[]`) |
| Anteckning / Rutin | long text | Instruktioner — exponeras på board-rader som `rutin` / `anteckning` |
| Klientansvarig | text | På uppdraget; fallback från KUNDDATA |

### Tabell: Uppdragskörningar

| Fält | Typ | Användning |
|------|-----|------------|
| Run Key | text | `<uppdragId>:<periodKey>` |
| Uppdrag ID | text | Parent i Uppdrag |
| Kund ID / Byrå ID | text | Separering |
| Typ | singleSelect | Samma som Uppdrag |
| PeriodKey | text | `2026-04`, `2026-Q2`, `2026` |
| Period Label | text | Visningsnamn |
| Deadline | date | Deadline för körningen |
| Status | singleSelect | `Planerad` / `Pågående` / `Klar` / `Sen` |
| Anteckning | long text | Per körning |
| Dokumentation | attachments | Bilagor |

---

## Minibok API (API-nyckel)

Auth (samma som companies-API):
```
Authorization: Bearer <MINIBOK_API_KEY>
```
eller header `x-api-key` / `x-clientflow-secret`.

Alltid skicka **userEmail** (Clientflow-användare, samma som i Application Users):
- header `X-User-Email`, eller
- query `?userEmail=`, eller
- body `{ "userEmail": "..." }`

### 1) Meta (tabeller/fält/endpoints)

```
GET /api/v1/uppdrag/meta
```

### 2) Lista uppdrag (samma vy som översikten)

**Board-vy (rekommenderas för Minibok UI):**
```
GET /api/v1/uppdrag?userEmail=annika@exempel.se&month=2026-04&typ=Löneuppdrag&mine=0&view=board
```

Svar (förenklat):
```json
{
  "view": "board",
  "month": "2026-08",
  "rows": [
    {
      "uppdragId": "rec…",
      "customerId": "rec…",
      "customerName": "ENA Operations AB",
      "orgNr": "5561234567",
      "typ": "Löneuppdrag efterhand",
      "periodKey": "2026-07",
      "periodLabel": "Lön som utbetalats i juli",
      "deadline": "2026-08-10",
      "status": "Planerad",
      "done": false,
      "ansvarig": "Annika"
    }
  ],
  "records": [ /* råa Airtable-records om du vill bygga egen board-logik */ ]
}
```

**Viktigt:** Board-vyn använder samma periodmotor som Clientflow (`lone-period.js` / `moms-period.js`).
Löneuppdrag syns under hela fönstret startdatum→deadline (inte bara om `Nästa deadline` ligger i vald månad).
Visa `periodLabel` i Period-kolumnen (t.ex. "Lön som utbetalats i juli").

**Raw (samma payload som Clientflow `GET /api/uppdrag/byra`):**
```
GET /api/v1/uppdrag?userEmail=…&view=raw&mine=0
```

`typ`-filter:
- `Löneuppdrag` (inkluderar innevarande/efterhand/legacy)
- `Momsredovisning`
- `Bokslut`
- `Deklaration`

### 3) Klarmarkera (synkar till Clientflow)

```
POST /api/v1/uppdrag/complete
Content-Type: application/json

{
  "userEmail": "annika@exempel.se",
  "customerId": "recXXXXXXXX",
  "typ": "Löneuppdrag innevarande",
  "periodKey": "2026-04",
  "note": "Klart i Minibok",
  "doneAt": "2026-04-10"
}
```

Vad som skrivs i Airtable (därför synkas Clientflow direkt):
1. **Uppdrag**: `Senast utförd`, `Historik` (status `Klar` för `periodKey`), `Nästa deadline` (flyttas fram enligt frekvens)
2. **Uppdragskörningar**: `Status = Klar` för matchande `Uppdrag ID` + `PeriodKey`

### 4) Ändra status utan full complete

```
PATCH /api/v1/uppdrag/run-status
Content-Type: application/json

{
  "userEmail": "annika@exempel.se",
  "customerId": "recXXXXXXXX",
  "typ": "Momsredovisning",
  "periodKey": "2026-Q1",
  "status": "Pågående"
}
```

---

## Rekommenderat flöde i Minibok

1. Vid byråsida: anropa `GET /api/v1/uppdrag?view=board&month=YYYY-MM&typ=…`
2. Rendera tabell: klient · period · status · knapp Klarmarkera
3. Vid klarmarkering: `POST /api/v1/uppdrag/complete` med `customerId`, `typ`, `periodKey`
4. Ladda om board – raden ska visa `status: Klar` / `done: true`
5. Öppna Clientflow Uppdrag (översikt) → samma rad är klar (samma Airtable)

**OBS:** Minibok ska **inte** skriva direkt till Airtable. Använd alltid Clientflow `/api/v1/uppdrag*`.

---

## Synkprincip

```
Minibok  --API-->  Clientflow proxy  --write-->  Airtable
Clientflow UI     --read------------>  Airtable
```

Ingen separat webhook behövs för uppdrag: båda apparna delar Airtable som source of truth.
