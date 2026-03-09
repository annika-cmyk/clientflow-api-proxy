// Component loader for ClientFlow
class ComponentLoader {
    constructor() {
        this.components = {};
        this.baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'https://clientflow-api-proxy-1.onrender.com';
        this.loadedComponents = new Set(); // Track which components are already loaded
    }

    // Load a component from a file
    async loadComponent(componentName, targetElement) {
        try {
            // Check if component is already loaded in this element
            if (this.loadedComponents.has(`${componentName}-${targetElement.id || targetElement.className}`)) {
                // Component already loaded, just update active state for sidebar
                if (componentName === 'sidebar') {
                    this.updateActivePage(targetElement);
                }
                return true;
            }

            const response = await fetch(`Components/${componentName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load component: ${componentName}`);
            }
            
            const html = await response.text();
            targetElement.innerHTML = html;
            
            // Store the component for potential reuse
            this.components[componentName] = html;
            
            // Mark this component as loaded for this element
            this.loadedComponents.add(`${componentName}-${targetElement.id || targetElement.className}`);
            
            // Initialize component-specific functionality
            this.initializeComponent(componentName, targetElement);
            
            return true;
        } catch (error) {
            console.error(`Error loading component ${componentName}:`, error);
            return false;
        }
    }

    // Initialize component-specific functionality
    initializeComponent(componentName, element) {
        switch (componentName) {
            case 'sidebar':
                this.initializeSidebar(element);
                break;
            case 'footer':
                this.initializeFooter(element);
                break;
            default:
                break;
        }
    }

    // Initialize sidebar functionality
    initializeSidebar(element) {
        // Set active page based on current URL
        this.updateActivePage(element);

        // Initialize user info if auth is available
        this.updateUserInfo(element);

        // Fäll in/ut-menyn: återställ sparad state och koppla toggle-knapp
        const sidebar = element.querySelector('.sidebar');
        const toggleBtn = element.querySelector('#sidebar-toggle');
        if (sidebar && toggleBtn) {
            try {
                const saved = sessionStorage.getItem('clientflow-sidebar-collapsed');
                if (saved === '1') document.body.classList.add('sidebar-collapsed');
            } catch (e) { /* ignore */ }
            toggleBtn.addEventListener('click', () => {
                document.body.classList.toggle('sidebar-collapsed');
                try {
                    sessionStorage.setItem('clientflow-sidebar-collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
                } catch (e) { /* ignore */ }
            });
        }

        // Fäll in/ut menyposter under rubriker
        const storageKey = 'clientflow-nav-sections-collapsed';
        element.querySelectorAll('.nav-section').forEach(section => {
            const header = section.querySelector('.nav-section-header');
            const sectionId = section.getAttribute('data-section');
            if (!header || !sectionId) return;
            try {
                const saved = sessionStorage.getItem(storageKey);
                const collapsed = saved ? JSON.parse(saved) : {};
                if (collapsed[sectionId]) {
                    section.classList.add('nav-section-collapsed');
                    header.setAttribute('aria-expanded', 'false');
                }
            } catch (e) { /* ignore */ }
            header.addEventListener('click', () => {
                section.classList.toggle('nav-section-collapsed');
                const isCollapsed = section.classList.contains('nav-section-collapsed');
                header.setAttribute('aria-expanded', !isCollapsed);
                try {
                    const saved = sessionStorage.getItem(storageKey);
                    const collapsed = saved ? JSON.parse(saved) : {};
                    collapsed[sectionId] = isCollapsed;
                    sessionStorage.setItem(storageKey, JSON.stringify(collapsed));
                } catch (e) { /* ignore */ }
            });
        });
    }

    // Update active page without reloading the entire sidebar
    updateActivePage(element) {
        const currentPage = this.getCurrentPage();
        const activeLink = element.querySelector(`[data-page="${currentPage}"]`);
        
        if (activeLink) {
            // Remove any existing active classes
            element.querySelectorAll('.active').forEach(item => {
                item.classList.remove('active');
            });
            
            // Add active class to current page
            activeLink.classList.add('active');

            // Öppna den sektion som innehåller aktuell sida
            const section = activeLink.closest('.nav-section');
            if (section) {
                section.classList.remove('nav-section-collapsed');
                const header = section.querySelector('.nav-section-header');
                if (header) header.setAttribute('aria-expanded', 'true');
            }
        }
    }

    // Initialize footer functionality
    initializeFooter(element) {
        // Add current year to copyright
        const yearElement = element.querySelector('.current-year');
        if (yearElement) {
            yearElement.textContent = new Date().getFullYear();
        }
    }

    // Get current page name from URL
    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop();
        
        if (filename === '' || filename === 'index.html') {
            return 'index';
        }
        
        return filename.replace('.html', '');
    }

    // Update user information in sidebar
    async updateUserInfo(element) {
        const userNameElement = element.querySelector('.user-name');
        const userRoleElement = element.querySelector('.user-role');
        const companyLogoElement = element.querySelector('#company-logo');
        const defaultAvatarElement = element.querySelector('#default-avatar');
        
        console.log('Found elements:', {
            userNameElement: !!userNameElement,
            userRoleElement: !!userRoleElement,
            companyLogoElement: !!companyLogoElement,
            defaultAvatarElement: !!defaultAvatarElement
        });
        
        if (!userNameElement || !userRoleElement) {
            console.log('Missing required elements');
            return;
        }

        try {
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            const response = await fetch(`${this.baseUrl}/api/auth/me`, opts);
            if (!response.ok) {
                userNameElement.textContent = 'Ej inloggad';
                userRoleElement.textContent = '';
                return;
            }

            if (response.ok) {
                const userData = await response.json();
                console.log('User data received:', userData);
                console.log('Logo data:', userData.user.logo);
                userNameElement.textContent = userData.user.name || 'Användare';
                userRoleElement.textContent = userData.user.byra || 'Användare';
                
                // Handle company logo
                if (userData.user.logo && userData.user.logo.length > 0) {
                    console.log('Logo URL:', userData.user.logo[0].url);
                    // If logo exists, show it
                    if (companyLogoElement) {
                        companyLogoElement.src = userData.user.logo[0].url;
                        companyLogoElement.style.display = 'block';
                        console.log('Setting logo src to:', userData.user.logo[0].url);
                        console.log('Logo element display style:', companyLogoElement.style.display);
                    } else {
                        console.log('Company logo element not found!');
                    }
                    if (defaultAvatarElement) {
                        defaultAvatarElement.style.display = 'none';
                        console.log('Hiding default avatar');
                    } else {
                        console.log('Default avatar element not found!');
                    }
                } else {
                    console.log('No logo found, showing default avatar');
                    // If no logo, show default avatar
                    if (companyLogoElement) {
                        companyLogoElement.style.display = 'none';
                    }
                    if (defaultAvatarElement) {
                        defaultAvatarElement.style.display = 'block';
                    }
                }
            } else {
                userNameElement.textContent = 'Laddar...';
                userRoleElement.textContent = 'Laddar...';
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            userNameElement.textContent = 'Laddar...';
            userRoleElement.textContent = 'Laddar...';
        }
    }
}

