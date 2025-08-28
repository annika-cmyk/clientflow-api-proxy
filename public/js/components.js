// Component loader for ClientFlow
class ComponentLoader {
    constructor() {
        this.components = {};
        this.baseUrl = 'http://localhost:3001';
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
            // Check if user is logged in
            const token = localStorage.getItem('authToken');
            if (!token) {
                userNameElement.textContent = 'Ej inloggad';
                userRoleElement.textContent = '';
                return;
            }

            // Get user info from server
            const response = await fetch(`${this.baseUrl}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

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

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentLoader;
}
