// API Configuration
const config = {
    // DocSign API Configuration
    docsign: {
        // API-nyckel ska alltid komma från server/miljövariabel, aldrig hårdkodas i frontend.
        apiKey: typeof process !== 'undefined' && process.env && process.env.DOCSIGN_API_KEY
            ? process.env.DOCSIGN_API_KEY
            : null,
        baseUrl: typeof process !== 'undefined' && process.env && process.env.DOCSIGN_BASE_URL
            ? process.env.DOCSIGN_BASE_URL
            : 'https://docsign.se/api/documents',
        configured: typeof process !== 'undefined' && process.env && !!process.env.DOCSIGN_API_KEY
    },
    
    // Proxy Server Configuration
    proxy: {
        url: 'https://clientflow-api-proxy-1.onrender.com/api/lookup'
    }
};

// Export för användning i andra filer (Node)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
}
