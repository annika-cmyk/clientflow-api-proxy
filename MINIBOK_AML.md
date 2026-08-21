# Minibok ↔ Clientflow: AML (risk + policy)

Airtable-backed endpoints för Miniboks AML lager 3.

## Endpoints (API key)

Auth: `Authorization: Bearer {MINIBOK_API_KEY}` + `X-User-Email` / `?userEmail=`

| Method | Path | Syfte |
|--------|------|--------|
| GET | `/api/v1/companies/:clientflowId/aml-risk` | Kundens riskprofil (KUNDDATA) |
| GET | `/api/v1/companies/aml-risk?orgNr=` | Samma via org.nr |
| GET | `/api/v1/agency/aml-risk` | Byråns allmänna riskbedömning |
| GET | `/api/v1/agency/aml-policy` | Byråns AML-policy/rutiner + rules[] |
| GET | `/api/v1/aml/meta` | Kort kontraktsbeskrivning |

`clientflowId` = Airtable **KUNDDATA** `rec…`.

## Fältmappning (kort)

**KUNDDATA → customer aml-risk**

| API | Airtable |
|-----|----------|
| `overallRisk` | `Riskniva` / `sammanlagd risk` → low\|normal\|elevated\|high\|unacceptable (Medel→normal) |
| `expectedTurnoverRange` | `Omsättning` |
| `assessedAt` | `Riskbedömning utförd datum` |
| `approvedAt` | `Kundens riskbedömning godkänd` |
| `rationale` | `Byrans riskbedomning` / `Motivering` |
| `businessSummary` | `Verksamhet` → `Beskrivning av kunden` → KYC → `Verksamhetsbeskrivning` |
| `industryCodes` / `sniCodes` | `SNI kod` / `SNI-koder` |
| `internationalTrade` | `Har företaget transaktioner med andra länder?` + KYC-länder |
| `riskReducingMeasures` | `Risksänkande åtgjärder` |
| `riskReducingFactors` / `riskRaisingFactors` | Riskfaktor-fält på KUNDDATA |
| `klientansvarig` / `behoriga` | `Klientansvarig` + `Användare` (namn från Application Users) |
| `clientflowNotes` | Tabellen Anteckningar |
| `ownershipSummary` / `ownershipMarkers` | `Verklig huvudman` + Kontaktpersoner/KYC |
| `pep` | `PEP` / KYC JSON |
| `riskAtgarderAktiverade` | Uppdrag.`Riskåtgärder aktiverade` (any for kund) |
| `requiredActions` / `hotspots` | KUNDDATA.`Atgarder riskbedomning` (radbruten text) |
| `riskActions[]` | Samma katalog + `periodKind` från uppdragets `Riskåtgärder valda` (`vat` = Momsredovisning, `other` = övriga uppdrag, `unassigned` = inte kopplad) |

**Byråer → agency aml-risk / aml-policy**

- Allmän risk: sektionerna `1. Syfte…` … `8. Värdering…`
- Policy: `1. Syfte och omfattning policy` … `Policydokumentet reviderat och godkänt`
- `focusAreas` och `geoHighRiskList` läses från samma Byråer-post även på `/agency/aml-policy` (så Minibok-AI inte får tom policy)
- `rules[]` inkluderar sektionslabels + inbyggd `cash_text` med `match`

## Tester

```bash
npm test
# eller: node --test lib/minibok-aml.test.js
```
