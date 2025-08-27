// Navigation Module - DRY approach for sidebar navigation
class NavigationManager {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.init();
    }

    init() {
        // Skip loading sidebar since content is already embedded
        this.setupNavigationEvents();
        this.setActivePage();
    }

    getCurrentPage() {
        // Extract current page from URL or filename
        const path = window.location.pathname;
        const filename = path.split('/').pop();
        
        if (filename === '' || filename === 'index.html') {
            return 'index';
        }
        
        return filename.replace('.html', '');
    }

    setupNavigationEvents() {
        console.log('🔗 Setting up navigation events...');
        
        // Setup sidebar navigation events
        const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                console.log('🔗 Sidebar link clicked:', link.href);
                // Let the browser handle the navigation naturally
            });
        });

        // Setup header navigation events
        const headerLinks = document.querySelectorAll('.nav-links a');
        headerLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                console.log('🔗 Header link clicked:', link.href);
                // Let the browser handle the navigation naturally
            });
        });

        // Setup submenu toggles
        const navSections = document.querySelectorAll('.nav-section');
        navSections.forEach(section => {
            const trigger = section.querySelector('.nav-item');
            const submenu = section.querySelector('.nav-submenu');
            
            if (trigger && submenu) {
                trigger.addEventListener('click', (e) => {
                    e.preventDefault();
                    submenu.classList.toggle('active');
                });
            }
        });

        console.log('✅ Navigation events bound successfully');
    }

    setActivePage() {
        console.log('📍 Setting active page:', this.currentPage);
        
        // Remove all active classes
        const allNavItems = document.querySelectorAll('.nav-item, .sidebar-nav li');
        allNavItems.forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to current page
        const currentNavItem = document.querySelector(`[data-page="${this.currentPage}"]`);
        if (currentNavItem) {
            currentNavItem.classList.add('active');
            console.log('✅ Active page set:', this.currentPage);
        } else {
            console.log('⚠️ No nav item found for page:', this.currentPage);
        }
    }
}

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Initializing NavigationManager...');
    window.navigationManager = new NavigationManager();
});
