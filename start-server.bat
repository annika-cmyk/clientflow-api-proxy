@echo off
echo Starting ClientFlow API Server...
echo Port: 3001
echo Environment: PRODUCTION
echo.
set BOLAGSVERKET_ENVIRONMENT=prod
set BOLAGSVERKET_CLIENT_ID=O_MKFi5uAzNN1VPjeHyvtnE7G4Ea
set BOLAGSVERKET_CLIENT_SECRET=uTH9r9yroLu6jpPby_05fr3icWEa
set PORT=3001
node index.js
pause
