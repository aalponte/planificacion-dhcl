/**
 * Gestor de Planificación - LLYC
 * Secure Version
 */

// Toast notification system
function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info} toast-icon"></i>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

const app = {
    state: {
        currentView: 'dashboard',
        currentConfigTab: 'colaboradores',
        currentYear: new Date().getFullYear(),
        currentWeek: 1,
        colaboradores: [],
        clientes: [],
        proyectos: [],
        tipos: [],
        areas: [],
        regiones: [],
        paises: [],
        usuarios: [],
        currentAllocations: [],
        editingRecord: null,
        importingTable: null,
        currentUser: null, // Stores logged-in user info
        selectedAreaId: null, // Currently selected area for filtering
        selectedRegionId: null,
        selectedPaisId: null
    },

    // XSS Protection - Escape HTML entities
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Check authentication status on page load
    async checkAuth() {
        try {
            const response = await fetch('/api/auth/check', {
                credentials: 'include'
            });
            const data = await response.json();

            if (data.authenticated && data.user) {
                this.state.currentUser = data.user;
                return true;
            }
            return false;
        } catch (error) {
            console.error('[App] Auth check error:', error);
            return false;
        }
    },

    async init() {
        console.log('[App] Initializing...');

        // Check if user has an active session
        const isAuthenticated = await this.checkAuth();

        if (isAuthenticated) {
            // User has valid session, show app
            const loginPage = document.getElementById('login-page');
            const appContainer = document.getElementById('app-container');

            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');

            this.applyRoleRestrictions();

            const navbarUser = document.querySelector('.navbar-user span');
            if (navbarUser) {
                navbarUser.textContent = this.escapeHtml(this.state.currentUser.name || this.state.currentUser.username);
            }

            this.calculateCurrentWeek();
            this.populateYearSelector();
            await this.loadInitialData();
            await this.populateWeekDropdown();

            if (this.state.currentUser.role === 'visualizador') {
                this.navigateTo('viewer');
            } else {
                this.navigateTo('dashboard');
            }
        } else {
            // No valid session, prepare login form
            this.calculateCurrentWeek();
            this.populateYearSelector();
        }

        console.log('[App] Initialized successfully');
    },

    calculateCurrentWeek() {
        const date = new Date();
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
        this.state.currentWeek = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);
        if (this.state.currentWeek > 52) this.state.currentWeek = 1;
    },

    populateYearSelector() {
        const select = document.getElementById('plan-year');
        if (!select) return;
        const currentYear = new Date().getFullYear();
        select.innerHTML = `
            <option value="${currentYear - 1}">${currentYear - 1}</option>
            <option value="${currentYear}" selected>${currentYear}</option>
            <option value="${currentYear + 1}">${currentYear + 1}</option>
        `;
    },

    async populateWeekDropdown() {
        const select = document.getElementById('plan-week');
        if (!select) return;
        try {
            const year = parseInt(document.getElementById('plan-year')?.value || this.state.currentYear);
            const response = await fetch(`/api/allocations/weeks?year=${year}`, {
                credentials: 'include'
            });
            const weeks = await response.json();
            const currentValue = select.value;
            select.innerHTML = '';
            if (weeks.length === 0) {
                for (let i = 1; i <= 52; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `Semana ${i}`;
                    select.appendChild(option);
                }
            } else {
                weeks.forEach(w => {
                    const option = document.createElement('option');
                    option.value = w.week_number;
                    option.textContent = `Semana ${w.week_number}`;
                    select.appendChild(option);
                });
            }
            if (currentValue) select.value = currentValue;
        } catch (error) {
            console.error('[Planning] Error loading weeks:', error);
        }
    },

    async handleLogin() {
        console.log('[App] handleLogin called');
        const username = document.getElementById('login-username')?.value?.trim();
        const password = document.getElementById('login-password')?.value;

        if (!username || !password) {
            alert('Por favor ingrese usuario y contraseña');
            return;
        }

        // Basic input validation
        if (username.length > 50 || password.length > 100) {
            alert('Datos de entrada inválidos');
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Important for session cookies
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                alert(data.error || 'Credenciales inválidas');
                return;
            }

            // Store user info
            this.state.currentUser = data.user;
            console.log('[App] User logged in:', data.user);

            const loginPage = document.getElementById('login-page');
            const appContainer = document.getElementById('app-container');

            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');

            // Update UI based on role
            this.applyRoleRestrictions();

            // Load initial data after login
            await this.loadInitialData();
            await this.populateWeekDropdown();

            // Navigate to appropriate view based on role
            if (data.user.role === 'visualizador') {
                this.navigateTo('viewer');
            } else {
                this.navigateTo('dashboard');
            }

            // Update navbar user display (with XSS protection)
            const navbarUser = document.querySelector('.navbar-user span');
            if (navbarUser) {
                navbarUser.textContent = this.escapeHtml(data.user.name || data.user.username);
            }

        } catch (error) {
            console.error('[App] Login error:', error);
            alert('Error al iniciar sesión: ' + error.message);
        }
    },

    async logout() {
        console.log('[App] Logout called');
        try {
            // Call server logout endpoint to destroy session
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
            console.log('[App] Logout API called successfully');
        } catch (error) {
            console.error('[App] Logout error:', error);
        }

        // Clear user state
        this.state.currentUser = null;
        this.state.colaboradores = [];
        this.state.clientes = [];
        this.state.proyectos = [];
        this.state.tipos = [];
        this.state.usuarios = [];
        this.state.currentAllocations = [];

        // Hide app container, show login page
        const loginPage = document.getElementById('login-page');
        const appContainer = document.getElementById('app-container');

        appContainer.classList.add('hidden');
        loginPage.classList.remove('hidden');

        // Clear login form
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';

        // Reset navbar user display
        const navbarUsername = document.getElementById('navbar-username');
        if (navbarUsername) {
            navbarUsername.textContent = 'Usuario';
        }

        // Reset navigation to default
        this.state.currentView = 'dashboard';

        console.log('[App] User logged out');
    },

    applyRoleRestrictions() {
        const user = this.state.currentUser;
        if (!user) return;

        const navDashboard = document.getElementById('nav-dashboard');
        const navPlanning = document.getElementById('nav-planning');
        const navViewer = document.getElementById('nav-viewer');
        const navConfig = document.getElementById('nav-config');

        // Config tabs that should be hidden for area-restricted admins
        const tabUsuarios = document.getElementById('tab-usuarios');
        const tabProyectos = document.getElementById('tab-proyectos');
        const tabTipos = document.getElementById('tab-tipos');
        const tabAreas = document.getElementById('tab-areas');

        if (user.role === 'visualizador') {
            // Hide non-viewer sections
            if (navDashboard) navDashboard.style.display = 'none';
            if (navPlanning) navPlanning.style.display = 'none';
            if (navConfig) navConfig.style.display = 'none';
            if (navViewer) navViewer.style.display = 'inline-block';
        } else {
            // Show all sections for admin
            if (navDashboard) navDashboard.style.display = 'inline-block';
            if (navPlanning) navPlanning.style.display = 'inline-block';
            if (navViewer) navViewer.style.display = 'inline-block';
            if (navConfig) navConfig.style.display = 'inline-block';

            // If admin has area assigned, hide certain config tabs
            if (user.id_area) {
                if (tabUsuarios) tabUsuarios.style.display = 'none';
                if (tabProyectos) tabProyectos.style.display = 'none';
                if (tabTipos) tabTipos.style.display = 'none';
                if (tabAreas) tabAreas.style.display = 'none';
            } else {
                // Full admin - show all tabs
                if (tabUsuarios) tabUsuarios.style.display = 'inline-block';
                if (tabProyectos) tabProyectos.style.display = 'inline-block';
                if (tabTipos) tabTipos.style.display = 'inline-block';
                if (tabAreas) tabAreas.style.display = 'inline-block';
            }
        }
    },

    navigateTo(view) {
        console.log('[App] Navigating to:', view);
        this.state.currentView = view;
        document.querySelectorAll('.nav-menu-item').forEach(el => el.classList.remove('active'));
        const activeNav = document.getElementById(`nav-${view}`);
        if (activeNav) activeNav.classList.add('active');
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const viewEl = document.getElementById(`view-${view}`);
        console.log('[App] View element:', viewEl ? 'found' : 'NOT FOUND');
        if (viewEl) {
            viewEl.classList.remove('hidden');
            if (view === 'config') this.switchConfigTab(this.state.currentConfigTab);
            else if (view === 'planning') this.loadPlanning();
            else if (view === 'dashboard') this.loadDashboard();
            else if (view === 'viewer') this.loadViewer();
            else if (view === 'comparativo') this.initComparativo();
        }
    },

    async loadInitialData() {
        try {
            const [colabRes, clientesRes, proyRes, tiposRes, areasRes, regionesRes, paisesRes] = await Promise.all([
                fetch('/api/config/colaboradores', { credentials: 'include' }),
                fetch('/api/config/clientes', { credentials: 'include' }),
                fetch('/api/config/proyectos', { credentials: 'include' }),
                fetch('/api/config/tipos', { credentials: 'include' }),
                fetch('/api/config/areas/full', { credentials: 'include' }),
                fetch('/api/config/regiones', { credentials: 'include' }),
                fetch('/api/config/paises', { credentials: 'include' })
            ]);

            // Check for auth errors
            if (colabRes.status === 401 || clientesRes.status === 401 ||
                proyRes.status === 401 || tiposRes.status === 401 || areasRes.status === 401) {
                console.warn('[App] Session expired during data load');
                this.logout();
                return;
            }

            this.state.colaboradores = await colabRes.json();
            this.state.clientes = await clientesRes.json();
            this.state.proyectos = await proyRes.json();
            this.state.tipos = await tiposRes.json();
            this.state.areas = await areasRes.json();
            this.state.regiones = await regionesRes.json();
            this.state.paises = await paisesRes.json();

            // Sort areas by ID ascending to ensure the lowest ID is first
            this.state.areas.sort((a, b) => a.id - b.id);

            // Set default selected area based on user
            if (this.state.currentUser && this.state.currentUser.id_area) {
                this.state.selectedAreaId = this.state.currentUser.id_area;
            } else if (this.state.areas.length > 0) {
                // Select the area with the lowest ID (first after sorting)
                this.state.selectedAreaId = this.state.areas[0].id;
            }

            // Populate selectors
            this.populateRegionSelectors();
            this.populateAreaSelectors();

            console.log('[App] Initial data loaded successfully');
        } catch (error) {
            console.error('[App] Error loading data:', error);
        }
    },

    populateAreaSelectors() {
        const selectors = ['dash-area', 'viewer-area', 'plan-area'];
        const user = this.state.currentUser;
        const userHasArea = user && user.id_area;

        selectors.forEach(selectorId => {
            const select = document.getElementById(selectorId);
            if (!select) return;

            select.innerHTML = '';
            this.state.areas.forEach(area => {
                const option = document.createElement('option');
                option.value = area.id;
                option.textContent = area.name;
                select.appendChild(option);
            });

            // Set default value
            if (this.state.selectedAreaId) {
                select.value = this.state.selectedAreaId;
            }

            // Lock selector if user has assigned area
            select.disabled = userHasArea;
            if (userHasArea) {
                select.title = 'Área asignada a tu usuario';
            }
        });
    },

    async loadDashboard() {
        // Call the new dashboard initialization function from dashboard.js
        if (typeof initDashboard === 'function') {
            initDashboard();
        }
    },

    async loadPlanning() {
        const year = document.getElementById('plan-year')?.value || this.state.currentYear;
        const week = document.getElementById('plan-week')?.value || this.state.currentWeek;
        const areaId = document.getElementById('plan-area')?.value || this.state.selectedAreaId;
        const regionId = document.getElementById('plan-region')?.value || null;
        const paisId = document.getElementById('plan-pais')?.value || null;
        try {
            let url = `/api/allocations?year=${year}&week=${week}`;
            if (areaId) url += `&id_area=${areaId}`;
            if (regionId) url += `&region_id=${regionId}`;
            if (paisId) url += `&pais_id=${paisId}`;
            const response = await fetch(url, {
                credentials: 'include'
            });
            const allocations = await response.json();
            this.state.currentAllocations = allocations;
            this.renderPlanningGrid(allocations);
        } catch (error) {
            console.error('[Planning] Error:', error);
        }
    },

    // ============================================
    // VIEWER FUNCTIONS (Read-only view)
    // ============================================
    async loadViewer() {
        // Initialize dropdowns if empty
        const yearSelect = document.getElementById('viewer-year');
        const weekSelect = document.getElementById('viewer-week');
        const areaSelect = document.getElementById('viewer-area');
        const regionSelect = document.getElementById('viewer-region');
        const paisSelect = document.getElementById('viewer-pais');

        if (yearSelect && yearSelect.options.length === 0) {
            this.populateViewerYearSelector();
        }
        if (weekSelect && weekSelect.options.length === 0) {
            await this.populateViewerWeekDropdown();
        }

        const year = yearSelect?.value || this.state.currentYear;
        const week = weekSelect?.value || this.state.currentWeek;
        const areaId = areaSelect?.value || this.state.selectedAreaId;
        const regionId = regionSelect?.value || null;
        const paisId = paisSelect?.value || null;

        try {
            let url = `/api/allocations?year=${year}&week=${week}`;
            if (areaId) url += `&id_area=${areaId}`;
            if (regionId) url += `&region_id=${regionId}`;
            if (paisId) url += `&pais_id=${paisId}`;
            const response = await fetch(url, {
                credentials: 'include'
            });
            const allocations = await response.json();
            this.renderViewerGrid(allocations);
        } catch (error) {
            console.error('[Viewer] Error:', error);
        }
    },

    populateViewerYearSelector() {
        const select = document.getElementById('viewer-year');
        if (!select) return;
        select.innerHTML = '';
        const currentYear = new Date().getFullYear();
        for (let y = currentYear - 1; y <= currentYear + 1; y++) {
            const option = document.createElement('option');
            option.value = y;
            option.textContent = y;
            if (y === currentYear) option.selected = true;
            select.appendChild(option);
        }
    },

    async populateViewerWeekDropdown() {
        const select = document.getElementById('viewer-week');
        if (!select) return;
        try {
            const year = parseInt(document.getElementById('viewer-year')?.value || this.state.currentYear);
            const response = await fetch(`/api/allocations/weeks?year=${year}`, {
                credentials: 'include'
            });
            const weeks = await response.json();
            select.innerHTML = '';
            if (weeks.length === 0) {
                for (let i = 1; i <= 52; i++) {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `Semana ${i}`;
                    select.appendChild(option);
                }
            } else {
                weeks.forEach(w => {
                    const option = document.createElement('option');
                    option.value = w.week_number;
                    option.textContent = `Semana ${w.week_number}`;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('[Viewer] Error loading weeks:', error);
        }
    },

    renderViewerGrid(allocations) {
        const tbody = document.getElementById('viewer-grid-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const byColaborador = {};
        allocations.forEach(alloc => {
            if (alloc.hours > 0) {
                if (!byColaborador[alloc.colaborador_id]) {
                    byColaborador[alloc.colaborador_id] = { name: alloc.colaborador_name, allocations: [] };
                }
                byColaborador[alloc.colaborador_id].allocations.push(alloc);
            }
        });

        Object.keys(byColaborador).forEach(colabId => {
            const colab = byColaborador[colabId];
            const tr = document.createElement('tr');

            // Collaborator Name (no buttons)
            const tdName = document.createElement('td');
            tdName.innerHTML = `<strong>${colab.name}</strong>`;
            tr.appendChild(tdName);

            // Assignments (read-only badges)
            const tdPlanning = document.createElement('td');
            tdPlanning.innerHTML = this.renderViewerCells(colab.allocations);
            tr.appendChild(tdPlanning);

            // Total hours
            const totalHours = colab.allocations.reduce((sum, a) => sum + a.hours, 0);
            const roundedHours = Math.round(totalHours * 10) / 10;
            const tdTotal = document.createElement('td');
            tdTotal.style.textAlign = 'center';
            tdTotal.innerHTML = `<strong>${roundedHours}h</strong>`;
            tr.appendChild(tdTotal);

            tbody.appendChild(tr);
        });

        if (Object.keys(byColaborador).length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.style.textAlign = 'center';
            td.style.padding = '40px';
            td.innerHTML = '<em style="color: #999;">No hay asignaciones para esta semana</em>';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    },

    renderViewerCells(allocations) {
        const year = parseInt(document.getElementById('viewer-year')?.value || this.state.currentYear);
        const week = parseInt(document.getElementById('viewer-week')?.value || this.state.currentWeek);

        function getDateOfISOWeek(w, y) {
            const simple = new Date(y, 0, 1 + (w - 1) * 7);
            const dow = simple.getDay();
            const ISOweekStart = simple;
            if (dow <= 4)
                ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
            else
                ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
            return ISOweekStart;
        }

        const monday = getDateOfISOWeek(week, year);
        let html = '<div class="days-container">';

        for (let i = 0; i < 5; i++) {
            const currentDate = new Date(monday);
            currentDate.setDate(monday.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayName = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'][i];
            const dayMonth = `${currentDate.getDate()}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
            const dayAllocations = allocations ? allocations.filter(a => a.date === dateStr) : [];
            const dayTotal = dayAllocations.reduce((sum, a) => sum + a.hours, 0);
            const roundedDayTotal = Math.round(dayTotal * 10) / 10;

            html += `
                <div class="day-cell">
                    <div class="day-cell-header">${this.escapeHtml(dayName)} ${this.escapeHtml(dayMonth)}</div>
                    ${dayAllocations.map(alloc => `
                        <div class="allocation-item">
                            <strong>${this.escapeHtml(alloc.cliente_name)}</strong>: ${parseFloat(alloc.hours)}h
                        </div>
                    `).join('')}
                    ${roundedDayTotal > 0 ? `<div class="day-cell-total">Total: ${roundedDayTotal}h</div>` : ''}
                </div>
            `;
        }

        html += '</div>';
        return html;
    },

    renderPlanningGrid(allocations) {
        const tbody = document.getElementById('planning-grid-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        const byColaborador = {};
        allocations.forEach(alloc => {
            if (alloc.hours > 0) {
                if (!byColaborador[alloc.colaborador_id]) {
                    byColaborador[alloc.colaborador_id] = { name: alloc.colaborador_name, allocations: [] };
                }
                byColaborador[alloc.colaborador_id].allocations.push(alloc);
            }
        });
        Object.keys(byColaborador).forEach(colabId => {
            const colab = byColaborador[colabId];
            const tr = document.createElement('tr');

            // Collaborator Name with Delete Button
            const tdName = document.createElement('td');
            tdName.style.display = 'flex';
            tdName.style.justifyContent = 'space-between';
            tdName.style.alignItems = 'center';
            const escapedName = this.escapeHtml(colab.name);
            tdName.innerHTML = `
                <strong>${escapedName}</strong>
                <button onclick="app.deleteCollaboratorPlanning(${parseInt(colabId)}, '${escapedName.replace(/'/g, "\\'")}')"
                        class="btn-icon text-red" title="Eliminar planificación de ${escapedName}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            tr.appendChild(tdName);

            const tdPlanning = document.createElement('td');
            tdPlanning.innerHTML = this.renderPlanningCells(colab.allocations, colabId);
            tr.appendChild(tdPlanning);
            const totalHours = colab.allocations.reduce((sum, a) => sum + a.hours, 0);
            const roundedHours = Math.round(totalHours * 10) / 10;
            const tdTotal = document.createElement('td');
            tdTotal.style.textAlign = 'center';
            tdTotal.innerHTML = `<strong>${roundedHours}h</strong>`;
            tr.appendChild(tdTotal);
            tbody.appendChild(tr);
        });
        if (Object.keys(byColaborador).length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.style.textAlign = 'center';
            td.style.padding = '40px';
            td.innerHTML = '<em style="color: #999;">No hay asignaciones para esta semana</em>';
            tr.appendChild(td);
            tbody.appendChild(tr);
        }
    },

    async copyPreviousDayAllocations(colaboradorId, targetDateStr) {
        // Calculate previous WORKING day (Mon->Fri of prev week, Tue-Fri->previous day)
        const targetDate = new Date(targetDateStr + 'T12:00:00'); // Add time to avoid timezone issues
        const dayOfWeek = targetDate.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

        const prevDate = new Date(targetDate);
        if (dayOfWeek === 1) {
            // Monday: go back to Friday (3 days)
            prevDate.setDate(prevDate.getDate() - 3);
        } else if (dayOfWeek === 0) {
            // Sunday: go back to Friday (2 days)
            prevDate.setDate(prevDate.getDate() - 2);
        } else if (dayOfWeek === 6) {
            // Saturday: go back to Friday (1 day)
            prevDate.setDate(prevDate.getDate() - 1);
        } else {
            // Tue-Fri: go back 1 day
            prevDate.setDate(prevDate.getDate() - 1);
        }
        const prevDateStr = prevDate.toISOString().split('T')[0];

        // Get area id and region/pais
        const areaId = document.getElementById('plan-area')?.value;
        const regionId = document.getElementById('plan-region')?.value;
        const paisId = document.getElementById('plan-pais')?.value;
        if (!areaId) {
            alert('Por favor selecciona un área primero.');
            return;
        }

        // Fetch previous day's allocations for this collaborator
        const year = prevDate.getFullYear();
        const prevWeek = app.getISOWeek(prevDate);

        try {
            let fetchUrl = `/api/allocations?year=${year}&week=${prevWeek}&id_area=${areaId}`;
            if (regionId) fetchUrl += `&region_id=${regionId}`;
            if (paisId) fetchUrl += `&pais_id=${paisId}`;
            const response = await fetch(fetchUrl, {
                credentials: 'include'
            });
            const allocations = await response.json();

            // Filter allocations for this collaborator and previous date
            const prevDayAllocations = allocations.filter(
                a => parseInt(a.colaborador_id) === parseInt(colaboradorId) && a.date === prevDateStr
            );

            if (prevDayAllocations.length === 0) {
                alert(`No hay asignaciones para ${app.state.colaboradores.find(c => c.id == colaboradorId)?.name || 'este colaborador'} el día anterior (${prevDateStr}).`);
                return;
            }

            // Get collaborator name for confirmation
            const colaboradorName = app.state.colaboradores.find(c => c.id == colaboradorId)?.name || 'el colaborador';

            // Show confirmation with warning
            const clientNames = prevDayAllocations.map(a => `${a.cliente_name}: ${a.hours}h`).join('\n');
            const confirmed = confirm(
                `Se copiarán las siguientes asignaciones del día anterior (${prevDateStr}) para ${colaboradorName}:\n\n` +
                `${clientNames}\n\n` +
                `ADVERTENCIA: Las asignaciones existentes de ${colaboradorName} para el día ${targetDateStr} serán eliminadas.\n\n` +
                `¿Deseas continuar?`
            );

            if (!confirmed) return;

            // Get target week number
            const targetWeek = app.getISOWeek(targetDate);
            const targetYear = targetDate.getFullYear();

            // Delete existing allocations for this collaborator on target date
            const deleteResponse = await fetch(`/api/allocations/collaborator-day/${colaboradorId}/${targetDateStr}?id_area=${areaId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!deleteResponse.ok) {
                throw new Error('Error al eliminar asignaciones existentes');
            }

            // Create new allocations copying from previous day
            for (const alloc of prevDayAllocations) {
                await fetch('/api/allocations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        colaborador_id: colaboradorId,
                        cliente_id: alloc.cliente_id,
                        date: targetDateStr,
                        hours: alloc.hours,
                        week_number: targetWeek,
                        year: targetYear,
                        id_area: areaId
                    })
                });
            }

            // Refresh planning grid
            await app.loadPlanning();
            showToast(`Se copiaron ${prevDayAllocations.length} asignación(es) exitosamente`, 'success');

        } catch (error) {
            console.error('[App] Error copying previous day allocations:', error);
            alert('Error al copiar las asignaciones del día anterior: ' + error.message);
        }
    },

    getISOWeek(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    },

    renderPlanningCells(allocations, colaboradorId) {
        const year = parseInt(document.getElementById('plan-year')?.value || this.state.currentYear);
        const week = parseInt(document.getElementById('plan-week')?.value || this.state.currentWeek);

        function getDateOfISOWeek(w, y) {
            const simple = new Date(y, 0, 1 + (w - 1) * 7);
            const dow = simple.getDay();
            const ISOweekStart = simple;
            if (dow <= 4)
                ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
            else
                ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
            return ISOweekStart;
        }

        const monday = getDateOfISOWeek(week, year);
        let html = '<div class="days-container">';

        for (let i = 0; i < 5; i++) {
            const currentDate = new Date(monday);
            currentDate.setDate(monday.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayName = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'][i];
            const dayMonth = `${currentDate.getDate()}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
            const dayAllocations = allocations ? allocations.filter(a => a.date === dateStr) : [];
            const dayTotal = dayAllocations.reduce((sum, a) => sum + a.hours, 0);
            const roundedDayTotal = Math.round(dayTotal * 10) / 10;

            html += `
                <div class="day-cell">
                    <div class="day-cell-header">
                        <span>${this.escapeHtml(dayName)} ${this.escapeHtml(dayMonth)}</span>
                        <button class="copy-prev-day-btn" onclick="app.copyPreviousDayAllocations(${parseInt(colaboradorId)}, '${this.escapeHtml(dateStr)}')" title="Copiar asignaciones del día anterior">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>
                    ${dayAllocations.map(alloc => `
                        <div class="allocation-item clickable" onclick="app.openAllocationModal(${parseInt(alloc.id)}, null, null)">
                            <strong>${this.escapeHtml(alloc.cliente_name)}</strong>: ${parseFloat(alloc.hours)}h
                        </div>
                    `).join('')}
                    <div class="add-allocation-btn" onclick="app.openAllocationModal(null, ${parseInt(colaboradorId)}, '${this.escapeHtml(dateStr)}')">
                        +
                    </div>
                    ${roundedDayTotal > 0 ? `<div class="day-cell-total">Total: ${roundedDayTotal}h</div>` : ''}
                </div>
            `;
        }

        html += '</div>';
        return html;
    },

    switchConfigTab(tab) {
        this.state.currentConfigTab = tab;
        document.querySelectorAll('.view-tab').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tab}`)?.classList.add('active');
        document.querySelectorAll('.config-tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`config-${tab}`)?.classList.remove('hidden');

        // Load data based on tab
        if (tab === 'usuarios') {
            this.loadUsuarios().then(() => this.renderConfigTable(tab));
        } else if (tab === 'regiones') {
            this.loadRegiones();
        } else if (tab === 'paises') {
            this.loadRegiones().then(() => this.loadPaises());
        } else if (tab === 'areas') {
            this.loadRegiones().then(() => this.loadAreas());
        } else if (tab === 'cor-config') {
            this.loadCorConfig();
        } else if (tab === 'cor-mapeo') {
            this.showCorMapeoTab('proyectos');
        } else {
            this.renderConfigTable(tab);
        }
    },

    async loadAreas() {
        try {
            const response = await fetch('/api/config/areas', {
                credentials: 'include'
            });
            this.state.areas = await response.json();
        } catch (error) {
            console.error('[App] Error loading areas:', error);
        }
    },

    renderConfigTable(table) {
        const tbody = document.getElementById(`table-${table}`);
        if (!tbody) return;
        tbody.innerHTML = '';
        const data = this.state[table] || [];

        // Special handling for usuarios table
        if (table === 'usuarios') {
            data.forEach(item => {
                const tr = document.createElement('tr');
                const roleLabel = item.role === 'administrador' ? '<span style="color: #e74c3c;">Administrador</span>' : '<span style="color: #3498db;">Visualizador</span>';
                const areaLabel = item.area_name ? this.escapeHtml(item.area_name) : '<em style="color:#999;">Todas</em>';
                tr.innerHTML = `
                    <td><input type="checkbox" class="row-checkbox" data-id="${parseInt(item.id)}"></td>
                    <td>${parseInt(item.id)}</td>
                    <td>${this.escapeHtml(item.username)}</td>
                    <td>${this.escapeHtml(item.name) || '-'}</td>
                    <td>${roleLabel}</td>
                    <td>${areaLabel}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.editUser(${parseInt(item.id)})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" onclick="app.deleteRecord('usuarios', ${parseInt(item.id)})"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            return;
        }

        // Special handling for areas table
        if (table === 'areas') {
            data.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="checkbox" class="row-checkbox" data-id="${parseInt(item.id)}"></td>
                    <td>${parseInt(item.id)}</td>
                    <td>${this.escapeHtml(item.name)}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.editRecord('areas', ${parseInt(item.id)})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" onclick="app.deleteRecord('areas', ${parseInt(item.id)})"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            return;
        }

        // Special handling for colaboradores table
        if (table === 'colaboradores') {
            data.forEach(item => {
                const tr = document.createElement('tr');
                const areaLabel = item.area_name ? this.escapeHtml(item.area_name) : '<em style="color:#999;">Sin área</em>';
                tr.innerHTML = `
                    <td><input type="checkbox" class="row-checkbox" data-id="${parseInt(item.id)}"></td>
                    <td>${parseInt(item.id)}</td>
                    <td>${this.escapeHtml(item.name)}</td>
                    <td>${areaLabel}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.editRecord('colaboradores', ${parseInt(item.id)})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" onclick="app.deleteRecord('colaboradores', ${parseInt(item.id)})"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            const areaLabel = item.area_name ? this.escapeHtml(item.area_name) : '<em style="color:#999;">-</em>';
            const regionLabel = item.region_name ? this.escapeHtml(item.region_name) : '<em style="color:#999;">-</em>';
            const paisLabel = item.pais_name ? this.escapeHtml(item.pais_name) : '<em style="color:#999;">-</em>';
            tr.innerHTML = `
                <td><input type="checkbox" class="row-checkbox" data-id="${parseInt(item.id)}"></td>
                <td>${parseInt(item.id)}</td>
                <td>${this.escapeHtml(item.name)}</td>
                ${table === 'clientes' ? `<td>${regionLabel}</td><td>${paisLabel}</td><td><span class="text-red">${this.escapeHtml(item.proyecto_name) || '-'}</span></td><td><span class="text-red">${this.escapeHtml(item.tipo_name) || '-'}</span></td><td>${areaLabel}</td>` : ''}
                <td style="text-align: right;">
                    <button class="btn-icon" onclick="app.editRecord('${this.escapeHtml(table)}', ${parseInt(item.id)})"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="app.deleteRecord('${this.escapeHtml(table)}', ${parseInt(item.id)})"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // ============================================
    // User Management Functions
    // ============================================

    openUserModal(id = null) {
        document.getElementById('user-id').value = id || '';
        document.getElementById('user-username').value = '';
        document.getElementById('user-name').value = '';
        document.getElementById('user-password').value = '';
        document.getElementById('user-role').value = '';
        document.getElementById('user-modal-title').textContent = id ? 'Editar Usuario' : 'Añadir Usuario';

        // Populate area selector
        const areaSelect = document.getElementById('user-area');
        if (areaSelect) {
            areaSelect.innerHTML = '<option value="">-- Sin área (acceso a todas) --</option>';
            this.state.areas.forEach(area => {
                areaSelect.innerHTML += `<option value="${area.id}">${this.escapeHtml(area.name)}</option>`;
            });
        }

        if (id) {
            const user = this.state.usuarios.find(u => u.id === id);
            if (user) {
                document.getElementById('user-username').value = user.username;
                document.getElementById('user-name').value = user.name || '';
                document.getElementById('user-role').value = user.role;
                if (areaSelect) {
                    areaSelect.value = user.id_area || '';
                }
            }
        }

        document.getElementById('user-modal').classList.remove('hidden');
    },

    closeUserModal() {
        document.getElementById('user-modal').classList.add('hidden');
    },

    editUser(id) {
        this.openUserModal(id);
    },

    async saveUser() {
        const id = document.getElementById('user-id').value;
        const username = document.getElementById('user-username').value.trim();
        const name = document.getElementById('user-name').value.trim();
        const password = document.getElementById('user-password').value;
        const role = document.getElementById('user-role').value;
        const areaSelect = document.getElementById('user-area');
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : null;

        if (!username || !role) {
            alert('Usuario y rol son requeridos');
            return;
        }

        if (!id && !password) {
            alert('La contraseña es requerida para nuevos usuarios');
            return;
        }

        const body = { username, name, role, id_area };
        if (password) body.password = password;

        try {
            const url = id ? `/api/config/usuarios/${id}` : '/api/config/usuarios';
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const data = await response.json();
                showToast(data.error || 'Error al guardar usuario', 'error');
                return;
            }

            this.closeUserModal();
            await this.loadUsuarios();
            this.renderConfigTable('usuarios');
            showToast(id ? 'Usuario actualizado' : 'Usuario creado', 'success');
        } catch (error) {
            console.error('[App] Error saving user:', error);
            showToast('Error al guardar usuario', 'error');
        }
    },

    async loadUsuarios() {
        try {
            const response = await fetch('/api/config/usuarios', {
                credentials: 'include'
            });
            this.state.usuarios = await response.json();
        } catch (error) {
            console.error('[App] Error loading usuarios:', error);
        }
    },

    toggleSelectAll(table, checked) {
        document.querySelectorAll(`#table-${table} .row-checkbox`).forEach(cb => cb.checked = checked);
    },

    openAddModal(table) {
        this.state.editingRecord = null;
        this.state.importingTable = null;
        const tableLabels = {
            'colaboradores': 'Colaborador',
            'clientes': 'Cliente',
            'proyectos': 'Proyecto',
            'tipos': 'Tipo',
            'areas': 'Área',
            'regiones': 'Región',
            'paises': 'País'
        };
        document.getElementById('modal-title').textContent = `Añadir ${tableLabels[table] || table}`;
        document.getElementById('record-name').value = '';

        // Hide all conditional fields first
        document.getElementById('cliente-fields').classList.add('hidden');
        document.getElementById('colaborador-area-field')?.classList.add('hidden');
        document.getElementById('region-fields')?.classList.add('hidden');
        document.getElementById('pais-fields')?.classList.add('hidden');
        document.getElementById('area-fields')?.classList.add('hidden');

        // Show fields based on table type
        if (table === 'regiones') {
            document.getElementById('region-fields').classList.remove('hidden');
            document.getElementById('region-es-global').checked = false;
        } else if (table === 'paises') {
            document.getElementById('pais-fields').classList.remove('hidden');
            document.getElementById('pais-es-global').checked = false;
            // Populate region selector
            const regionSelect = document.getElementById('pais-region');
            regionSelect.innerHTML = '<option value="">-- Seleccionar --</option>' +
                this.state.regiones.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
        } else if (table === 'areas') {
            document.getElementById('area-fields').classList.remove('hidden');
            // Populate region selector
            const regionSelect = document.getElementById('area-region');
            regionSelect.innerHTML = '<option value="">-- Sin región --</option>' +
                this.state.regiones.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
            document.getElementById('area-pais').innerHTML = '<option value="">-- Sin país --</option>';
        } else if (table === 'colaboradores') {
            document.getElementById('colaborador-area-field').classList.remove('hidden');
            const areaSelect = document.getElementById('colaborador-area');
            areaSelect.innerHTML = '<option value="">-- Sin área --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
            if (this.state.selectedAreaId) {
                areaSelect.value = this.state.selectedAreaId;
            }
        } else if (table === 'clientes') {
            document.getElementById('cliente-fields').classList.remove('hidden');
            const proySelect = document.getElementById('record-proyecto');
            const tipoSelect = document.getElementById('record-tipo');
            const areaSelect = document.getElementById('record-area');
            const regionSelect = document.getElementById('cliente-region');
            const paisSelect = document.getElementById('cliente-pais');

            // Populate region selector and set Global as default
            const globalRegion = this.state.regiones.find(r => r.es_global === 1 || r.es_global === true);
            regionSelect.innerHTML = '<option value="">-- Seleccionar --</option>' +
                this.state.regiones.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
            if (globalRegion) {
                regionSelect.value = globalRegion.id;
                // Populate países for Global region
                this.populatePaisSelectors(globalRegion.id, ['cliente-pais']).then(() => {
                    const globalPais = this.state.paises.find(p => p.es_global === 1 || p.es_global === true);
                    if (globalPais) {
                        paisSelect.value = globalPais.id;
                    }
                });
            } else {
                paisSelect.innerHTML = '<option value="">-- Seleccionar --</option>';
            }

            proySelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.proyectos.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('');
            tipoSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.tipos.map(t => `<option value="${t.id}">${this.escapeHtml(t.name)}</option>`).join('');
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
                if (this.state.selectedAreaId) {
                    areaSelect.value = this.state.selectedAreaId;
                }
            }
        }
        document.getElementById('crud-modal').classList.remove('hidden');
    },

    editRecord(table, id) {
        const item = this.state[table].find(i => i.id === id);
        if (!item) return;
        this.state.editingRecord = { table, id };
        const tableLabels = {
            'colaboradores': 'Colaborador',
            'clientes': 'Cliente',
            'proyectos': 'Proyecto',
            'tipos': 'Tipo',
            'areas': 'Área',
            'regiones': 'Región',
            'paises': 'País'
        };
        document.getElementById('modal-title').textContent = `Editar ${tableLabels[table] || table}`;
        document.getElementById('record-name').value = item.name;

        // Hide all conditional fields first
        document.getElementById('cliente-fields').classList.add('hidden');
        document.getElementById('colaborador-area-field')?.classList.add('hidden');
        document.getElementById('region-fields')?.classList.add('hidden');
        document.getElementById('pais-fields')?.classList.add('hidden');
        document.getElementById('area-fields')?.classList.add('hidden');

        // Show fields based on table type
        if (table === 'regiones') {
            document.getElementById('region-fields').classList.remove('hidden');
            document.getElementById('region-es-global').checked = item.es_global || false;
        } else if (table === 'paises') {
            document.getElementById('pais-fields').classList.remove('hidden');
            document.getElementById('pais-es-global').checked = item.es_global || false;
            const regionSelect = document.getElementById('pais-region');
            regionSelect.innerHTML = '<option value="">-- Seleccionar --</option>' +
                this.state.regiones.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
            regionSelect.value = item.region_id || '';
        } else if (table === 'areas') {
            document.getElementById('area-fields').classList.remove('hidden');
            const regionSelect = document.getElementById('area-region');
            regionSelect.innerHTML = '<option value="">-- Sin región --</option>' +
                this.state.regiones.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
            regionSelect.value = item.region_id || '';
            // Load countries for the selected region
            if (item.region_id) {
                this.populatePaisSelectors(item.region_id, ['area-pais']).then(() => {
                    document.getElementById('area-pais').value = item.pais_id || '';
                });
            } else {
                document.getElementById('area-pais').innerHTML = '<option value="">-- Sin país --</option>';
            }
        } else if (table === 'colaboradores') {
            document.getElementById('colaborador-area-field').classList.remove('hidden');
            const areaSelect = document.getElementById('colaborador-area');
            areaSelect.innerHTML = '<option value="">-- Sin área --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
            areaSelect.value = item.id_area || '';
        } else if (table === 'clientes') {
            document.getElementById('cliente-fields').classList.remove('hidden');
            const proySelect = document.getElementById('record-proyecto');
            const tipoSelect = document.getElementById('record-tipo');
            const areaSelect = document.getElementById('record-area');
            const regionSelect = document.getElementById('cliente-region');
            const paisSelect = document.getElementById('cliente-pais');

            // Populate and set region
            regionSelect.innerHTML = '<option value="">-- Seleccionar --</option>' +
                this.state.regiones.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)}</option>`).join('');
            regionSelect.value = item.region_id || '';

            // Populate países for the selected region
            if (item.region_id) {
                this.populatePaisSelectors(item.region_id, ['cliente-pais']).then(() => {
                    paisSelect.value = item.pais_id || '';
                });
            } else {
                paisSelect.innerHTML = '<option value="">-- Seleccionar --</option>';
            }

            proySelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.proyectos.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('');
            tipoSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.tipos.map(t => `<option value="${t.id}">${this.escapeHtml(t.name)}</option>`).join('');
            proySelect.value = item.proyecto_id || '';
            tipoSelect.value = item.tipo_id || '';
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
                areaSelect.value = item.id_area || '';
            }
        }
        document.getElementById('crud-modal').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('crud-modal').classList.add('hidden');
        this.state.editingRecord = null;
    },

    async saveRecord() {
        const name = document.getElementById('record-name').value.trim();
        if (!name) return;
        const table = this.state.editingRecord?.table || this.state.currentConfigTab;
        const body = { name };

        // Add fields based on table type
        if (table === 'regiones') {
            body.es_global = document.getElementById('region-es-global').checked;
        } else if (table === 'paises') {
            const regionId = document.getElementById('pais-region').value;
            if (!regionId) {
                showToast('Debe seleccionar una región', 'error');
                return;
            }
            body.region_id = parseInt(regionId);
            body.es_global = document.getElementById('pais-es-global').checked;
        } else if (table === 'areas') {
            const regionId = document.getElementById('area-region').value;
            const paisId = document.getElementById('area-pais').value;
            body.region_id = regionId ? parseInt(regionId) : null;
            body.pais_id = paisId ? parseInt(paisId) : null;
        } else if (table === 'clientes') {
            const regionId = document.getElementById('cliente-region').value;
            const paisId = document.getElementById('cliente-pais').value;
            body.region_id = regionId ? parseInt(regionId) : null;
            body.pais_id = paisId ? parseInt(paisId) : null;
            body.id_proyecto = document.getElementById('record-proyecto').value || null;
            body.id_tipo_proyecto = document.getElementById('record-tipo').value || null;
            const areaSelect = document.getElementById('record-area');
            body.id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : null;
        } else if (table === 'colaboradores') {
            const areaSelect = document.getElementById('colaborador-area');
            body.id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : null;
        }

        try {
            if (this.state.editingRecord) {
                await fetch(`/api/config/${table}/${this.state.editingRecord.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });
            } else {
                await fetch(`/api/config/${table}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });
            }

            // Reload the appropriate data
            if (table === 'regiones') {
                await this.loadRegiones();
            } else if (table === 'paises') {
                await this.loadPaises();
            } else if (table === 'areas') {
                await this.loadAreas();
            } else {
                await this.loadInitialData();
                this.renderConfigTable(table);
            }

            this.closeModal();
            showToast(this.state.editingRecord ? 'Registro actualizado' : 'Registro creado', 'success');
        } catch (error) {
            console.error('[Config] Error saving:', error);
            showToast('Error al guardar', 'error');
        }
    },

    async deleteRecord(table, id) {
        if (!confirm('¿Estás seguro de eliminar este registro?')) return;
        try {
            await fetch(`/api/config/${table}/${id}`, { method: 'DELETE', credentials: 'include' });

            // Reload appropriate data based on table
            if (table === 'regiones') {
                await this.loadRegiones();
            } else if (table === 'paises') {
                await this.loadPaises();
            } else if (table === 'areas') {
                await this.loadAreas();
            } else {
                await this.loadInitialData();
                this.renderConfigTable(table);
            }
            showToast('Registro eliminado', 'success');
        } catch (error) {
            console.error('[Config] Error deleting:', error);
            showToast('Error al eliminar', 'error');
        }
    },

    async deleteSelected(table) {
        const checkboxes = document.querySelectorAll(`#table-${table} .row-checkbox:checked`);
        if (checkboxes.length === 0) {
            showToast('No hay registros seleccionados', 'warning');
            return;
        }
        if (!confirm(`¿Eliminar ${checkboxes.length} registro(s)?`)) return;
        try {
            await Promise.all(Array.from(checkboxes).map(cb =>
                fetch(`/api/config/${table}/${cb.dataset.id}`, { method: 'DELETE', credentials: 'include' })
            ));

            // Reload appropriate data based on table
            if (table === 'regiones') {
                await this.loadRegiones();
            } else if (table === 'paises') {
                await this.loadPaises();
            } else if (table === 'areas') {
                await this.loadAreas();
            } else {
                await this.loadInitialData();
                this.renderConfigTable(table);
            }
            showToast(`${checkboxes.length} registro(s) eliminado(s)`, 'success');
        } catch (error) {
            console.error('[Config] Error deleting:', error);
            showToast('Error al eliminar', 'error');
        }
    },

    openImportModal(table) {
        this.state.importingTable = table;
        document.getElementById('csv-file-input').value = '';
        document.getElementById('import-modal').classList.remove('hidden');
    },

    closeImportModal() {
        document.getElementById('import-modal').classList.add('hidden');
        this.state.importingTable = null;
    },

    async importCSV() {
        const fileInput = document.getElementById('csv-file-input');
        const file = fileInput.files[0];
        if (!file) {
            alert('Selecciona un archivo CSV');
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
            await fetch(`/api/config/${this.state.importingTable}/import`, {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            await this.loadInitialData();
            this.renderConfigTable(this.state.importingTable);
            this.closeImportModal();
            showToast('Importación exitosa', 'success');
        } catch (error) {
            console.error('[Import] Error:', error);
            showToast('Error al importar', 'error');
        }
    },

    openAllocationModal(id, colaboradorId, dateStr) {
        document.getElementById('alloc-modal-title').textContent = id ? 'Editar Asignación' : 'Nueva Asignación';
        document.getElementById('alloc-id').value = id || '';
        document.getElementById('alloc-colaborador-id').value = colaboradorId || '';
        document.getElementById('alloc-date').value = dateStr || '';
        const clienteSelect = document.getElementById('alloc-cliente');
        clienteSelect.innerHTML = '<option value="">-- Seleccionar Cliente --</option>';

        // Filter clients by the currently selected area
        const selectedAreaId = document.getElementById('plan-area')?.value;
        const filteredClientes = selectedAreaId
            ? this.state.clientes.filter(c => parseInt(c.id_area) === parseInt(selectedAreaId))
            : this.state.clientes;

        filteredClientes.forEach(c => { clienteSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`; });
        document.getElementById('btn-delete-alloc').classList.toggle('hidden', !id);
        if (id) {
            const alloc = this.state.currentAllocations.find(a => a.id === id);
            if (alloc) {
                clienteSelect.value = alloc.cliente_id;
                document.getElementById('alloc-hours').value = alloc.hours;
                document.getElementById('alloc-colaborador-id').value = alloc.colaborador_id;
                document.getElementById('alloc-date').value = alloc.date;
            }
        } else {
            clienteSelect.value = '';
            document.getElementById('alloc-hours').value = 8;
        }
        document.getElementById('allocation-modal').classList.remove('hidden');
    },

    closeAllocationModal() {
        document.getElementById('allocation-modal').classList.add('hidden');
    },

    async saveAllocation() {
        const id = document.getElementById('alloc-id').value;
        const colaboradorId = parseInt(document.getElementById('alloc-colaborador-id').value);
        const clienteId = parseInt(document.getElementById('alloc-cliente').value);
        const hours = parseFloat(document.getElementById('alloc-hours').value);
        const date = document.getElementById('alloc-date').value;
        const year = parseInt(document.getElementById('plan-year').value);
        const week = parseInt(document.getElementById('plan-week').value);
        const areaSelect = document.getElementById('plan-area');
        const regionSelect = document.getElementById('plan-region');
        const paisSelect = document.getElementById('plan-pais');
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : this.state.selectedAreaId;
        const region_id = regionSelect && regionSelect.value ? parseInt(regionSelect.value) : null;
        const pais_id = paisSelect && paisSelect.value ? parseInt(paisSelect.value) : null;

        console.log('[Allocation] Guardando:', { id, colaboradorId, clienteId, hours, date, year, week, id_area, region_id, pais_id });

        if (!clienteId || !hours || !date) {
            alert('Completa todos los campos');
            return;
        }
        const body = { colaborador_id: colaboradorId, cliente_id: clienteId, hours, date, year, week_number: week, id_area, region_id, pais_id };

        console.log('[Allocation] Body:', body);

        try {
            let response;
            if (id) {
                console.log('[Allocation] Actualizando ID:', id);
                response = await fetch(`/api/allocations/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });
            } else {
                console.log('[Allocation] Creando nueva asignación');
                response = await fetch('/api/allocations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                });
            }

            console.log('[Allocation] Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Allocation] Error response:', errorText);
                alert(`Error al guardar: ${response.status} - ${errorText}`);
                return;
            }

            const result = await response.json();
            console.log('[Allocation] Guardado exitoso:', result);

            await this.loadPlanning();
            this.closeAllocationModal();
            showToast('Cambios guardados correctamente', 'success');
        } catch (error) {
            console.error('[Allocation] Error saving:', error);
            alert('Error al guardar: ' + error.message);
        }
    },

    async deleteAllocation() {
        const id = document.getElementById('alloc-id').value;
        if (!id || !confirm('¿Eliminar esta asignación?')) return;
        try {
            await fetch(`/api/allocations/${id}`, { method: 'DELETE', credentials: 'include' });
            await this.loadPlanning();
            this.closeAllocationModal();
        } catch (error) {
            console.error('[Allocation] Error deleting:', error);
            alert('Error al eliminar');
        }
    },

    async copyPreviousWeek() {
        const currentYear = parseInt(document.getElementById('plan-year').value);
        const currentWeek = parseInt(document.getElementById('plan-week').value);
        const areaSelect = document.getElementById('plan-area');
        const regionSelect = document.getElementById('plan-region');
        const paisSelect = document.getElementById('plan-pais');
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : this.state.selectedAreaId;
        const region_id = regionSelect && regionSelect.value ? parseInt(regionSelect.value) : null;
        const pais_id = paisSelect && paisSelect.value ? parseInt(paisSelect.value) : null;

        // Calculate next week and year
        let nextWeek = currentWeek + 1;
        let nextYear = currentYear;

        // Handle year transition (week 52 -> week 1 of next year)
        if (nextWeek > 52) {
            nextWeek = 1;
            nextYear = currentYear + 1;
        }

        if (!confirm(`¿Copiar asignaciones de la semana ${currentWeek}/${currentYear} a la semana ${nextWeek}/${nextYear}?`)) return;

        try {
            const response = await fetch('/api/allocations/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fromYear: currentYear,
                    fromWeek: currentWeek,
                    toYear: nextYear,
                    toWeek: nextWeek,
                    id_area,
                    region_id,
                    pais_id
                })
            });

            if (!response.ok) {
                throw new Error('Error al copiar semana');
            }

            // Update year selector if year changed
            if (nextYear !== currentYear) {
                this.populateYearSelector();
                this.populateViewerYearSelector(); // Sync viewer year
                document.getElementById('plan-year').value = nextYear;
                document.getElementById('viewer-year').value = nextYear;
            }

            // Refresh week dropdown to include new week
            await this.populateWeekDropdown();
            await this.populateViewerWeekDropdown(); // Sync viewer

            // Select the newly created week
            document.getElementById('plan-week').value = nextWeek;

            // Load the new week's data
            await this.loadPlanning();

            showToast(`Semana ${currentWeek}/${currentYear} copiada a semana ${nextWeek}/${nextYear}`, 'success');
        } catch (error) {
            console.error('[Planning] Error copying:', error);
            alert('Error al copiar semana: ' + error.message);
        }
    },

    async createNewPlanning() {
        const currentYear = parseInt(document.getElementById('plan-year').value);
        const currentWeek = parseInt(document.getElementById('plan-week').value);
        const areaSelect = document.getElementById('plan-area');
        const regionSelect = document.getElementById('plan-region');
        const paisSelect = document.getElementById('plan-pais');
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : this.state.selectedAreaId;
        const region_id = regionSelect && regionSelect.value ? parseInt(regionSelect.value) : null;
        const pais_id = paisSelect && paisSelect.value ? parseInt(paisSelect.value) : null;

        // Calculate next week and year
        let nextWeek = currentWeek + 1;
        let nextYear = currentYear;

        if (nextWeek > 52) {
            nextWeek = 1;
            nextYear = currentYear + 1;
        }

        if (!confirm(`¿Crear nueva planificación para la semana ${nextWeek}/${nextYear}?\n\nSe crearán registros vacíos para los colaboradores de la semana ${currentWeek}/${currentYear}.`)) {
            return;
        }

        try {
            // Get current week's allocations to extract unique collaborators
            let url = `/api/allocations?year=${currentYear}&week=${currentWeek}`;
            if (id_area) url += `&id_area=${id_area}`;
            if (region_id) url += `&region_id=${region_id}`;
            if (pais_id) url += `&pais_id=${pais_id}`;
            const response = await fetch(url, {
                credentials: 'include'
            });
            const currentAllocations = await response.json();

            // Extract unique collaborators
            const uniqueCollaborators = new Set();
            currentAllocations.forEach(alloc => {
                uniqueCollaborators.add(alloc.colaborador_id);
            });

            const collaboratorIds = Array.from(uniqueCollaborators);

            // If no collaborators found in current week, try to get collaborators from the area
            if (collaboratorIds.length === 0 && id_area) {
                // Get collaborators by area
                const areaColabsResponse = await fetch(`/api/config/colaboradores/by-area/${id_area}`, {
                    credentials: 'include'
                });
                const areaCollaborators = await areaColabsResponse.json();

                if (areaCollaborators.length === 0) {
                    alert('No hay colaboradores asignados al área seleccionada. Por favor, asigne colaboradores al área en el maestro de colaboradores.');
                    return;
                }

                // Use collaborators from the area
                areaCollaborators.forEach(c => uniqueCollaborators.add(c.id));
                collaboratorIds.push(...Array.from(uniqueCollaborators));

                // Find vacation client for this area (client with proyecto_id=4 "Vacaciones" for this area)
                // Use parseInt to ensure type consistency for comparison
                // Note: API returns proyecto_id, not id_proyecto
                const areaIdNum = parseInt(id_area);
                const vacationClient = this.state.clientes.find(c =>
                    parseInt(c.id_area) === areaIdNum && parseInt(c.proyecto_id) === 4
                );

                console.log('[NewPlanning] Buscando cliente vacaciones para área:', areaIdNum);
                console.log('[NewPlanning] Clientes disponibles:', this.state.clientes.map(c => ({
                    id: c.id,
                    name: c.name,
                    id_area: c.id_area,
                    proyecto_id: c.proyecto_id
                })));
                console.log('[NewPlanning] Cliente encontrado:', vacationClient);

                if (vacationClient) {
                    // Use the vacation client id instead of default
                    this._vacationClientId = vacationClient.id;
                    console.log('[NewPlanning] Usando cliente de vacaciones ID:', vacationClient.id, vacationClient.name);
                } else {
                    console.warn('[NewPlanning] No se encontró cliente de vacaciones (proyecto_id=4) para el área:', areaIdNum);
                    // Show available clients for debugging
                    const clientesDelArea = this.state.clientes.filter(c => parseInt(c.id_area) === areaIdNum);
                    console.log('[NewPlanning] Clientes del área:', clientesDelArea);
                }
            }

            // ALWAYS find vacation client for this area when creating new planning (regardless of whether we found previous records)
            // This ensures the correct vacation client is used based on the selected area
            // Note: API returns proyecto_id, not id_proyecto
            if (id_area && !this._vacationClientId) {
                const areaIdNum = parseInt(id_area);
                const vacationClient = this.state.clientes.find(c =>
                    parseInt(c.id_area) === areaIdNum && parseInt(c.proyecto_id) === 4
                );
                if (vacationClient) {
                    this._vacationClientId = vacationClient.id;
                    console.log('[NewPlanning] Cliente vacaciones encontrado para área:', areaIdNum, '- ID:', vacationClient.id, vacationClient.name);
                }
            }

            if (collaboratorIds.length === 0) {
                alert('No hay colaboradores para crear la nueva planificación. Por favor, asigne colaboradores al área en el maestro de colaboradores.');
                return;
            }

            // Calculate the start date of the new week (Sunday)
            const year = nextYear;
            const week = nextWeek;
            const firstDayOfYear = new Date(year, 0, 1);
            const daysOffset = (week - 1) * 7;
            const weekStart = new Date(firstDayOfYear.getTime() + daysOffset * 24 * 60 * 60 * 1000);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Adjust to Sunday

            // Determine which client to use (vacation client for the area, or default cliente_id=10)
            const clientIdToUse = this._vacationClientId || 10;
            delete this._vacationClientId; // Clean up temp variable

            // Create allocations for each collaborator with 8 hours assigned to vacation client
            let createdCount = 0;
            for (const colaboradorId of collaboratorIds) {
                // Create one allocation for Monday of that week with 8 hours
                const allocationDate = new Date(weekStart);
                allocationDate.setDate(allocationDate.getDate() + 1); // Move to Monday
                const dateStr = allocationDate.toISOString().split('T')[0];

                const createResponse = await fetch('/api/allocations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        colaborador_id: colaboradorId,
                        cliente_id: clientIdToUse,
                        hours: 8, // 8 hours by default
                        date: dateStr,
                        week_number: nextWeek,
                        year: nextYear,
                        id_area,
                        region_id,
                        pais_id
                    })
                });

                if (createResponse.ok) {
                    createdCount++;
                }
            }

            // Update year selector if year changed
            if (nextYear !== currentYear) {
                this.populateYearSelector();
                this.populateViewerYearSelector(); // Sync viewer year
                document.getElementById('plan-year').value = nextYear;
                document.getElementById('viewer-year').value = nextYear;
            }

            // Refresh week dropdown to include new week
            await this.populateWeekDropdown();
            await this.populateViewerWeekDropdown(); // Sync viewer

            // Select the newly created week
            document.getElementById('plan-week').value = nextWeek;

            // Load the new week
            await this.loadPlanning();

            showToast(`Nueva planificación creada para semana ${nextWeek}/${nextYear}`, 'success');
        } catch (error) {
            console.error('[New Planning] Error:', error);
            alert('Error al crear nueva planificación: ' + error.message);
        }
    },

    async deleteCollaboratorPlanning(colaborador_id, colaborador_name) {
        const year = parseInt(document.getElementById('plan-year').value);
        const week = parseInt(document.getElementById('plan-week').value);

        if (!confirm(`¿Eliminar TODA la planificación de ${colaborador_name} para la semana ${week}/${year}?\n\nEsta acción no se puede deshacer.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/allocations/collaborator/${colaborador_id}/week/${year}/${week}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Error al eliminar planificación del colaborador');
            }

            const result = await response.json();
            console.log('[Delete Collaborator] Result:', result);

            // Reload planning
            await this.loadPlanning();

            showToast(`Planificación de ${colaborador_name} eliminada`, 'success');
        } catch (error) {
            console.error('[Delete Collaborator] Error:', error);
            alert('Error al eliminar planificación del colaborador: ' + error.message);
        }
    },

    async deleteWeekPlanning() {
        const year = parseInt(document.getElementById('plan-year').value);
        const week = parseInt(document.getElementById('plan-week').value);
        const id_area = document.getElementById('plan-area')?.value;
        const areaName = document.getElementById('plan-area')?.selectedOptions[0]?.text || 'área seleccionada';

        if (!confirm(`⚠️ ¿Eliminar TODA la planificación de la semana ${week}/${year} para ${areaName}?\n\nEsto eliminará las asignaciones de TODOS los colaboradores de esta área.\n\n¡Esta acción NO se puede deshacer!`)) {
            return;
        }

        // Double confirmation for safety
        if (!confirm(`¿Estás COMPLETAMENTE SEGURO de eliminar toda la semana ${week}/${year} para ${areaName}?`)) {
            return;
        }

        try {
            // Include area filter in URL
            let url = `/api/allocations/week/${year}/${week}`;
            if (id_area) {
                url += `?id_area=${id_area}`;
            }

            const response = await fetch(url, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Error al eliminar planificación de la semana');
            }

            const result = await response.json();
            console.log('[Delete Week] Result:', result);

            const deletedWeek = week;
            const deletedYear = year;

            // Refresh week dropdown
            await this.populateWeekDropdown();
            await this.populateViewerWeekDropdown(); // Sync viewer

            // Try to select the week immediately before the deleted one
            const weekSelect = document.getElementById('plan-week');
            const yearSelect = document.getElementById('plan-year');

            if (weekSelect && weekSelect.options.length > 0) {
                // Look for the highest week number that is less than the deleted one
                let foundPrevious = false;
                let maxPreviousWeek = -1;
                let maxPreviousIndex = -1;

                for (let i = 0; i < weekSelect.options.length; i++) {
                    const optionWeek = parseInt(weekSelect.options[i].value);
                    if (optionWeek < deletedWeek && optionWeek > maxPreviousWeek) {
                        maxPreviousWeek = optionWeek;
                        maxPreviousIndex = i;
                        foundPrevious = true;
                    }
                }

                if (foundPrevious) {
                    weekSelect.selectedIndex = maxPreviousIndex;
                }

                // If no previous week found in current year, try previous year
                if (!foundPrevious && yearSelect) {
                    const previousYear = deletedYear - 1;
                    // Check if previous year exists in year dropdown
                    for (let i = 0; i < yearSelect.options.length; i++) {
                        if (parseInt(yearSelect.options[i].value) === previousYear) {
                            yearSelect.value = previousYear;
                            await this.populateWeekDropdown();
                            await this.populateViewerWeekDropdown(); // Sync viewer
                            // Select the last week of the previous year
                            if (weekSelect.options.length > 0) {
                                weekSelect.selectedIndex = weekSelect.options.length - 1;
                            }
                            foundPrevious = true;
                            break;
                        }
                    }
                }

                // If still no previous week found, just select the last available week
                if (!foundPrevious && weekSelect.options.length > 0) {
                    weekSelect.selectedIndex = weekSelect.options.length - 1;
                }
            }

            // Load planning (will be empty or switch to another week)
            await this.loadPlanning();

            showToast(`Semana ${week}/${year} eliminada completamente`, 'success');
        } catch (error) {
            console.error('[Delete Week] Error:', error);
            alert('Error al eliminar planificación de la semana: ' + error.message);
        }
    },

    // ============================================
    // REGIONES & PAÍSES Functions
    // ============================================

    async loadRegiones() {
        try {
            const response = await fetch('/api/config/regiones', { credentials: 'include' });
            const regiones = await response.json();
            this.state.regiones = regiones;

            const tbody = document.getElementById('table-regiones');
            if (!tbody) return;

            tbody.innerHTML = regiones.map(r => `
                <tr>
                    <td><input type="checkbox" class="row-checkbox" data-id="${r.id}"></td>
                    <td>${r.id}</td>
                    <td>${this.escapeHtml(r.name)}</td>
                    <td>${r.es_global ? '<span style="color: #28a745;">Sí</span>' : 'No'}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.editRecord('regiones', ${r.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-red" onclick="app.deleteRecord('regiones', ${r.id})"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `).join('');

            // Populate region dropdowns
            this.populateRegionSelectors();
        } catch (error) {
            console.error('[Regiones] Error:', error);
        }
    },

    async loadPaises() {
        try {
            const regionFilter = document.getElementById('filter-paises-region')?.value || '';
            let url = '/api/config/paises';
            if (regionFilter) url += `?region_id=${regionFilter}`;

            const response = await fetch(url, { credentials: 'include' });
            const paises = await response.json();
            this.state.paises = paises;

            const tbody = document.getElementById('table-paises');
            if (!tbody) return;

            tbody.innerHTML = paises.map(p => `
                <tr>
                    <td><input type="checkbox" class="row-checkbox" data-id="${p.id}"></td>
                    <td>${p.id}</td>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td>${this.escapeHtml(p.region_name || '-')}</td>
                    <td>${p.es_global ? '<span style="color: #28a745;">Sí</span>' : 'No'}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.editRecord('paises', ${p.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-red" onclick="app.deleteRecord('paises', ${p.id})"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('[Paises] Error:', error);
        }
    },

    async loadAreas() {
        try {
            const regionFilter = document.getElementById('filter-areas-region')?.value || '';
            const paisFilter = document.getElementById('filter-areas-pais')?.value || '';

            let url = '/api/config/areas/full';
            const params = [];
            if (regionFilter) params.push(`region_id=${regionFilter}`);
            if (paisFilter) params.push(`pais_id=${paisFilter}`);
            if (params.length > 0) url += '?' + params.join('&');

            const response = await fetch(url, { credentials: 'include' });
            const areas = await response.json();
            this.state.areas = areas;

            const tbody = document.getElementById('table-areas');
            if (!tbody) return;

            tbody.innerHTML = areas.map(a => `
                <tr>
                    <td><input type="checkbox" class="row-checkbox" data-id="${a.id}"></td>
                    <td>${a.id}</td>
                    <td>${this.escapeHtml(a.name)}</td>
                    <td>${this.escapeHtml(a.region_name || '-')}</td>
                    <td>${this.escapeHtml(a.pais_name || '-')}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.editRecord('areas', ${a.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-red" onclick="app.deleteRecord('areas', ${a.id})"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `).join('');

            // Also update area selectors
            this.populateAreaSelectors();
        } catch (error) {
            console.error('[Areas] Error:', error);
        }
    },

    populateRegionSelectors() {
        const selectors = ['dash-region', 'plan-region', 'viewer-region', 'comp-region', 'filter-paises-region', 'filter-areas-region'];
        const regiones = this.state.regiones || [];
        const user = this.state.currentUser;
        const userHasArea = user && user.id_area;

        // Find Global region
        const globalRegion = regiones.find(r => r.es_global === 1 || r.es_global === true);

        // Determine if user's area is linked to a specific region
        let userRegionId = null;
        let userPaisId = null;
        if (userHasArea) {
            const userArea = this.state.areas.find(a => a.id === user.id_area);
            if (userArea) {
                userRegionId = userArea.region_id;
                userPaisId = userArea.pais_id;
            }
        }

        selectors.forEach(selectorId => {
            const select = document.getElementById(selectorId);
            if (!select) return;

            // Check if this is a filter selector (config) vs main view selector
            const isFilterSelector = selectorId.startsWith('filter-');

            const currentValue = select.value;
            select.innerHTML = '<option value="">Todas</option>';
            regiones.forEach(r => {
                const option = document.createElement('option');
                option.value = r.id;
                option.textContent = r.name;
                select.appendChild(option);
            });

            // Set default value: user's region if assigned, or Global if exists
            if (!isFilterSelector) {
                if (userRegionId) {
                    select.value = userRegionId;
                    select.disabled = true;
                    select.title = 'Región asignada a tu área';
                } else if (globalRegion) {
                    select.value = globalRegion.id;
                }
            } else if (currentValue) {
                select.value = currentValue;
            }
        });

        // Populate pais selectors for main views
        this.initializePaisSelectors(userRegionId, userPaisId, userHasArea, globalRegion);
    },

    async initializePaisSelectors(userRegionId, userPaisId, userHasArea, globalRegion) {
        const mainPaisSelectors = ['dash-pais', 'plan-pais', 'viewer-pais', 'comp-pais'];
        const globalPais = this.state.paises.find(p => p.es_global === 1 || p.es_global === true);

        for (const selectorId of mainPaisSelectors) {
            const select = document.getElementById(selectorId);
            if (!select) continue;

            const regionSelectorId = selectorId.replace('-pais', '-region');
            const regionSelect = document.getElementById(regionSelectorId);
            const regionId = userRegionId || regionSelect?.value || (globalRegion ? globalRegion.id : null);

            if (regionId) {
                await this.populatePaisSelectors(regionId, [selectorId]);
            }

            // Set default value
            if (userPaisId) {
                select.value = userPaisId;
                select.disabled = true;
                select.title = 'País asignado a tu área';
            } else if (globalPais && select.querySelector(`option[value="${globalPais.id}"]`)) {
                select.value = globalPais.id;
            }
        }
    },

    async populatePaisSelectors(regionId, selectorIds) {
        try {
            let url = '/api/config/paises';
            if (regionId) url += `?region_id=${regionId}`;

            const response = await fetch(url, { credentials: 'include' });
            const paises = await response.json();

            selectorIds.forEach(selectorId => {
                const select = document.getElementById(selectorId);
                if (!select) return;

                select.innerHTML = '<option value="">Todos</option>';
                paises.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = p.name;
                    select.appendChild(option);
                });
            });
        } catch (error) {
            console.error('[PopulatePaises] Error:', error);
        }
    },

    async populateAreasByFilters(regionId, paisId, selectorIds) {
        try {
            let url = '/api/config/areas/full';
            const params = [];
            if (regionId) params.push(`region_id=${regionId}`);
            if (paisId) params.push(`pais_id=${paisId}`);
            if (params.length > 0) url += '?' + params.join('&');

            const response = await fetch(url, { credentials: 'include' });
            const areas = await response.json();

            selectorIds.forEach(selectorId => {
                const select = document.getElementById(selectorId);
                if (!select) return;

                const currentValue = select.value;
                select.innerHTML = '<option value="">Todas</option>';
                areas.forEach(a => {
                    const option = document.createElement('option');
                    option.value = a.id;
                    option.textContent = a.name;
                    select.appendChild(option);
                });
                if (currentValue && areas.some(a => a.id == currentValue)) {
                    select.value = currentValue;
                }
            });
        } catch (error) {
            console.error('[PopulateAreas] Error:', error);
        }
    },

    // Dashboard cascade handlers
    async onDashRegionChange() {
        const regionId = document.getElementById('dash-region')?.value;
        await this.populatePaisSelectors(regionId, ['dash-pais']);
        document.getElementById('dash-pais').value = '';
        await this.populateAreasByFilters(regionId, '', ['dash-area']);
    },

    async onDashPaisChange() {
        const regionId = document.getElementById('dash-region')?.value;
        const paisId = document.getElementById('dash-pais')?.value;
        await this.populateAreasByFilters(regionId, paisId, ['dash-area']);
    },

    // Planning cascade handlers
    async onPlanRegionChange() {
        const regionId = document.getElementById('plan-region')?.value;
        await this.populatePaisSelectors(regionId, ['plan-pais']);
        document.getElementById('plan-pais').value = '';
        await this.populateAreasByFilters(regionId, '', ['plan-area']);
        this.loadPlanning();
    },

    async onPlanPaisChange() {
        const regionId = document.getElementById('plan-region')?.value;
        const paisId = document.getElementById('plan-pais')?.value;
        await this.populateAreasByFilters(regionId, paisId, ['plan-area']);
        this.loadPlanning();
    },

    // Viewer cascade handlers
    async onViewerRegionChange() {
        const regionId = document.getElementById('viewer-region')?.value;
        await this.populatePaisSelectors(regionId, ['viewer-pais']);
        document.getElementById('viewer-pais').value = '';
        await this.populateAreasByFilters(regionId, '', ['viewer-area']);
        this.loadViewer();
    },

    async onViewerPaisChange() {
        const regionId = document.getElementById('viewer-region')?.value;
        const paisId = document.getElementById('viewer-pais')?.value;
        await this.populateAreasByFilters(regionId, paisId, ['viewer-area']);
        this.loadViewer();
    },

    // Areas config cascade handler
    async onAreasRegionChange() {
        const regionId = document.getElementById('filter-areas-region')?.value;
        await this.populatePaisSelectors(regionId, ['filter-areas-pais']);
        document.getElementById('filter-areas-pais').value = '';
        this.loadAreas();
    },

    // Area modal cascade handler (for region/pais selection in add/edit modal)
    async onAreaModalRegionChange() {
        const regionId = document.getElementById('area-region')?.value;
        if (regionId) {
            await this.populatePaisSelectors(regionId, ['area-pais']);
        } else {
            document.getElementById('area-pais').innerHTML = '<option value="">-- Sin país --</option>';
        }
    },

    // Cliente modal cascade handler (for region/pais selection in add/edit modal)
    async onClienteModalRegionChange() {
        const regionId = document.getElementById('cliente-region')?.value;
        if (regionId) {
            await this.populatePaisSelectors(regionId, ['cliente-pais']);
        } else {
            document.getElementById('cliente-pais').innerHTML = '<option value="">-- Seleccionar --</option>';
        }
    },

    // ============================================
    // COR Integration Functions
    // ============================================

    async loadCorConfig() {
        try {
            const response = await fetch('/api/cor/config', { credentials: 'include' });
            if (!response.ok) return;

            const config = await response.json();
            document.getElementById('cor-sync-auto').checked = config.sync_automatica || false;
            document.getElementById('cor-sync-intervalo').value = config.intervalo_sync_horas || 24;

            if (config.ultima_sincronizacion) {
                const date = new Date(config.ultima_sincronizacion);
                document.getElementById('cor-ultima-sync').textContent = date.toLocaleString('es-ES');
            }
        } catch (error) {
            console.error('[COR Config] Error:', error);
        }
    },

    async saveCorConfig() {
        try {
            const apiKey = document.getElementById('cor-api-key').value || null;
            const clientSecret = document.getElementById('cor-client-secret').value || null;
            const syncAuto = document.getElementById('cor-sync-auto').checked;
            const intervalo = document.getElementById('cor-sync-intervalo').value;

            const response = await fetch('/api/cor/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    api_key: apiKey,
                    client_secret: clientSecret,
                    sync_automatica: syncAuto,
                    intervalo_sync_horas: intervalo
                })
            });

            if (response.ok) {
                showToast('Configuración guardada', 'success');
                // Clear sensitive fields
                document.getElementById('cor-api-key').value = '';
                document.getElementById('cor-client-secret').value = '';
            } else {
                showToast('Error al guardar configuración', 'error');
            }
        } catch (error) {
            console.error('[COR Config] Save error:', error);
            showToast('Error al guardar', 'error');
        }
    },

    testCorConnection() {
        showToast('Esta funcionalidad estará disponible cuando tengas credenciales de API', 'info');
    },

    syncCorNow() {
        showToast('Esta funcionalidad estará disponible cuando tengas credenciales de API', 'info');
    },

    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    },

    async importCorCsv() {
        const fileInput = document.getElementById('cor-csv-file');
        if (!fileInput || !fileInput.files.length) {
            showToast('Selecciona un archivo CSV', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const response = await fetch('/api/cor/importar-horas-csv', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            const result = await response.json();
            if (response.ok) {
                showToast(result.message, 'success');
                fileInput.value = '';
            } else {
                showToast(result.error || 'Error al importar', 'error');
            }
        } catch (error) {
            console.error('[COR CSV] Error:', error);
            showToast('Error al importar CSV', 'error');
        }
    },

    // COR Mapeo Functions
    showCorMapeoTab(tab) {
        const proyectosDiv = document.getElementById('cor-mapeo-proyectos');
        const usuariosDiv = document.getElementById('cor-mapeo-usuarios');
        const btnProyectos = document.getElementById('btn-mapeo-proyectos');
        const btnUsuarios = document.getElementById('btn-mapeo-usuarios');

        if (tab === 'proyectos') {
            proyectosDiv.classList.remove('hidden');
            usuariosDiv.classList.add('hidden');
            btnProyectos.classList.remove('btn-secondary');
            btnProyectos.classList.add('btn-primary');
            btnUsuarios.classList.remove('btn-primary');
            btnUsuarios.classList.add('btn-secondary');
            this.loadCorMapeoProyectos();
        } else {
            proyectosDiv.classList.add('hidden');
            usuariosDiv.classList.remove('hidden');
            btnProyectos.classList.remove('btn-primary');
            btnProyectos.classList.add('btn-secondary');
            btnUsuarios.classList.remove('btn-secondary');
            btnUsuarios.classList.add('btn-primary');
            this.loadCorMapeoUsuarios();
        }
    },

    async loadCorMapeoProyectos() {
        try {
            const response = await fetch('/api/cor/mapeo-proyectos', { credentials: 'include' });
            const mapeos = await response.json();

            const tbody = document.getElementById('table-cor-mapeo-proyectos');
            if (!tbody) return;

            if (mapeos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">
                    No hay proyectos de COR importados. Sincroniza primero con COR o importa un CSV.
                </td></tr>`;
                return;
            }

            tbody.innerHTML = mapeos.map(m => `
                <tr>
                    <td>${this.escapeHtml(m.cor_project_name || '-')}</td>
                    <td>${this.escapeHtml(m.cor_client_name || '-')}</td>
                    <td>
                        <select onchange="app.updateCorMapeoProyecto(${m.id}, this.value)" class="form-control" style="width: 200px;">
                            <option value="">-- Sin vincular --</option>
                            ${this.state.clientes.map(c => `
                                <option value="${c.id}" ${m.cliente_id === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>
                            `).join('')}
                        </select>
                    </td>
                    <td>${m.vinculacion_automatica ? '<span style="color: #28a745;">Automática</span>' : '<span style="color: #6c757d;">Manual</span>'}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.updateCorMapeoProyecto(${m.id}, null)"><i class="fas fa-unlink"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('[COR Mapeo Proyectos] Error:', error);
        }
    },

    async loadCorMapeoUsuarios() {
        try {
            const response = await fetch('/api/cor/mapeo-usuarios', { credentials: 'include' });
            const mapeos = await response.json();

            const tbody = document.getElementById('table-cor-mapeo-usuarios');
            if (!tbody) return;

            if (mapeos.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: #999;">
                    No hay usuarios de COR importados. Sincroniza primero con COR o importa un CSV.
                </td></tr>`;
                return;
            }

            tbody.innerHTML = mapeos.map(m => `
                <tr>
                    <td>${this.escapeHtml(m.cor_user_name || '-')}</td>
                    <td>${this.escapeHtml(m.cor_user_email || '-')}</td>
                    <td>
                        <select onchange="app.updateCorMapeoUsuario(${m.id}, this.value)" class="form-control" style="width: 200px;">
                            <option value="">-- Sin vincular --</option>
                            ${this.state.colaboradores.map(c => `
                                <option value="${c.id}" ${m.colaborador_id === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>
                            `).join('')}
                        </select>
                    </td>
                    <td>${m.vinculacion_automatica ? '<span style="color: #28a745;">Automática</span>' : '<span style="color: #6c757d;">Manual</span>'}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick="app.updateCorMapeoUsuario(${m.id}, null)"><i class="fas fa-unlink"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('[COR Mapeo Usuarios] Error:', error);
        }
    },

    async updateCorMapeoProyecto(id, clienteId) {
        try {
            await fetch(`/api/cor/mapeo-proyectos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cliente_id: clienteId })
            });
            showToast('Mapeo actualizado', 'success');
        } catch (error) {
            console.error('[COR Mapeo] Error:', error);
            showToast('Error al actualizar', 'error');
        }
    },

    async updateCorMapeoUsuario(id, colaboradorId) {
        try {
            await fetch(`/api/cor/mapeo-usuarios/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ colaborador_id: colaboradorId })
            });
            showToast('Mapeo actualizado', 'success');
        } catch (error) {
            console.error('[COR Mapeo] Error:', error);
            showToast('Error al actualizar', 'error');
        }
    },

    async autoVincularProyectos() {
        try {
            const response = await fetch('/api/cor/auto-vincular-proyectos', {
                method: 'POST',
                credentials: 'include'
            });
            const result = await response.json();
            showToast(result.message, 'success');
            this.loadCorMapeoProyectos();
        } catch (error) {
            console.error('[Auto-vincular] Error:', error);
            showToast('Error al auto-vincular', 'error');
        }
    },

    async autoVincularUsuarios() {
        try {
            const response = await fetch('/api/cor/auto-vincular-usuarios', {
                method: 'POST',
                credentials: 'include'
            });
            const result = await response.json();
            showToast(result.message, 'success');
            this.loadCorMapeoUsuarios();
        } catch (error) {
            console.error('[Auto-vincular] Error:', error);
            showToast('Error al auto-vincular', 'error');
        }
    },

    // ============================================
    // COMPARATIVO Functions
    // ============================================

    compCharts: {
        scatter: null,
        trend: null,
        variance: null,
        colaborador: null
    },

    // Set default date range (last week)
    initCompDateRange() {
        const today = new Date();
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(today.getDate() - today.getDay()); // Last Sunday
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekEnd.getDate() - 6); // Monday of last week

        document.getElementById('comp-fecha-desde').value = this.formatDate(lastWeekStart);
        document.getElementById('comp-fecha-hasta').value = this.formatDate(lastWeekEnd);
    },

    formatDate(date) {
        return date.toISOString().split('T')[0];
    },

    setCompDateRange(range) {
        const today = new Date();
        let desde, hasta;

        switch(range) {
            case 'week':
                // Last complete week (Monday to Sunday)
                hasta = new Date(today);
                hasta.setDate(today.getDate() - today.getDay()); // Last Sunday
                desde = new Date(hasta);
                desde.setDate(hasta.getDate() - 6); // Monday of last week
                break;
            case 'month':
                // Last 30 days
                hasta = new Date(today);
                desde = new Date(today);
                desde.setDate(today.getDate() - 30);
                break;
            case 'quarter':
                // Last 90 days
                hasta = new Date(today);
                desde = new Date(today);
                desde.setDate(today.getDate() - 90);
                break;
            default:
                return;
        }

        document.getElementById('comp-fecha-desde').value = this.formatDate(desde);
        document.getElementById('comp-fecha-hasta').value = this.formatDate(hasta);
        this.loadComparativo();
    },

    async loadComparativo() {
        const fechaDesde = document.getElementById('comp-fecha-desde')?.value || '';
        const fechaHasta = document.getElementById('comp-fecha-hasta')?.value || '';
        const areaId = document.getElementById('comp-area')?.value || '';
        const regionId = document.getElementById('comp-region')?.value || '';
        const paisId = document.getElementById('comp-pais')?.value || '';

        try {
            let url = `/api/cor/comparativo?`;
            const params = [];
            if (fechaDesde) params.push(`fecha_desde=${fechaDesde}`);
            if (fechaHasta) params.push(`fecha_hasta=${fechaHasta}`);
            if (areaId) params.push(`id_area=${areaId}`);
            if (regionId) params.push(`region_id=${regionId}`);
            if (paisId) params.push(`pais_id=${paisId}`);
            url += params.join('&');

            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();

            // Update main KPIs
            document.getElementById('kpi-planificadas').textContent = data.resumen.planificadas.toFixed(1) + 'h';
            document.getElementById('kpi-reales').textContent = data.resumen.reales.toFixed(1) + 'h';

            const diferencia = data.resumen.diferencia;
            const diffEl = document.getElementById('kpi-diferencia');
            diffEl.textContent = (diferencia >= 0 ? '+' : '') + diferencia.toFixed(1) + 'h';
            diffEl.style.color = diferencia >= 0 ? '#e74c3c' : '#27ae60';

            const precisionEl = document.getElementById('kpi-precision');
            precisionEl.textContent = data.kpis.precision.toFixed(1) + '%';
            precisionEl.style.color = data.kpis.precision >= 90 ? '#27ae60' : data.kpis.precision >= 70 ? '#f39c12' : '#e74c3c';

            // Update status KPIs
            document.getElementById('kpi-eficientes').textContent = data.kpis.clientesEficientes;
            document.getElementById('kpi-sobrepasados').textContent = data.kpis.clientesSobrepasados;
            document.getElementById('kpi-subutilizados').textContent = data.kpis.clientesSubutilizados;

            // Store data for filtering
            this.currentComparativoData = data;
            this.selectedClientId = null;

            // Update charts
            this.updateScatterChart(data.scatterData);
            this.updateTrendChart(data.porDia);
            this.updateVarianceChart(data.porCliente);
            this.updateHeatmap(data.porCliente); // Changed to use porCliente for simpler display

            // Update table (no filter initially)
            this.updateColaboradorChart(data.detalle);

        } catch (error) {
            console.error('[Comparativo] Error:', error);
        }
    },

    updateScatterChart(scatterData) {
        const ctx = document.getElementById('chart-scatter');
        if (!ctx) return;

        if (this.compCharts.scatter) {
            this.compCharts.scatter.destroy();
        }

        // Filter to only show clients with data
        const filteredData = scatterData.filter(d => d.x > 0 || d.y > 0);

        if (filteredData.length === 0) {
            this.compCharts.scatter = new Chart(ctx, {
                type: 'scatter',
                data: { datasets: [] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Sin datos para mostrar', color: '#999', font: { size: 14 } }
                    }
                }
            });
            return;
        }

        // Calculate max value for diagonal line
        const maxVal = Math.max(
            ...filteredData.map(d => Math.max(d.x, d.y)),
            10
        ) * 1.1;

        this.compCharts.scatter = new Chart(ctx, {
            type: 'scatter',
            plugins: [ChartDataLabels],
            data: {
                datasets: [{
                    label: 'Clientes',
                    data: filteredData,
                    backgroundColor: filteredData.map(d => {
                        if (d.y > d.x * 1.1) return 'rgba(231, 76, 60, 0.7)';  // Sobrepasado
                        if (d.y < d.x * 0.9) return 'rgba(52, 152, 219, 0.7)'; // Subutilizado
                        return 'rgba(39, 174, 96, 0.7)'; // Eficiente
                    }),
                    borderColor: filteredData.map(d => {
                        if (d.y > d.x * 1.1) return '#c0392b';
                        if (d.y < d.x * 0.9) return '#2980b9';
                        return '#27ae60';
                    }),
                    borderWidth: 2,
                    pointRadius: 8,
                    pointHoverRadius: 12
                }, {
                    label: 'Línea ideal (1:1)',
                    data: [{ x: 0, y: 0 }, { x: maxVal, y: maxVal }],
                    type: 'line',
                    borderColor: 'rgba(0, 0, 0, 0.3)',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const d = context.raw;
                                if (!d.label) return '';
                                return `${d.label}: Plan ${d.x.toFixed(1)}h, Real ${d.y.toFixed(1)}h`;
                            }
                        }
                    },
                    datalabels: {
                        display: (context) => {
                            // Only show labels for scatter points, not the line
                            return context.datasetIndex === 0;
                        },
                        align: 'bottom',
                        offset: 4,
                        color: '#333',
                        font: { size: 9 },
                        formatter: (value) => {
                            if (!value.label) return '';
                            return value.label.length > 15 ? value.label.substring(0, 15) + '...' : value.label;
                        }
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Horas Planificadas' },
                        min: 0,
                        ticks: {
                            callback: (value) => value.toFixed(1)
                        }
                    },
                    y: {
                        title: { display: true, text: 'Horas Reales' },
                        min: 0,
                        ticks: {
                            callback: (value) => value.toFixed(1)
                        }
                    }
                }
            }
        });
    },

    updateTrendChart(porDia) {
        const ctx = document.getElementById('chart-trend');
        if (!ctx) return;

        if (this.compCharts.trend) {
            this.compCharts.trend.destroy();
        }

        if (!porDia || porDia.length === 0) {
            this.compCharts.trend = new Chart(ctx, {
                type: 'line',
                data: { labels: [], datasets: [] },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Sin datos para mostrar', color: '#999', font: { size: 14 } }
                    }
                }
            });
            return;
        }

        // Format date labels (short format)
        const labels = porDia.map(s => {
            const d = new Date(s.date + 'T00:00:00');
            return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        });
        const planificadas = porDia.map(s => s.planificadas);
        const reales = porDia.map(s => s.reales);

        // Check if we have real data
        const hasRealData = reales.some(r => r > 0);

        const datasets = [{
            label: 'Planificadas',
            data: planificadas,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: labels.length > 14 ? 2 : 4,
            pointHoverRadius: 6
        }];

        // Only add reales dataset if there's data or always show it for comparison
        datasets.push({
            label: 'Reales' + (hasRealData ? '' : ' (sin datos COR)'),
            data: reales,
            borderColor: hasRealData ? '#9b59b6' : 'rgba(155, 89, 182, 0.3)',
            backgroundColor: 'rgba(155, 89, 182, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: hasRealData ? (labels.length > 14 ? 2 : 4) : 1,
            pointHoverRadius: 6,
            borderDash: hasRealData ? [] : [5, 5]
        });

        this.compCharts.trend = new Chart(ctx, {
            type: 'line',
            plugins: [ChartDataLabels],
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}h`;
                            }
                        }
                    },
                    datalabels: {
                        display: (context) => {
                            // Only show on points with significant values
                            return context.parsed.y > 0;
                        },
                        align: 'top',
                        offset: 4,
                        color: (context) => context.datasetIndex === 0 ? '#2980b9' : '#8e44ad',
                        font: { size: 9, weight: 'bold' },
                        formatter: (value) => value.toFixed(1)
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            maxRotation: 45,
                            minRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Horas' },
                        ticks: {
                            callback: (value) => value.toFixed(1)
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    },

    updateVarianceChart(porCliente) {
        const ctx = document.getElementById('chart-variance');
        if (!ctx) return;

        if (this.compCharts.variance) {
            this.compCharts.variance.destroy();
        }

        // Check if we have any real data
        const hasRealData = porCliente.some(c => c.reales > 0);

        // If no real data, show planned hours as bars (all negative = subutilizado style)
        // Take top 15 clients by planned hours when no real data, or by absolute difference when there's data
        let topClients;
        if (hasRealData) {
            topClients = porCliente.slice(0, 15);
        } else {
            // Sort by planned hours descending and take top 15
            topClients = [...porCliente]
                .filter(c => c.planificadas > 0)
                .sort((a, b) => b.planificadas - a.planificadas)
                .slice(0, 15);
        }

        if (topClients.length === 0) {
            this.compCharts.variance = new Chart(ctx, {
                type: 'bar',
                data: { labels: [], datasets: [] },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Sin datos para mostrar', color: '#999', font: { size: 14 } }
                    }
                }
            });
            return;
        }

        const labels = topClients.map(c => c.cliente_name.length > 20
            ? c.cliente_name.substring(0, 20) + '...'
            : c.cliente_name);

        // When no real data, show planned hours as negative (subutilizado = no se usaron las horas)
        const diferencias = hasRealData
            ? topClients.map(c => c.diferencia)
            : topClients.map(c => -c.planificadas); // Negative because real = 0

        this.compCharts.variance = new Chart(ctx, {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: {
                labels,
                datasets: [{
                    label: hasRealData ? 'Varianza (horas)' : 'Horas planificadas (sin datos COR)',
                    data: diferencias,
                    backgroundColor: diferencias.map(d => {
                        if (!hasRealData) return 'rgba(52, 152, 219, 0.5)'; // All blue when no real data
                        if (d > 0) return 'rgba(231, 76, 60, 0.7)';
                        if (d < 0) return 'rgba(52, 152, 219, 0.7)';
                        return 'rgba(39, 174, 96, 0.7)';
                    }),
                    borderColor: diferencias.map(d => {
                        if (!hasRealData) return '#2980b9';
                        if (d > 0) return '#c0392b';
                        if (d < 0) return '#2980b9';
                        return '#27ae60';
                    }),
                    borderWidth: 1,
                    borderDash: hasRealData ? undefined : [5, 5]
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: !hasRealData },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const client = topClients[context.dataIndex];
                                if (!hasRealData) {
                                    return [
                                        `Planificadas: ${client.planificadas.toFixed(1)}h`,
                                        `Reales: 0h (sin datos COR)`,
                                        `Diferencia: -${client.planificadas.toFixed(1)}h`
                                    ];
                                }
                                return [
                                    `Diferencia: ${client.diferencia >= 0 ? '+' : ''}${client.diferencia.toFixed(1)}h`,
                                    `Varianza: ${client.varianza_pct >= 0 ? '+' : ''}${client.varianza_pct.toFixed(1)}%`,
                                    `Plan: ${client.planificadas.toFixed(1)}h, Real: ${client.reales.toFixed(1)}h`
                                ];
                            }
                        }
                    },
                    datalabels: {
                        anchor: 'center',
                        align: 'center',
                        color: '#1a1a2e',
                        font: { weight: 'bold', size: 11 },
                        formatter: (value) => value.toFixed(1)
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: hasRealData ? 'Diferencia (horas)' : 'Horas (planificadas sin utilizar)' },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            callback: (value) => value.toFixed(1)
                        }
                    },
                    y: {
                        grid: { display: false }
                    }
                }
            }
        });
    },

    // Store current data for filtering
    currentComparativoData: null,
    selectedClientId: null,

    updateHeatmap(porCliente) {
        const container = document.getElementById('heatmap-container');
        if (!container) return;

        if (!porCliente || porCliente.length === 0) {
            container.innerHTML = '<div class="comp-heatmap-empty">No hay datos para mostrar</div>';
            return;
        }

        // Check if we have real data
        const hasRealData = porCliente.some(c => c.reales > 0);

        // Sort by planned hours and take all clients
        const sortedClients = [...porCliente]
            .filter(c => c.planificadas > 0 || c.reales > 0)
            .sort((a, b) => b.planificadas - a.planificadas);

        if (sortedClients.length === 0) {
            container.innerHTML = '<div class="comp-heatmap-empty">No hay clientes con horas en el período</div>';
            return;
        }

        // Find max hours for scaling
        const maxHours = Math.max(...sortedClients.map(c => Math.max(c.planificadas, c.reales)));

        // Build HTML
        let html = '';

        if (!hasRealData) {
            html += `<div class="comp-heatmap-warning">
                <i class="fas fa-info-circle"></i>
                Sin datos de COR - Mostrando solo horas planificadas
            </div>`;
        }

        html += '<div class="comp-client-bars">';

        sortedClients.forEach(client => {
            const planWidth = maxHours > 0 ? (client.planificadas / maxHours) * 100 : 0;
            const realWidth = maxHours > 0 ? (client.reales / maxHours) * 100 : 0;
            const clientName = client.cliente_name || 'Sin nombre';
            const displayName = clientName.length > 30 ? clientName.substring(0, 30) + '...' : clientName;

            // Determine status
            let statusClass = '';
            let statusIcon = '';
            if (hasRealData) {
                if (client.varianza_pct >= -10 && client.varianza_pct <= 10) {
                    statusClass = 'eficiente';
                    statusIcon = '<i class="fas fa-check-circle"></i>';
                } else if (client.varianza_pct > 10) {
                    statusClass = 'sobrepasado';
                    statusIcon = '<i class="fas fa-arrow-up"></i>';
                } else {
                    statusClass = 'subutilizado';
                    statusIcon = '<i class="fas fa-arrow-down"></i>';
                }
            }

            html += `
                <div class="comp-client-row ${statusClass}" data-client-id="${client.cliente_id}" onclick="app.filterByClient(${client.cliente_id})" style="cursor: pointer;">
                    <div class="comp-client-name" title="${this.escapeHtml(clientName)}">
                        ${this.escapeHtml(displayName)}
                    </div>
                    <div class="comp-client-bar-container">
                        <div class="comp-client-bar plan" style="width: ${planWidth}%;">
                            <span>${client.planificadas.toFixed(1)}h</span>
                        </div>
                        ${hasRealData ? `
                        <div class="comp-client-bar real" style="width: ${realWidth}%;">
                            <span>${client.reales.toFixed(1)}h</span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="comp-client-status">
                        ${hasRealData ? `${statusIcon} ${client.varianza_pct >= 0 ? '+' : ''}${client.varianza_pct.toFixed(1)}%` : ''}
                    </div>
                </div>
            `;
        });

        html += '</div>';

        // Add legend
        html += `
            <div class="comp-heatmap-legend">
                <span class="comp-heatmap-legend-item"><span style="background: #3498db;"></span> Planificadas</span>
                ${hasRealData ? `<span class="comp-heatmap-legend-item"><span style="background: #9b59b6;"></span> Reales</span>` : ''}
                ${hasRealData ? `
                <span class="comp-heatmap-legend-item"><span style="background: #27ae60;"></span> Eficiente</span>
                <span class="comp-heatmap-legend-item"><span style="background: #e74c3c;"></span> Sobrepasado</span>
                ` : '<span style="color: #666; font-style: italic;">Pendiente datos COR</span>'}
            </div>
        `;

        container.innerHTML = html;
    },

    updateColaboradorChart(detalle) {
        const ctx = document.getElementById('chart-colaborador');
        if (!ctx) return;

        if (this.compCharts.colaborador) {
            this.compCharts.colaborador.destroy();
        }

        if (!detalle || detalle.length === 0) {
            this.compCharts.colaborador = new Chart(ctx, {
                type: 'bar',
                data: { labels: [], datasets: [] },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'Sin datos para mostrar', color: '#999', font: { size: 14 } }
                    }
                }
            });
            return;
        }

        // Aggregate data by collaborator
        const colaboradorMap = {};
        detalle.forEach(row => {
            const colabName = row.colaborador_name || 'Sin asignar';
            if (!colaboradorMap[colabName]) {
                colaboradorMap[colabName] = {
                    planificadas: 0,
                    reales: 0,
                    clientes: {}
                };
            }
            colaboradorMap[colabName].planificadas += row.horas_planificadas || 0;
            colaboradorMap[colabName].reales += row.horas_reales || 0;

            // Track by client for tooltip
            const clientName = row.cliente_name || 'Sin cliente';
            if (!colaboradorMap[colabName].clientes[clientName]) {
                colaboradorMap[colabName].clientes[clientName] = { plan: 0, real: 0 };
            }
            colaboradorMap[colabName].clientes[clientName].plan += row.horas_planificadas || 0;
            colaboradorMap[colabName].clientes[clientName].real += row.horas_reales || 0;
        });

        // Sort by total planned hours and take top 15
        const sortedColabs = Object.entries(colaboradorMap)
            .sort((a, b) => b[1].planificadas - a[1].planificadas)
            .slice(0, 15);

        const labels = sortedColabs.map(([name]) =>
            name.length > 25 ? name.substring(0, 25) + '...' : name
        );

        const hasRealData = sortedColabs.some(([, data]) => data.reales > 0);

        // Prepare datasets
        const datasets = [
            {
                label: 'Planificadas',
                data: sortedColabs.map(([, data]) => data.planificadas),
                backgroundColor: 'rgba(52, 152, 219, 0.7)',
                borderColor: '#2980b9',
                borderWidth: 1
            }
        ];

        if (hasRealData) {
            datasets.push({
                label: 'Reales',
                data: sortedColabs.map(([, data]) => data.reales),
                backgroundColor: 'rgba(155, 89, 182, 0.7)',
                borderColor: '#8e44ad',
                borderWidth: 1
            });
        }

        // Adjust chart height based on number of collaborators
        const container = document.getElementById('chart-colaborador-container');
        if (container) {
            const barHeight = 50;
            const minHeight = 300;
            const calculatedHeight = Math.max(minHeight, sortedColabs.length * barHeight);
            container.style.height = calculatedHeight + 'px';
        }

        this.compCharts.colaborador = new Chart(ctx, {
            type: 'bar',
            plugins: [ChartDataLabels],
            data: { labels, datasets },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            afterBody: (context) => {
                                const idx = context[0].dataIndex;
                                const colabData = sortedColabs[idx][1];
                                const clientList = Object.entries(colabData.clientes)
                                    .sort((a, b) => b[1].plan - a[1].plan)
                                    .slice(0, 5)
                                    .map(([client, hours]) => {
                                        const clientShort = client.length > 20 ? client.substring(0, 20) + '...' : client;
                                        return hasRealData
                                            ? `  ${clientShort}: ${hours.plan.toFixed(1)}h plan / ${hours.real.toFixed(1)}h real`
                                            : `  ${clientShort}: ${hours.plan.toFixed(1)}h`;
                                    });
                                return ['', 'Clientes:', ...clientList];
                            }
                        }
                    },
                    datalabels: {
                        anchor: 'center',
                        align: 'center',
                        color: '#1a1a2e',
                        font: { weight: 'bold', size: 10 },
                        formatter: (value) => value.toFixed(1) + 'h'
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Horas' },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            callback: (value) => value.toFixed(0) + 'h'
                        },
                        beginAtZero: true
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    },

    filterByClient(clientId) {
        // If clicking the same client, deselect (show all)
        if (this.selectedClientId === clientId) {
            this.selectedClientId = null;
        } else {
            this.selectedClientId = clientId;
        }

        // Update visual selection on client rows
        let selectedClientName = '';
        document.querySelectorAll('.comp-client-row').forEach(row => {
            const rowClientId = parseInt(row.dataset.clientId);
            if (this.selectedClientId === null) {
                row.classList.remove('selected');
            } else if (rowClientId === this.selectedClientId) {
                row.classList.add('selected');
                selectedClientName = row.querySelector('.comp-client-name')?.textContent?.trim() || '';
            } else {
                row.classList.remove('selected');
            }
        });

        // Update filter badge and clear button
        const badge = document.getElementById('comp-table-filter-badge');
        const clearBtn = document.getElementById('comp-clear-filter');
        if (badge && clearBtn) {
            if (this.selectedClientId !== null) {
                badge.textContent = `Filtrado: ${selectedClientName}`;
                badge.classList.remove('hidden');
                clearBtn.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
                clearBtn.classList.add('hidden');
            }
        }

        // Filter and update the collaborator chart
        if (this.currentComparativoData) {
            let filteredData = this.currentComparativoData.detalle;
            if (this.selectedClientId !== null) {
                filteredData = filteredData.filter(row => row.cliente_id === this.selectedClientId);
            }
            this.updateColaboradorChart(filteredData);

            // Scroll to chart
            const chartSection = document.getElementById('chart-colaborador-container');
            if (chartSection) {
                chartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    },

    initComparativo() {
        // Initialize date range to last week
        this.initCompDateRange();

        this.loadComparativo();
    },

    async onCompRegionChange() {
        const regionId = document.getElementById('comp-region')?.value;
        await this.populatePaisSelectors(regionId, ['comp-pais']);
        document.getElementById('comp-pais').value = '';
        await this.populateAreasByFilters(regionId, '', ['comp-area']);
        this.loadComparativo();
    },

    async onCompPaisChange() {
        const regionId = document.getElementById('comp-region')?.value;
        const paisId = document.getElementById('comp-pais')?.value;
        await this.populateAreasByFilters(regionId, paisId, ['comp-area']);
        this.loadComparativo();
    }
};

// Expose app globally immediately
window.app = app;

// Function to initialize event listeners
function initAppEvents() {
    console.log('[App] Initializing events...');

    // Login Form Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        // Remove existing listeners by cloning (optional but ensures clean slate)
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);

        newLoginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('[App] Login form submitted');
            app.handleLogin();
        });
        console.log('[App] Login form listener attached');
    } else {
        console.error('[App] Login form not found');
    }

    // Login Button Handler (Backup)
    const loginBtn = document.querySelector('.login-button');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            // Only handle if not inside a form (to avoid double submission) or if form submission fails
            if (!loginBtn.closest('form')) {
                console.log('[App] Login button clicked (no form)');
                app.handleLogin();
            }
        });
    }

    app.init();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppEvents);
} else {
    initAppEvents();
}
