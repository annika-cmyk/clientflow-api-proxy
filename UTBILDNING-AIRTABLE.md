# Airtable-tabell för AML Grundkurs (Utbildningsslutförande)

För att "Testa dig själv"-kortet och listan över genomförda ska fungera behöver tabellen **Utbildningsslutförande** finnas i Airtable.

## Skapa tabellen automatiskt (rekommenderat)

Kör i projektets rot (med `.env` konfigurerad):

```bash
node scripts/create-utbildningsslutforande-table.js
```

**Krav:** Din `AIRTABLE_ACCESS_TOKEN` måste ha scope **schema.bases:write** (Personal Access Token i Airtable). Scriptet skapar tabellen med fälten Kurs, Användare (länk till Application Users), Byrå ID och Genomförd.

## Tabellnamn och fält (vid manuell skapande)

- **Tabell:** Utbildningsslutförande  
- **Fält:** Kurs (text, primärfält), Användare (länk → Application Users), Byrå ID (text), Genomförd (datum).

## Roller
- **Ledare** ser alla på byrån som genomfört AML Grundkurs (fliken Utbildning under Byrå → Uppgifter byrå & användare).
- **Anställd** ser endast sig själv i listan.
