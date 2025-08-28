// Byrå Användare Management System
class ByraAnvandareManager {
    constructor() {
        console.log('ByraAnvandareManager initialized');
        this.users = [];
        this.logs = [];
        this.filteredUsers = [];
        this.filteredLogs = [];
        this.currentTab = 'byra'; // Default to byrå tab
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadUsers();
        this.loadLogs();
        this.initializeTabs(); // Initialize tab display
    }

    setupEventListeners() {
        // Tab switching
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = button.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // User filters
        const userFilter = document.getElementById('user-filter');
        if (userFilter) {
            userFilter.addEventListener('change', () => this.applyUserFilters());
        }

        const roleFilter = document.getElementById('role-filter');
        if (roleFilter) {
            roleFilter.addEventListener('change', () => this.applyUserFilters());
        }

        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.applyUserFilters());
        }

        // Log filters
        const logUserFilter = document.getElementById('log-user-filter');
        if (logUserFilter) {
            logUserFilter.addEventListener('change', () => this.applyLogFilters());
        }

        const logActivityFilter = document.getElementById('log-activity-filter');
        if (logActivityFilter) {
            logActivityFilter.addEventListener('change', () => this.applyLogFilters());
        }

        const logDateFrom = document.getElementById('log-date-from');
        if (logDateFrom) {
            logDateFrom.addEventListener('change', () => this.applyLogFilters());
        }

        const logDateTo = document.getElementById('log-date-to');
        if (logDateTo) {
            logDateTo.addEventListener('change', () => this.applyLogFilters());
        }

        // Clear filters buttons
        const clearUserFiltersBtn = document.getElementById('clear-user-filters');
        if (clearUserFiltersBtn) {
            clearUserFiltersBtn.addEventListener('click', () => this.clearUserFilters());
        }

        const clearLogFiltersBtn = document.getElementById('clear-log-filters');
        if (clearLogFiltersBtn) {
            clearLogFiltersBtn.addEventListener('click', () => this.clearLogFilters());
        }
    }

    switchTab(tabName) {
        // Hide all tab contents
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            content.style.display = 'none';
        });

        // Remove active class from all tab buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        // Show selected tab content
        const selectedTab = document.getElementById(tabName);
        if (selectedTab) {
            selectedTab.style.display = 'block';
        }

        // Add active class to selected tab button
        const selectedButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedButton) {
            selectedButton.classList.add('active');
        }

        this.currentTab = tabName;
    }

    initializeTabs() {
        // Hide all tab contents first
        const tabContents = document.querySelectorAll('.tab-content');
        tabContents.forEach(content => {
            content.style.display = 'none';
        });

        // Remove active class from all tab buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.classList.remove('active');
        });

        // Show the default tab (byrå)
        const defaultTab = document.getElementById('byra');
        if (defaultTab) {
            defaultTab.style.display = 'block';
        }

        // Add active class to default tab button
        const defaultButton = document.querySelector('[data-tab="byra"]');
        if (defaultButton) {
            defaultButton.classList.add('active');
        }
    }

    async loadUsers() {
        try {
            // Simulera laddning av användare från API
            this.users = [
                {
                    id: 1,
                    name: 'Annika Rydén',
                    email: 'annika@rydenred.se',
                    role: 'Administratör',
                    status: 'Aktiv',
                    lastLogin: '2025-01-15 14:30',
                    byra: 'Huvudkontor'
                },
                {
                    id: 2,
                    name: 'Maria Rydén',
                    email: 'maria@rydenred.se',
                    role: 'Ledare',
                    status: 'Aktiv',
                    lastLogin: '2025-01-15 14:40',
                    byra: 'Stockholm'
                },
                {
                    id: 3,
                    name: 'Erik Andersson',
                    email: 'erik@rydenred.se',
                    role: 'Anställd',
                    status: 'Inaktiv',
                    lastLogin: '2025-01-10 09:15',
                    byra: 'Göteborg'
                }
            ];

            this.filteredUsers = [...this.users];
            this.renderUsers();
            this.populateUserFilters();
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    async loadLogs() {
        try {
            // Simulera laddning av aktivitetsloggar från API
            this.logs = [
                {
                    id: 1,
                    time: '2025-01-15 14:30:25',
                    user: 'Annika Rydén',
                    action: 'Inloggning',
                    details: 'Framgångsrik inloggning från 192.168.1.100'
                },
                {
                    id: 2,
                    time: '2025-01-15 14:32:18',
                    user: 'Annika Rydén',
                    action: 'Kundhantering',
                    details: 'Uppdaterade kund: Testbolaget Aktiebolag'
                },
                {
                    id: 3,
                    time: '2025-01-15 14:35:42',
                    user: 'Annika Rydén',
                    action: 'Riskbedömning',
                    details: 'Skapade ny riskbedömning för kund ID: 5567223705'
                },
                {
                    id: 4,
                    time: '2025-01-15 14:40:15',
                    user: 'Maria Rydén',
                    action: 'Inloggning',
                    details: 'Framgångsrik inloggning från 192.168.1.101'
                },
                {
                    id: 5,
                    time: '2025-01-15 14:45:33',
                    user: 'Maria Rydén',
                    action: 'Rapport',
                    details: 'Exporterade riskstatistik till Excel'
                }
            ];

            this.filteredLogs = [...this.logs];
            this.renderLogs();
            this.populateLogFilters();
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }

    populateUserFilters() {
        console.log('Populating user filters with users:', this.users);
        
        // Populate user filter
        const userFilter = document.getElementById('user-filter');
        if (userFilter) {
            const uniqueUsers = [...new Set(this.users.map(user => user.name))];
            userFilter.innerHTML = '<option value="">Alla användare</option>';
            uniqueUsers.forEach(user => {
                userFilter.innerHTML += `<option value="${user}">${user}</option>`;
            });
            console.log('User filter populated with:', uniqueUsers);
        }

        // Populate role filter
        const roleFilter = document.getElementById('role-filter');
        if (roleFilter) {
            const uniqueRoles = [...new Set(this.users.map(user => user.role))];
            roleFilter.innerHTML = '<option value="">Alla roller</option>';
            uniqueRoles.forEach(role => {
                roleFilter.innerHTML += `<option value="${role}">${role}</option>`;
            });
            console.log('Role filter populated with:', uniqueRoles);
        }

        // Populate status filter
        const statusFilter = document.getElementById('status-filter');
        if (statusFilter) {
            const uniqueStatuses = [...new Set(this.users.map(user => user.status))];
            statusFilter.innerHTML = '<option value="">Alla statusar</option>';
            uniqueStatuses.forEach(status => {
                statusFilter.innerHTML += `<option value="${status}">${status}</option>`;
            });
        }
    }

    populateLogFilters() {
        // Populate log user filter
        const logUserFilter = document.getElementById('log-user-filter');
        if (logUserFilter) {
            const uniqueUsers = [...new Set(this.logs.map(log => log.user))];
            logUserFilter.innerHTML = '<option value="">Alla användare</option>';
            uniqueUsers.forEach(user => {
                logUserFilter.innerHTML += `<option value="${user}">${user}</option>`;
            });
        }

        // Populate log activity filter
        const logActivityFilter = document.getElementById('log-activity-filter');
        if (logActivityFilter) {
            const uniqueActivities = [...new Set(this.logs.map(log => log.action))];
            logActivityFilter.innerHTML = '<option value="">Alla aktiviteter</option>';
            uniqueActivities.forEach(activity => {
                logActivityFilter.innerHTML += `<option value="${activity}">${activity}</option>`;
            });
        }
    }

    applyUserFilters() {
        const userFilter = document.getElementById('user-filter')?.value || '';
        const roleFilter = document.getElementById('role-filter')?.value || '';
        const statusFilter = document.getElementById('status-filter')?.value || '';

        this.filteredUsers = this.users.filter(user => {
            if (userFilter && user.name !== userFilter) return false;
            if (roleFilter && user.role !== roleFilter) return false;
            if (statusFilter && user.status !== statusFilter) return false;
            return true;
        });

        this.renderUsers();
    }

    applyLogFilters() {
        const userFilter = document.getElementById('log-user-filter')?.value || '';
        const activityFilter = document.getElementById('log-activity-filter')?.value || '';
        const dateFrom = document.getElementById('log-date-from')?.value || '';
        const dateTo = document.getElementById('log-date-to')?.value || '';

        this.filteredLogs = this.logs.filter(log => {
            if (userFilter && log.user !== userFilter) return false;
            if (activityFilter && log.action !== activityFilter) return false;
            
            if (dateFrom || dateTo) {
                const logDate = new Date(log.time);
                if (dateFrom && logDate < new Date(dateFrom)) return false;
                if (dateTo && logDate > new Date(dateTo + ' 23:59:59')) return false;
            }
            
            return true;
        });

        this.renderLogs();
    }

    clearUserFilters() {
        const userFilter = document.getElementById('user-filter');
        const roleFilter = document.getElementById('role-filter');
        const statusFilter = document.getElementById('status-filter');

        if (userFilter) userFilter.value = '';
        if (roleFilter) roleFilter.value = '';
        if (statusFilter) statusFilter.value = '';

        this.filteredUsers = [...this.users];
        this.renderUsers();
    }

    clearLogFilters() {
        const logUserFilter = document.getElementById('log-user-filter');
        const logActivityFilter = document.getElementById('log-activity-filter');
        const logDateFrom = document.getElementById('log-date-from');
        const logDateTo = document.getElementById('log-date-to');

        if (logUserFilter) logUserFilter.value = '';
        if (logActivityFilter) logActivityFilter.value = '';
        if (logDateFrom) logDateFrom.value = '';
        if (logDateTo) logDateTo.value = '';

        this.filteredLogs = [...this.logs];
        this.renderLogs();
    }

    renderUsers() {
        const usersList = document.querySelector('.users-list');
        if (!usersList) return;

        // Show loading state if users are still loading
        if (this.users.length === 0) {
            usersList.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Laddar användare...</p>
                </div>`;
            return;
        }

        if (this.filteredUsers.length === 0) {
            usersList.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>Inga användare hittades med valda filter.</p>
                </div>`;
            return;
        }

        usersList.innerHTML = this.filteredUsers.map(user => `
            <div class="user-item">
                <div class="user-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="user-details">
                    <h4>${user.name}</h4>
                    <p>${user.email}</p>
                    <span class="user-role ${user.role.toLowerCase().replace(' ', '-')}">${user.role}</span>
                </div>
                <div class="user-status">
                    <span class="status ${user.status.toLowerCase()}">${user.status}</span>
                    <span class="last-login">Senast inloggad: ${user.lastLogin}</span>
                </div>
                <div class="user-actions">
                    <button class="btn-secondary">Redigera</button>
                    <button class="btn-secondary">Återställ lösenord</button>
                    <button class="btn-danger">Inaktivera</button>
                </div>
            </div>
        `).join('');
    }

    renderLogs() {
        const logsList = document.querySelector('.logs-list');
        if (!logsList) return;

        // Show loading state if logs are still loading
        if (this.logs.length === 0) {
            logsList.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Laddar aktivitetsloggar...</p>
                </div>`;
            return;
        }

        if (this.filteredLogs.length === 0) {
            logsList.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-clipboard-list"></i>
                    <p>Inga aktivitetsloggar hittades med valda filter.</p>
                </div>`;
            return;
        }

        logsList.innerHTML = this.filteredLogs.map(log => `
            <div class="log-item">
                <div class="log-time">${log.time}</div>
                <div class="log-user">${log.user}</div>
                <div class="log-action">${log.action}</div>
                <div class="log-details">${log.details}</div>
            </div>
        `).join('');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    new ByraAnvandareManager();
});
