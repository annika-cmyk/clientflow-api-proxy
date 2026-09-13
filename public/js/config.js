// ========================================
// API Configuration - Auto-detects environment
// ========================================

class APIConfig {
    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.apiUrl = `${this.baseUrl}/api`;
    }

    getBaseUrl() {
        const host = window.location.hostname;

        // Lokal utveckling
        if (host === 'localhost' || host === '127.0.0.1') {
            console.log('🔧 Detected localhost, using local API');
            return 'http://localhost:3001';
        }

        // Prod: same-origin så cookies + Gmail-env träffar samma Render-tjänst
        // som serverar sidan. www.app.clientflow.se → clientflow-api-proxy-1.
        // (Den äldre tjänsten clientflow-api-proxy utan -1 används inte i prod.)
        if (
            host === 'app.clientflow.se' ||
            host === 'www.app.clientflow.se' ||
            host.includes('onrender.com')
        ) {
            console.log(`🔧 Detected ${host}, using same-origin API`);
            return window.location.origin;
        }

        // Okänd host – kanonisk prod-API
        console.log('🔧 Using default API URL');
        return 'https://clientflow-api-proxy-1.onrender.com';
    }

    getApiUrl(endpoint = '') {
        return `${this.apiUrl}${endpoint}`;
    }

    getFullUrl(endpoint) {
        return `${this.baseUrl}${endpoint}`;
    }
}

// Create global instance
window.apiConfig = new APIConfig();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIConfig;
}
