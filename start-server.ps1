Write-Host "Starting ClientFlow API Server..." -ForegroundColor Green
Write-Host "Port: 3001" -ForegroundColor Yellow
Write-Host "Environment: PRODUCTION" -ForegroundColor Yellow
Write-Host ""

$env:BOLAGSVERKET_ENVIRONMENT = "prod"
$env:BOLAGSVERKET_CLIENT_ID = "O_MKFi5uAzNN1VPjeHyvtnE7G4Ea"
$env:BOLAGSVERKET_CLIENT_SECRET = "uTH9r9yroLu6jpPby_05fr3icWEa"
$env:PORT = "3001"

node index.js
