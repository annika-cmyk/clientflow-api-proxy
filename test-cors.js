const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// CORS-konfiguration - tillåt alla origins
app.use((req, res, next) => {
    // Sätt CORS headers för alla requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Hantera preflight requests
    if (req.method === 'OPTIONS') {
        console.log('🌐 OPTIONS request handled');
        res.status(200).end();
        return;
    }
    
    // Logga alla requests
    console.log('🌐 Request from origin:', req.headers.origin);
    console.log('🌐 Request method:', req.method);
    console.log('🌐 Request URL:', req.url);
    
    next();
});

app.use(express.json());

// Test endpoint
app.get('/test', (req, res) => {
    res.json({
        message: 'CORS test successful!',
        timestamp: new Date().toISOString(),
        origin: req.headers.origin
    });
});

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        cors: 'enabled'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 CORS Test Server running on port ${PORT}`);
    console.log(`🌐 Test URL: http://localhost:${PORT}/test`);
});
