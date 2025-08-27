@echo off
echo Starting ClientFlow API Server...
echo Port: 3001
echo Environment: PRODUCTION
echo.
set BOLAGSVERKET_ENVIRONMENT=prod
set BOLAGSVERKET_CLIENT_ID=ivtjfo81tY1J0H9aSdALV8pV6XIa
set BOLAGSVERKET_CLIENT_SECRET=JetRMoVWInJPuyJwfQsEtpZRW9Aa
set PORT=3001
node index.js
pause
