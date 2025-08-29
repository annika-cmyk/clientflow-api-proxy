// ========================================
// API Configuration - Auto-detects environment
// ========================================

class APIConfig {
    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.apiUrl = `${this.baseUrl}/api`;
    }

    getBaseUrl() {
        // Check if we're running on app subdomain (prioritize this)
        if (window.location.hostname === 'app.clientflow.se' || window.location.hostname === 'www.app.clientflow.se') {
            console.log(`🔧 Detected ${window.location.hostname} domain, using Render API`);
            return 'https://clientflow-api-proxy.onrender.com';
        }
        
        // Check if we're running on Render
        if (window.location.hostname.includes('onrender.com')) {
            console.log('🔧 Detected Render domain, using Render API');
            return 'https://clientflow-api-proxy.onrender.com';
        }
        
        // Check if we're running locally
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('🔧 Detected localhost, using local API');
            return 'http://localhost:3001';
        }
        
        // Default fallback
        console.log('🔧 Using default API URL');
        return 'https://clientflow-api-proxy.onrender.com';
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
