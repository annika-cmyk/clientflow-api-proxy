class AuthManager {
    constructor() {
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'https://clientflow-api-proxy-1.onrender.com';
        this.currentUser = null;
        this.init();
    }

    init() {
        this.checkAuthStatus();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Logout button event listener
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => this.handleLogout(e));
        }
    }

    async handleLogin(event) {
        event.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const loginBtn = document.getElementById('login-btn');
        const loginText = document.getElementById('login-text');
        const loading = document.getElementById('loading');

        // Show loading state
        loginBtn.disabled = true;
        loginText.style.display = 'none';
        loading.classList.add('show');
        this.hideMessages();

        console.log('🔐 Attempting login with:', { email, baseUrl: this.baseUrl });

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Token sätts i httpOnly-cookie av servern – inget sparas i localStorage
                this.currentUser = data.user;
                if (typeof window !== 'undefined') window.__clientFlowUser = data.user;

                console.log('🔐 Login successful, user data stored');
                this.showSuccess('Inloggning lyckades! Omdirigerar...');
                
                // Redirect to main page after short delay
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                console.log('🔐 Login failed:', data.message);
                this.showError(data.message || 'Inloggning misslyckades');
            }
        } catch (error) {
            console.error('🔐 Login error:', error);
            console.error('🔐 Error details:', {
                message: error.message,
                stack: error.stack,
                baseUrl: this.baseUrl
            });
            
            let errorMessage = 'Ett fel uppstod vid inloggning.';
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Kunde inte ansluta till servern. Kontrollera din internetanslutning.';
            } else if (error.name === 'TypeError' && error.message.includes('JSON')) {
                errorMessage = 'Ogiltigt svar från servern.';
            }
            
            this.showError(errorMessage);
        } finally {
            // Reset loading state
            loginBtn.disabled = false;
            loginText.style.display = 'inline';
            loading.classList.remove('show');
        }
    }

    async handleLogout(event) {
        event.preventDefault();
        try {
            await fetch(`${this.baseUrl}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.currentUser = null;
            if (typeof window !== 'undefined') window.__clientFlowUser = null;
            window.location.href = 'login.html';
        }
    }

    async checkAuthStatus() {
        const isLoginPage = window.location.pathname === '/login.html' || window.location.pathname.endsWith('login.html');
        if (isLoginPage) return;

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/me`, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user || data;
                if (typeof window !== 'undefined') {
                    window.__clientFlowUser = this.currentUser;
                    window.dispatchEvent(new CustomEvent('clientflow:authReady', { detail: { user: this.currentUser } }));
                }
                this.updateUI();
            } else {
                this.currentUser = null;
                window.__clientFlowUser = null;
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.currentUser = null;
            window.__clientFlowUser = null;
            window.location.href = 'login.html';
        }
    }

    updateUI() {
        // Update user info in sidebar if it exists
        const userInfoElement = document.querySelector('.user-info');
        if (userInfoElement && this.currentUser) {
            userInfoElement.innerHTML = `
                <div class="user-details">
                    <span class="user-name">${this.currentUser.name}</span>
                    <span class="user-role">${this.currentUser.role}</span>
                </div>
            `;
        }

        // Show logout button if it exists
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.style.display = 'block';
        }
    }

    showError(message) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    showSuccess(message) {
        const successElement = document.getElementById('success-message');
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
        }
    }

    hideMessages() {
        const errorElement = document.getElementById('error-message');
        const successElement = document.getElementById('success-message');
        
        if (errorElement) errorElement.style.display = 'none';
        if (successElement) successElement.style.display = 'none';
    }

    static isAuthenticated() {
        const auth = window.authManager;
        return !!(auth && auth.currentUser);
    }

    static getCurrentUser() {
        const auth = window.authManager;
        if (auth && auth.currentUser) return auth.currentUser;
        return (typeof window !== 'undefined' && window.__clientFlowUser) || null;
    }

    /** Använd för alla API-anrop – auth sker via cookie (credentials: 'include'). Returnerar inte token. */
    static getAuthFetchOptions(customHeaders = {}) {
        return {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', ...customHeaders }
        };
    }
}

// Initialize auth manager
const authManager = new AuthManager();

// Global function for forgot password
function showForgotPassword() {
    alert('Kontakta systemadministratören för att återställa ditt lösenord.');
}

// Export for use in other files
window.AuthManager = AuthManager;
window.authManager = authManager;

window.testLogout = function() {
    if (window.authManager) {
        window.authManager.handleLogout(new Event('click'));
    } else {
        window.location.href = 'login.html';
    }
};
