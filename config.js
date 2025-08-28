// API Configuration
const config = {
    // DocSign API Configuration
    docsign: {
        // ⚠️ ENDAST FÖR TEST - I produktion ska detta hämtas från servern
        apiKey: 'a8a928b1-14ac-4e05-b9a3-3ee759b62f0a',
        baseUrl: 'https://docsign.se/api/documents'
    },
    
    // Proxy Server Configuration
    proxy: {
        url: 'https://clientflow-api-proxy-1.onrender.com/api/lookup'
    }
};

// Export för användning i andra filer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
}
