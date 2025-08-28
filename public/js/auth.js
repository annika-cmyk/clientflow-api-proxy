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

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store user data and token
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userData', JSON.stringify(data.user));
                this.currentUser = data.user;

                this.showSuccess('Inloggning lyckades! Omdirigerar...');
                
                // Redirect to main page after short delay
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                this.showError(data.message || 'Inloggning misslyckades');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Ett fel uppstod vid inloggning. Kontrollera din internetanslutning.');
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
            const token = localStorage.getItem('authToken');
            if (token) {
                await fetch(`${this.baseUrl}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage and redirect
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            this.currentUser = null;
            window.location.href = 'login.html';
        }
    }

    async checkAuthStatus() {
        const token = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');

        if (!token || !userData) {
            // Not logged in, redirect to login if not already there
            if (window.location.pathname !== '/login.html' && !window.location.pathname.includes('login.html')) {
                window.location.href = 'login.html';
            }
            return;
        }

        try {
            // Verify token with server
            const response = await fetch(`${this.baseUrl}/api/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                }
            });

            if (response.ok) {
                this.currentUser = JSON.parse(userData);
                this.updateUI();
            } else {
                // Token invalid, clear storage and redirect to login
                localStorage.removeItem('authToken');
                localStorage.removeItem('userData');
                this.currentUser = null;
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error('Auth check error:', error);
            // On error, assume not authenticated
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            this.currentUser = null;
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

    // Static method to check if user is authenticated
    static isAuthenticated() {
        return !!localStorage.getItem('authToken');
    }

    // Static method to get current user
    static getCurrentUser() {
        const userData = localStorage.getItem('userData');
        return userData ? JSON.parse(userData) : null;
    }

    // Static method to get auth token
    static getAuthToken() {
        return localStorage.getItem('authToken');
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

// Logout function for sidebar button
window.testLogout = function() {
    console.log('🔍 Logout button clicked!');
    
    // Call authManager logout if it exists
    if (window.authManager) {
        console.log('🔍 AuthManager found, calling handleLogout...');
        window.authManager.handleLogout(new Event('click'));
    } else {
        console.log('❌ AuthManager not found');
        // Fallback: clear storage and redirect
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        window.location.href = 'login.html';
    }
};