// Global component loader instance
window.componentLoader = new ComponentLoader();

// Auto-load components when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Load sidebar if sidebar-container exists
    const sidebarContainer = document.querySelector('.sidebar-container');
    if (sidebarContainer) {
        componentLoader.loadComponent('sidebar', sidebarContainer);
        if (!document.querySelector('script[src*="ai-chat.js"]')) {
            const s = document.createElement('script');
            s.src = 'js/ai-chat.js';
            s.async = false;
            document.body.appendChild(s);
        }
    }

    // Load footer if footer-container exists
    const footerContainer = document.querySelector('.footer-container');
    if (footerContainer) {
        componentLoader.loadComponent('footer', footerContainer);
    }
});

// Listen for navigation events to update active page
window.addEventListener('popstate', function() {
    const sidebarContainer = document.querySelector('.sidebar-container');
    if (sidebarContainer) {
        componentLoader.updateActivePage(sidebarContainer);
    }
});

// AI "tänker"-indikator – visas på alla AI-hjälp-ställen
window.showAiThinking = function () {
    var el = document.getElementById('ai-thinking-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'ai-thinking-overlay';
        el.className = 'ai-thinking-overlay';
        el.innerHTML = '<i class="fas fa-robot"></i> <i class="fas fa-spinner fa-spin"></i> AI tänker...';
        document.body.appendChild(el);
    }
    el.style.display = 'flex';
};

window.hideAiThinking = function () {
    var el = document.getElementById('ai-thinking-overlay');
    if (el) el.style.display = 'none';
};

// Exportera Länsstyrelsen-PDF (anropas från menyn) – laddar ner och sparar kopia till Dokumentation
window.exportLansstyrelsenPdf = async function () {
    const MAX_SAVED = 10;
    const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    const baseUrl = window.apiConfig ? window.apiConfig.baseUrl : 'https://clientflow-api-proxy-1.onrender.com';
    const navItem = document.getElementById('nav-exportera-lansstyrelsen-pdf');
    const link = navItem ? navItem.querySelector('a') : null;
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
        alert('Du måste logga in för att exportera.');
        return;
    }
    const origHtml = link ? link.innerHTML : '';
    if (link) {
        link.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Genererar PDF...';
        link.style.pointerEvents = 'none';
    }
    try {
        const res = await fetch(baseUrl + '/api/byra/lansstyrelsen-pdf', {
            method: 'POST',
            ...opts
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || 'Kunde inte generera PDF');
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]+)/);
        const apiFilename = m ? decodeURIComponent(m[1].trim()) : 'Lansstyrelsen-' + new Date().getFullYear() + '.pdf';
        const displayFilename = 'Byråns allmänna riskbedömning samt rutiner ' + new Date().toLocaleDateString('sv-SE') + '.pdf';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = apiFilename;
        a.click();
        URL.revokeObjectURL(a.href);
        const reader = new FileReader();
        reader.onload = async function () {
            const base64 = reader.result.split(',')[1];
            if (!base64) return;
            const opts = (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
            try {
                const getRes = await fetch(baseUrl + '/api/settings/dokumentation-pdfs', opts);
                let list = [];
                if (getRes.ok) { const data = await getRes.json(); list = Array.isArray(data.list) ? data.list : []; }
                list.unshift({ date: new Date().toLocaleDateString('sv-SE'), filename: displayFilename, base64: base64 });
                list = list.slice(0, MAX_SAVED);
                await fetch(baseUrl + '/api/settings/dokumentation-pdfs', { method: 'PUT', ...opts, body: JSON.stringify({ list }) });
            } catch (_) {}
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        console.error('Länsstyrelsen PDF:', err);
        alert('Kunde inte generera PDF: ' + (err.message || 'Okänt fel'));
    } finally {
        if (link) {
            link.innerHTML = origHtml;
            link.style.pointerEvents = '';
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentLoader;
}
