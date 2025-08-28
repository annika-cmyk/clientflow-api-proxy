// ========================================
// API Configuration - Auto-detects environment
// ========================================

class APIConfig {
    constructor() {
        this.baseUrl = this.getBaseUrl();
        this.apiUrl = `${this.baseUrl}/api`;
    }

    getBaseUrl() {
        // Check if we're running on Render
        if (window.location.hostname.includes('onrender.com')) {
            return 'https://clientflow-api-proxy-1.onrender.com';
        }
        
        // Check if we're running locally
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
        
        // Default fallback
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
