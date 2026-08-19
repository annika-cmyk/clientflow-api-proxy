# AML-nyheter – datamodell (motsvarar migration)

ClientFlow-proxyn använder Airtable, inte Laravel/Postgres. Kontraktet speglar ändå en relationsmodell så lagren kan testas utan Airtable.

## Tabell `AML-nyheter` (news_items + classification på samma rad)

Fält skapas av `createAirtableStore().ensureTable()` från `schema.js`:

| Fält | Typ | Syfte |
| --- | --- | --- |
| source | text | Adapter-id (`amla`, `eurlex`, `fatf`, …) |
| source_url | text | Primärkälla – alltid visad tillsammans med sammanfattning |
| title | text | Titel från källan |
| published_at | text (ISO) | Publiceringsdatum om källan har ett |
| raw_content | long text | Rå HTML/text från hämtningen |
| fetched_at | text (ISO) | När jobbet hämtade posten |
| content_hash | text | Dedup-nyckel (källa + url + titel + innehåll) |
| category | text | Layer 2 |
| severity | text | Layer 2 |
| summary_sv | long text | Layer 2, egna ord |
| affected_industries | long text (JSON-array) | Layer 2 |
| affected_geography | long text (JSON-array) | Layer 2 |
| classified_at | text (ISO) | Tom = väntar på Layer 2 |
| classification_json | long text | Fullständig Layer 2-payload för revision |

Idempotens: samma `content_hash` skapar inte en ny rad.

## Byråer-fält `AML-nyheter digest skickad`

ISO-tid för senast skickade veckosammanfattning (medium/high).

## Relevans (Layer 3)

Beräknas deterministiskt vid läsning mot aktuell byråprofil. Sparas inte som egen tabell i fas 1, så att en ändrad profil omedelbart ändrar vad som visas – och så att *varför* alltid kan återskapas från `category` / `affected_*` + profil.
