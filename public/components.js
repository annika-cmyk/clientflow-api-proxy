/**
 * Component Loader - Laddar header och footer dynamiskt
 */
class ComponentLoader {
    constructor() {
        this.init();
    }

    async init() {
        await this.loadHeader();
        await this.loadFooter();
    }

    async loadHeader() {
        try {
            const response = await fetch('/header.html');
            const headerHtml = await response.text();
            
            // Hitta header placeholder eller skapa en
            let headerContainer = document.querySelector('[data-component="header"]');
            if (!headerContainer) {
                headerContainer = document.createElement('div');
                headerContainer.setAttribute('data-component', 'header');
                document.body.insertBefore(headerContainer, document.body.firstChild);
            }
            
            headerContainer.innerHTML = headerHtml;
            console.log('✅ Header loaded successfully');
        } catch (error) {
            console.error('❌ Error loading header:', error);
        }
    }

    async loadFooter() {
        try {
            const response = await fetch('/footer.html');
            const footerHtml = await response.text();
            
            // Hitta footer placeholder eller lägg till i slutet
            let footerContainer = document.querySelector('[data-component="footer"]');
            if (!footerContainer) {
                footerContainer = document.createElement('div');
                footerContainer.setAttribute('data-component', 'footer');
                document.body.appendChild(footerContainer);
            }
            
            footerContainer.innerHTML = footerHtml;
            console.log('✅ Footer loaded successfully');
        } catch (error) {
            console.error('❌ Error loading footer:', error);
        }
    }

    // Funktion för att ladda komponenter på specifika sidor
    async loadComponent(componentName, targetSelector) {
        try {
            const response = await fetch(`/${componentName}.html`);
            const componentHtml = await response.text();
            
            const target = document.querySelector(targetSelector);
            if (target) {
                target.innerHTML = componentHtml;
                console.log(`✅ ${componentName} loaded successfully`);
            } else {
                console.error(`❌ Target selector "${targetSelector}" not found`);
            }
        } catch (error) {
            console.error(`❌ Error loading ${componentName}:`, error);
        }
    }
}

// Global funktioner för att ladda komponenter
function loadHeader(targetSelector = '[data-component="header"]') {
    const loader = new ComponentLoader();
    loader.loadComponent('header', targetSelector);
}

function loadFooter(targetSelector = '[data-component="footer"]') {
    const loader = new ComponentLoader();
    loader.loadComponent('footer', targetSelector);
}

// Auto-initialisera när DOM är redo
document.addEventListener('DOMContentLoaded', () => {
    new ComponentLoader();
});

// Export för användning i andra filer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentLoader;
}
