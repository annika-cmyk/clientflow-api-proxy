Write-Host "Starting ClientFlow API Server..." -ForegroundColor Green
Write-Host "Port: 3001" -ForegroundColor Yellow
Write-Host "Environment: PRODUCTION" -ForegroundColor Yellow
Write-Host ""

$env:BOLAGSVERKET_ENVIRONMENT = "prod"
$env:BOLAGSVERKET_CLIENT_ID = "ivtjfo81tY1J0H9aSdALV8pV6XIa"
$env:BOLAGSVERKET_CLIENT_SECRET = "JetRMoVWInJPuyJwfQsEtpZRW9Aa"
$env:PORT = "3001"

node index.js
