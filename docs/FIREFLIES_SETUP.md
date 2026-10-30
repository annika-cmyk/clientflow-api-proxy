# Fireflies → ClientFlow (mötesanteckningar)

När Fireflies har genererat en sammanfattning av ett möte kan ClientFlow automatiskt spara en **Mötesanteckning** på rätt kund.

## Så fungerar det

1. Fireflies skickar webhook `meeting.summarized` till ClientFlow.
2. ClientFlow hämtar sammanfattning + deltagare via Fireflies GraphQL API.
3. Deltagarnas e-post matchas mot kundkort (`e-post` + kontaktpersoner).
4. Vid **unik** träff skapas (eller uppdateras) en anteckning av typen `Mötesanteckningar`.

Om flera kunder matchar, eller ingen, sparas inget automatiskt (säkerhetsnät mot fel kund).

## Render / miljövariabler

Sätt i Render (Environment):

| Variabel | Krävs | Beskrivning |
|---|---|---|
| `FIREFLIES_API_KEY` | Ja | API-nyckel från Fireflies → Integrations → Developer |
| `FIREFLIES_WEBHOOK_SECRET` | Rekommenderas | Samma signing secret som du anger i Fireflies Webhooks V2 |
| `FIREFLIES_OWNER_EMAIL` | Rekommenderas | Din ClientFlow-inloggning (e-post). Används om `organizer_email` inte finns som CF-användare |

Efter Save: **Manual Deploy** om Render inte auto-deployar env-ändringar.

Kontrollera: `GET https://<din-host>/api/integrations/fireflies/status`

## Fireflies-setup

1. Gå till **Integrations → Webhooks V2** i Fireflies.
2. Webhook URL:

```text
https://clientflow-api-proxy-1.onrender.com/api/integrations/fireflies/webhook
```

(Byt host om du kör annan Render-tjänst.)

3. Ange **Signing Secret** (= `FIREFLIES_WEBHOOK_SECRET`).
4. Event: **`meeting.summarized`** (valfritt: slå på *Resend when notes change*).
5. Spara och klicka **Send Test Event** — ClientFlow ska svara `test: true`.

## Tips för bra matchning

- Se till att kundens e-post (eller kontaktpersons e-post) finns på kundkortet.
- Fireflies sparar bara möten **du äger** (organizer). Enterprise Super Admin kan få team-möten.
- Bjud in kundens e-post till mötet så den syns bland deltagarna.

## Anteckningens innehåll

- Rubrik/titel, datum, AI-sammanfattning, punkter, åtgärder
- Åtgärder läggs även som ToDo1–ToDo8 när det går
- Länk till Fireflies + `Fireflies-id:` för idempotens (uppdatering vid omprocessering)
