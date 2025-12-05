/**
 * Gestor de Planificación - LLYC
 * Secure Version
 */

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
        usuarios: [],
        currentAllocations: [],
        editingRecord: null,
        importingTable: null,
        currentUser: null, // Stores logged-in user info
        selectedAreaId: null // Currently selected area for filtering
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
        }
    },

    async loadInitialData() {
        try {
            const [colabRes, clientesRes, proyRes, tiposRes, areasRes] = await Promise.all([
                fetch('/api/config/colaboradores', { credentials: 'include' }),
                fetch('/api/config/clientes', { credentials: 'include' }),
                fetch('/api/config/proyectos', { credentials: 'include' }),
                fetch('/api/config/tipos', { credentials: 'include' }),
                fetch('/api/config/areas', { credentials: 'include' })
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

            // Sort areas by ID ascending to ensure the lowest ID is first
            this.state.areas.sort((a, b) => a.id - b.id);

            // Set default selected area based on user
            if (this.state.currentUser && this.state.currentUser.id_area) {
                this.state.selectedAreaId = this.state.currentUser.id_area;
            } else if (this.state.areas.length > 0) {
                // Select the area with the lowest ID (first after sorting)
                this.state.selectedAreaId = this.state.areas[0].id;
            }

            // Populate area selectors
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
        try {
            let url = `/api/allocations?year=${year}&week=${week}`;
            if (areaId) url += `&id_area=${areaId}`;
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

        if (yearSelect && yearSelect.options.length === 0) {
            this.populateViewerYearSelector();
        }
        if (weekSelect && weekSelect.options.length === 0) {
            await this.populateViewerWeekDropdown();
        }

        const year = yearSelect?.value || this.state.currentYear;
        const week = weekSelect?.value || this.state.currentWeek;
        const areaId = areaSelect?.value || this.state.selectedAreaId;

        try {
            let url = `/api/allocations?year=${year}&week=${week}`;
            if (areaId) url += `&id_area=${areaId}`;
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

        // Get area id
        const areaId = document.getElementById('plan-area')?.value;
        if (!areaId) {
            alert('Por favor selecciona un área primero.');
            return;
        }

        // Fetch previous day's allocations for this collaborator
        const year = prevDate.getFullYear();
        const prevWeek = app.getISOWeek(prevDate);

        try {
            const response = await fetch(`/api/allocations?year=${year}&week=${prevWeek}&id_area=${areaId}`, {
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
            await app.loadPlanningData();
            alert(`Se copiaron ${prevDayAllocations.length} asignación(es) exitosamente.`);

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
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.querySelectorAll('.config-tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`config-${tab}`).classList.remove('hidden');

        // Load usuarios data if switching to that tab
        if (tab === 'usuarios') {
            this.loadUsuarios().then(() => this.renderConfigTable(tab));
        } else if (tab === 'areas') {
            this.loadAreas().then(() => this.renderConfigTable(tab));
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
            tr.innerHTML = `
                <td><input type="checkbox" class="row-checkbox" data-id="${parseInt(item.id)}"></td>
                <td>${parseInt(item.id)}</td>
                <td>${this.escapeHtml(item.name)}</td>
                ${table === 'clientes' ? `<td><span class="text-red">${this.escapeHtml(item.proyecto_name) || '-'}</span></td><td><span class="text-red">${this.escapeHtml(item.tipo_name) || '-'}</span></td><td>${areaLabel}</td>` : ''}
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
                alert(data.error || 'Error al guardar usuario');
                return;
            }

            this.closeUserModal();
            await this.loadUsuarios();
            this.renderConfigTable('usuarios');
        } catch (error) {
            console.error('[App] Error saving user:', error);
            alert('Error al guardar usuario: ' + error.message);
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
            'areas': 'Área'
        };
        document.getElementById('modal-title').textContent = `Añadir ${tableLabels[table] || table}`;
        document.getElementById('record-name').value = '';
        document.getElementById('cliente-fields').classList.toggle('hidden', table !== 'clientes');

        // Show/hide colaborador area field
        const colaboradorAreaField = document.getElementById('colaborador-area-field');
        if (colaboradorAreaField) {
            colaboradorAreaField.classList.toggle('hidden', table !== 'colaboradores');
            if (table === 'colaboradores') {
                const areaSelect = document.getElementById('colaborador-area');
                areaSelect.innerHTML = '<option value="">-- Sin área --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
                // Default to currently selected area
                if (this.state.selectedAreaId) {
                    areaSelect.value = this.state.selectedAreaId;
                }
            }
        }

        if (table === 'clientes') {
            const proySelect = document.getElementById('record-proyecto');
            const tipoSelect = document.getElementById('record-tipo');
            const areaSelect = document.getElementById('record-area');
            proySelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.proyectos.map(p => `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`).join('');
            tipoSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.tipos.map(t => `<option value="${t.id}">${this.escapeHtml(t.name)}</option>`).join('');
            if (areaSelect) {
                areaSelect.innerHTML = '<option value="">-- Seleccionar --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
                // Default to currently selected area
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
            'areas': 'Área'
        };
        document.getElementById('modal-title').textContent = `Editar ${tableLabels[table] || table}`;
        document.getElementById('record-name').value = item.name;
        document.getElementById('cliente-fields').classList.toggle('hidden', table !== 'clientes');

        // Show/hide colaborador area field
        const colaboradorAreaField = document.getElementById('colaborador-area-field');
        if (colaboradorAreaField) {
            colaboradorAreaField.classList.toggle('hidden', table !== 'colaboradores');
            if (table === 'colaboradores') {
                const areaSelect = document.getElementById('colaborador-area');
                areaSelect.innerHTML = '<option value="">-- Sin área --</option>' + this.state.areas.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
                areaSelect.value = item.id_area || '';
            }
        }

        if (table === 'clientes') {
            const proySelect = document.getElementById('record-proyecto');
            const tipoSelect = document.getElementById('record-tipo');
            const areaSelect = document.getElementById('record-area');
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
        if (table === 'clientes') {
            // Fix: Map dropdown values to the correct backend field names
            body.id_proyecto = document.getElementById('record-proyecto').value || null;
            body.id_tipo_proyecto = document.getElementById('record-tipo').value || null;
            const areaSelect = document.getElementById('record-area');
            body.id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : null;
        }
        if (table === 'colaboradores') {
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
            await this.loadInitialData();
            this.renderConfigTable(table);
            this.closeModal();
        } catch (error) {
            console.error('[Config] Error saving:', error);
            alert('Error al guardar');
        }
    },

    async deleteRecord(table, id) {
        if (!confirm('¿Estás seguro de eliminar este registro?')) return;
        try {
            await fetch(`/api/config/${table}/${id}`, { method: 'DELETE', credentials: 'include' });
            await this.loadInitialData();
            this.renderConfigTable(table);
        } catch (error) {
            console.error('[Config] Error deleting:', error);
            alert('Error al eliminar');
        }
    },

    async deleteSelected(table) {
        const checkboxes = document.querySelectorAll(`#table-${table} .row-checkbox:checked`);
        if (checkboxes.length === 0) {
            alert('No hay registros seleccionados');
            return;
        }
        if (!confirm(`¿Eliminar ${checkboxes.length} registro(s)?`)) return;
        try {
            await Promise.all(Array.from(checkboxes).map(cb =>
                fetch(`/api/config/${table}/${cb.dataset.id}`, { method: 'DELETE', credentials: 'include' })
            ));
            await this.loadInitialData();
            this.renderConfigTable(table);
        } catch (error) {
            console.error('[Config] Error deleting:', error);
            alert('Error al eliminar');
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
            alert('Importación exitosa');
        } catch (error) {
            console.error('[Import] Error:', error);
            alert('Error al importar');
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
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : this.state.selectedAreaId;

        console.log('[Allocation] Guardando:', { id, colaboradorId, clienteId, hours, date, year, week, id_area });

        if (!clienteId || !hours || !date) {
            alert('Completa todos los campos');
            return;
        }
        const body = { colaborador_id: colaboradorId, cliente_id: clienteId, hours, date, year, week_number: week, id_area };

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
            alert('Cambios guardados correctamente');
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
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : this.state.selectedAreaId;

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
                    id_area
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

            alert(`Semana ${currentWeek}/${currentYear} copiada exitosamente a semana ${nextWeek}/${nextYear}`);
        } catch (error) {
            console.error('[Planning] Error copying:', error);
            alert('Error al copiar semana: ' + error.message);
        }
    },

    async createNewPlanning() {
        const currentYear = parseInt(document.getElementById('plan-year').value);
        const currentWeek = parseInt(document.getElementById('plan-week').value);
        const areaSelect = document.getElementById('plan-area');
        const id_area = areaSelect && areaSelect.value ? parseInt(areaSelect.value) : this.state.selectedAreaId;

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
                        id_area
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

            alert(`Nueva planificación creada para semana ${nextWeek}/${nextYear}.\n\nSe crearon ${createdCount} registros vacíos para los colaboradores.\nAhora puedes asignar horas usando el botón "+".`);
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

            alert(`Planificación de ${colaborador_name} eliminada (${result.changes} asignaciones)`);
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

            alert(`Semana ${week}/${year} eliminada completamente (${result.changes} asignaciones)`);
        } catch (error) {
            console.error('[Delete Week] Error:', error);
            alert('Error al eliminar planificación de la semana: ' + error.message);
        }
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
