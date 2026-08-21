# Audit logg i Airtable – kända begränsningar

Appen behandlar tabellen `Audit logg` som append-only. `PUT`/`PATCH`/`DELETE` på `/api/audit-log/:id` svarar 405, och store-lagret kastar `AUDIT_IMMUTABLE`. Det skyddar bara anrop som går via ClientFlow.

Airtable har **ingen** tabellnivå-spärr mot UPDATE/DELETE som appen kan sätta via API. En person med skrivbehörighet i basen kan ändra eller radera rader direkt i Airtable.

## Vad som undersöktes 2026-08-21

Bas: `Klientdata softr` (`appPF8F7VvO5XYB50`). API-token har `permissionLevel: create`.

| Åtgärd | Resultat |
| --- | --- |
| Lista collaborators via Meta API | `404 NOT_FOUND`. Token saknar scope för collaborator-API (`workspacesAndBases:read` / Enterprise-endpoint). |
| Sätta tabellbehörighet så bara API-token får skriva | Går inte via nuvarande token/plan. Field/table editing permissions finns i Airtable-UI på **Team, Business och Enterprise Scale**. |
| Revisionshistorik per tabell via API | Finns inte som aktiverings-API. Record revision history är en UI-funktion på alla planer (hur långt tillbaka beror på workspace-plan). |
| Tabellbeskrivning | Uppdaterad: påminnelse om append-only och att mänskliga collaborators ska ha läsbehörighet. |

## Gör så här i Airtable-UI (kräver Owner/Creator)

1. Öppna `Audit logg`.
2. Om workspace är Team eller högre: **Table permissions** → bara den användare vars personal access token appen använder får skapa rader. Stäng av delete för övriga.
3. **Field permissions** på alla fält: bara samma API-användare får redigera cellvärden. Övriga, inklusive Annika, ska vara **read-only** på den här tabellen (gärna Commenter/Read-only på hela basen om de inte måste skriva i andra tabeller).
4. Öppna en loggrad → Activity → **Revision history** ska vara synlig. Det är den oberoende kontrollen mot manuell manipulation. Slå inte av "Show history in expanded records".
5. Ta inte bort Creator-behörighet från API-tokenägaren, då slutar inläsningen fungera.

Dessa UI-steg kan **inte** utföras av deploy-token i det här läget (collaborator-API 404).

## Känd begränsning till Laravel-ombyggnaden

Så länge loggen ligger i Airtable kan en Creator/Owner alltid ångra tabellspärrar och redigera rader. För PTL-hållbar append-only krävs antingen:

- Airtable-plan med field/table permissions **plus** att inga extra Creator/Owner finns på basen, eller
- flytt av `audit_log` till Postgres (eller motsvarande) med `REVOKE UPDATE, DELETE` i samband med Laravel-ombyggnaden.

Appens 405-svar och immutability-funktioner är kompensation i applikationslagret, inte ett databasskydd.
