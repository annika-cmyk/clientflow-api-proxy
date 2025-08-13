# Bolagsverket API Setup Guide

## Konfiguration för Testmiljö (Sandbox)

För att använda Bolagsverket API i testmiljön behöver du lägga till följande variabler i din `.env` fil:

```bash
# ========================================
# Bolagsverket API (Värdefulla Datamängder)
# ========================================

# Testmiljö (Sandbox)
BOLAGSVERKET_CLIENT_ID=din_client_id_från_bolagsverket
BOLAGSVERKET_CLIENT_SECRET=din_client_secret_från_bolagsverket
BOLAGSVERKET_ENVIRONMENT=test
```

## Så här får du dina credentials:

1. **Ansök om tillgång**: Kontakta Bolagsverket för att få tillgång till deras API
2. **Få credentials**: Du kommer att få:
   - Client ID
   - Client Secret
   - Lösenord (skickas via SMS)
3. **Ladda ner**: Credentials levereras i en krypterad zip-fil

## Tillgängliga Endpoints

### 1. Testa API-anslutning
```bash
GET /api/bolagsverket/isalive
```

### 2. Hämta företagsinformation
```bash
POST /api/bolagsverket/organisationer
Content-Type: application/json

{
  "organisationsnummer": "5561234567"
}
```

### 3. Hämta dokumentlista
```bash
POST /api/bolagsverket/dokumentlista
Content-Type: application/json

{
  "organisationsnummer": "5561234567"
}
```

### 4. Hämta specifikt dokument
```bash
GET /api/bolagsverket/dokument/{dokumentId}
```

### 5. Hämta kodlistor
```bash
GET /api/bolagsverket/codelists
GET /api/bolagsverket/codelists?type=organisationsform
```

### 6. Återkalla token
```bash
POST /api/bolagsverket/revoke-token
```

## Testdata

I testmiljön kan du endast använda specifika organisationsnummer som är godkända för testning. Dessa finns beskrivna i dokumentet "Testdata API Värdefulla datamängder" från Bolagsverket.

## OAuth 2.0 Token Management

Servern hanterar automatiskt:
- Token-generering med Client Credentials flow
- Token-förnyelse innan utgång
- Token-återkallning vid behov

## Miljöer

- **Test**: `https://portal-accept2.api.bolagsverket.se`
- **Produktion**: `https://portal.api.bolagsverket.se`

För att byta till produktion, ändra `BOLAGSVERKET_ENVIRONMENT=production` i din `.env` fil.

## Scopes

API:et använder följande scopes:
- `vardefulla-datamangder:read` - För att läsa data
- `vardefulla-datamangder:ping` - För att testa anslutning
