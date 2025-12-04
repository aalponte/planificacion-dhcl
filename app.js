/**
 * Resource Planning App Logic
 * Handles state, navigation, and business logic.
 */

const app = {
    // --- State ---
    state: {
        currentView: 'dashboard',
        config: {
            projects: [],       // { id, name, typeId, assignmentTypeId }
            collaborators: [],  // { id, name }
            projectTypes: [],   // { id, name }
            assignmentTypes: [] // { id, name }
        },
        planning: {}, // { "2025-W10": { "collabId": { "projectId": hours } } }
        ui: {
            currentYear: new Date().getFullYear(),
            currentWeek: 1 // Will be calculated on init
        }
    },

    // --- Initialization ---
    init() {
        this.loadState();
        this.calculateCurrentWeek();
        this.setupNavigation();

        // Initial Data Seeding (if empty)
        if (this.state.config.collaborators.length === 0) {
            this.state.config.collaborators = [
                { id: 'c1', name: 'Juan Perez' },
                { id: 'c2', name: 'Maria Gomez' }
            ];
            this.state.config.projects = [
                { id: 'p1', name: 'App Movil Cliente A', typeId: 'pt1', assignmentTypeId: 'at1' },
                { id: 'p2', name: 'Soporte Legacy', typeId: 'pt2', assignmentTypeId: 'at1' }
            ];
            this.saveState();
        }
    },

    calculateCurrentWeek() {
        const date = new Date();
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((date - oneJan) / (24 * 60 * 60 * 1000));
        this.state.ui.currentWeek = Math.ceil((date.getDay() + 1 + numberOfDays) / 7);

        // Adjust for ISO week date if needed, but simple calc is fine for now
        // Ensure we don't go over 52/53
        if (this.state.ui.currentWeek > 52) this.state.ui.currentWeek = 1;

        // Set selectors
        const yearSelect = document.getElementById('plan-year');
        if (yearSelect) yearSelect.value = this.state.ui.currentYear;
    },

    populateWeekDropdown() {
        const select = document.getElementById('plan-week');
        if (!select) return;
        select.innerHTML = '';
        for (let i = 1; i <= 52; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Semana ${i}`;
            if (i === this.state.ui.currentWeek) option.selected = true;
            select.appendChild(option);
        }

        // Event listeners for selectors
        const yearEl = document.getElementById('plan-year');
        if (yearEl) {
            yearEl.addEventListener('change', (e) => {
                this.state.ui.currentYear = parseInt(e.target.value);
                this.loadPlanning();
            });
        }

        const weekEl = document.getElementById('plan-week');
        if (weekEl) {
            weekEl.addEventListener('change', (e) => {
                this.state.ui.currentWeek = parseInt(e.target.value);
                this.loadPlanning();
            });
        }
    },

    // --- Navigation & UI ---
    setupNavigation() {
        // Handled via onclick in HTML for simplicity
    },

    handleLogin() {
        // Visual only login
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        this.navigateTo('dashboard');
    },

    navigateTo(view) {
        this.state.currentView = view;

        // Update Navbar Active State
        document.querySelectorAll('.nav-menu-item').forEach(el => {
            el.classList.remove('active');
        });

        const activeNav = document.getElementById(`nav-${view}`);
        if (activeNav) {
            activeNav.classList.add('active');
        }

        this.renderView(view);
    },

    renderView(view) {
        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => {
            el.classList.add('hidden');
        });

        // Show current view
        const viewEl = document.getElementById(`view-${view}`);
        if (viewEl) {
            viewEl.classList.remove('hidden');

            // Trigger specific view loads
            if (view === 'planning') {
                this.populateWeekDropdown(); // Ensure dropdown is populated
                this.loadPlanning();
            } else if (view === 'config') {
                this.renderConfig('workers'); // Default to workers tab
            } else if (view === 'dashboard') {
                // this.loadDashboardStats(); // Implement if needed
            }
        }
    },

    // --- Configuration Module ---
    switchConfigTab(tab) {
        document.querySelectorAll('.view-tab').forEach(el => {
            el.classList.remove('active');
        });

        // Find the button that called this (approximate) or just update all matching
        // Since we don't have the event target easily here without passing it, 
        // we can rely on the onclick updating the UI or just re-render.
        // Better: update based on tab name
        const tabBtns = document.querySelectorAll('.view-tab');
        tabBtns.forEach(btn => {
            if (btn.textContent.toLowerCase().includes(tab === 'workers' ? 'colaboradores' : 'proyectos')) {
                btn.classList.add('active');
            }
        });

        document.querySelectorAll('.config-tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`config-${tab}`).classList.remove('hidden');

        this.renderConfig(tab);
    },

    renderConfig(tab) {
        // Inject Delete Button and Select All Logic
        this.injectMassDeleteUI(tab);

        const tbody = document.getElementById(`table-${tab}-body`);
        if (!tbody) return; // For types tab which has 2 tables

        tbody.innerHTML = '';

        if (tab === 'projects') {
            this.state.config.projects.forEach(p => {
                const pType = this.state.config.projectTypes.find(t => t.id === p.typeId)?.name || '-';
                const aType = this.state.config.assignmentTypes.find(t => t.id === p.assignmentTypeId)?.name || '-';

                const tr = document.createElement('tr');
                tr.className = 'bg-white border-b hover:bg-slate-50 transition-colors';
                tr.innerHTML = `
                    <td class="px-6 py-4"><input type="checkbox" class="row-checkbox w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500" value="${p.id}"></td>
                    <td class="px-6 py-4 font-medium text-slate-900">${p.name}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">${pType}</span></td>
                    <td class="px-6 py-4"><span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">${aType}</span></td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="app.openModal('project', '${p.id}')" class="p-2 text-slate-400 hover:text-brand-600 transition-colors mr-2"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="app.deleteItem('projects', '${p.id}')" class="p-2 text-slate-400 hover:text-red-600 transition-colors"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else if (tab === 'collaborators') {
            this.state.config.collaborators.forEach(c => {
                const tr = document.createElement('tr');
                tr.className = 'bg-white border-b hover:bg-slate-50 transition-colors';
                tr.innerHTML = `
                    <td class="px-6 py-4"><input type="checkbox" class="row-checkbox w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500" value="${c.id}"></td>
                    <td class="px-6 py-4 font-medium text-slate-900 flex items-center">
                        <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mr-3 text-xs font-bold">
                            ${c.name.substring(0, 2).toUpperCase()}
                        </div>
                        ${c.name}
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="app.openModal('collaborator', '${c.id}')" class="p-2 text-slate-400 hover:text-brand-600 transition-colors mr-2"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="app.deleteItem('collaborators', '${c.id}')" class="p-2 text-slate-400 hover:text-red-600 transition-colors"><i class="fa-solid fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else if (tab === 'types') {
            this.renderTypesTable('projectTypes', 'table-project-types-body');
            this.renderTypesTable('assignmentTypes', 'table-assignment-types-body');
        }
    },

    injectMassDeleteUI(tab) {
        // Helper to add checkbox header and delete button if not present
        const container = document.getElementById(`config-${tab}`);
        if (!container) return;

        // Add Delete Button if not exists
        let btnContainer = container.querySelector('.mass-delete-container');
        if (!btnContainer) {
            btnContainer = document.createElement('div');
            btnContainer.className = 'mass-delete-container mb-4 flex justify-end';
            btnContainer.innerHTML = `
                <button onclick="app.deleteSelected('${tab}')" class="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-medium transition-colors flex items-center">
                    <i class="fa-solid fa-trash-can mr-2"></i> Eliminar Seleccionados
                </button>
            `;
            // Insert before table
            const table = container.querySelector('table');
            if (table) container.insertBefore(btnContainer, table);
        }

        // Add Checkbox Header if not exists
        const thead = container.querySelector('thead tr');
        if (thead && !thead.querySelector('.select-all-header')) {
            const th = document.createElement('th');
            th.className = 'px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10 select-all-header';
            th.innerHTML = `<input type="checkbox" onchange="app.toggleSelectAll(this, '${tab}')" class="w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500">`;
            thead.insertBefore(th, thead.firstChild);
        }
    },

    renderTypesTable(key, tableId) {
        // Inject UI for types tables specifically
        const table = document.getElementById(tableId).parentElement;
        if (table) {
            // Add Delete Button if not exists (per table)
            let btnContainer = table.parentElement.querySelector(`.mass-delete-container-${key}`);
            if (!btnContainer) {
                btnContainer = document.createElement('div');
                btnContainer.className = `mass-delete-container-${key} mb-2 flex justify-end`;
                btnContainer.innerHTML = `
                    <button onclick="app.deleteSelected('${key}')" class="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium transition-colors flex items-center">
                        <i class="fa-solid fa-trash-can mr-2"></i> Eliminar
                    </button>
                `;
                table.parentElement.insertBefore(btnContainer, table);
            }

            // Add Checkbox Header
            const thead = table.querySelector('thead tr');
            if (thead && !thead.querySelector('.select-all-header')) {
                const th = document.createElement('th');
                th.className = 'px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10 select-all-header';
                th.innerHTML = `<input type="checkbox" onchange="app.toggleSelectAll(this, '${key}')" class="w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500">`;
                thead.insertBefore(th, thead.firstChild);
            }
        }

        const tbody = document.getElementById(tableId);
        tbody.innerHTML = '';
        this.state.config[key].forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'bg-white border-b hover:bg-slate-50 transition-colors';
            tr.innerHTML = `
                <td class="px-6 py-4"><input type="checkbox" class="row-checkbox-${key} w-4 h-4 text-brand-600 bg-gray-100 border-gray-300 rounded focus:ring-brand-500" value="${item.id}"></td>
                <td class="px-6 py-4 font-medium text-slate-900">${item.name}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="app.deleteItem('${key}', '${item.id}')" class="p-2 text-slate-400 hover:text-red-600 transition-colors"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    toggleSelectAll(source, context) {
        let checkboxes;
        if (context === 'projectTypes' || context === 'assignmentTypes') {
            checkboxes = document.querySelectorAll(`.row-checkbox-${context}`);
        } else {
            // For projects/collaborators, context is the tab name
            const container = document.getElementById(`config-${context}`);
            checkboxes = container.querySelectorAll('.row-checkbox');
        }
        checkboxes.forEach(cb => cb.checked = source.checked);
    },

    deleteSelected(context) {
        let ids = [];
        let collection = context;

        if (context === 'projects' || context === 'collaborators') {
            const container = document.getElementById(`config-${context}`);
            const checkboxes = container.querySelectorAll('.row-checkbox:checked');
            checkboxes.forEach(cb => ids.push(cb.value));
        } else {
            // Types
            const checkboxes = document.querySelectorAll(`.row-checkbox-${context}:checked`);
            checkboxes.forEach(cb => ids.push(cb.value));
        }

        if (ids.length === 0) {
            alert('No hay elementos seleccionados.');
            return;
        }

        if (!confirm(`¿Estás seguro de eliminar ${ids.length} elementos?`)) return;

        this.state.config[collection] = this.state.config[collection].filter(i => !ids.includes(i.id));
        this.saveState();

        // Re-render
        if (collection === 'projectTypes' || collection === 'assignmentTypes') {
            this.renderConfig('types');
        } else {
            this.renderConfig(collection);
        }
    },

    deleteItem(collection, id) {
        if (!confirm('¿Estás seguro de eliminar este elemento?')) return;
        this.state.config[collection] = this.state.config[collection].filter(i => i.id !== id);
        this.saveState();
        this.renderConfig(collection === 'projectTypes' || collection === 'assignmentTypes' ? 'types' : collection);
    },

    // --- Modal Logic ---
    openModal(type, id = null) {
        const overlay = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('modal-content');
        const saveBtn = document.getElementById('modal-save-btn');

        overlay.classList.remove('hidden');
        content.innerHTML = '';

        // Determine if editing
        const isEdit = !!id;
        let item = null;

        if (isEdit) {
            if (type === 'project') item = this.state.config.projects.find(i => i.id === id);
            if (type === 'collaborator') item = this.state.config.collaborators.find(i => i.id === id);
            if (type === 'projectType') item = this.state.config.projectTypes.find(i => i.id === id);
            if (type === 'assignmentType') item = this.state.config.assignmentTypes.find(i => i.id === id);
        }

        if (type === 'project') {
            title.textContent = isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto';
            content.innerHTML = `
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-900">Nombre del Proyecto</label>
                    <input type="text" id="input-name" class="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5" placeholder="Ej. Migración Web" value="${item ? item.name : ''}">
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-900">Tipo de Proyecto</label>
                    <select id="input-type" class="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5">
                        <option value="">-- Seleccionar --</option>
                        ${this.state.config.projectTypes.map(t => `<option value="${t.id}" ${item && item.typeId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-900">Tipo de Asignación</label>
                    <select id="input-assignment" class="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5">
                        <option value="">-- Seleccionar --</option>
                        ${this.state.config.assignmentTypes.map(t => `<option value="${t.id}" ${item && item.assignmentTypeId === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                    </select>
                </div>
            `;
            saveBtn.onclick = () => {
                const name = document.getElementById('input-name').value;
                const typeId = document.getElementById('input-type').value;
                const assignmentTypeId = document.getElementById('input-assignment').value;
                if (name) {
                    if (isEdit) {
                        item.name = name;
                        item.typeId = typeId;
                        item.assignmentTypeId = assignmentTypeId;
                    } else {
                        const newId = Date.now().toString();
                        this.state.config.projects.push({ id: newId, name, typeId, assignmentTypeId });
                    }
                    this.saveState();
                    this.renderConfig('projects');
                    this.closeModal();
                }
            };
        } else if (type === 'collaborator') {
            title.textContent = isEdit ? 'Editar Colaborador' : 'Nuevo Colaborador';
            content.innerHTML = `
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-900">Nombre Completo</label>
                    <input type="text" id="input-name" class="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5" placeholder="Ej. Ana Lopez" value="${item ? item.name : ''}">
                </div>
            `;
            saveBtn.onclick = () => {
                const name = document.getElementById('input-name').value;
                if (name) {
                    if (isEdit) {
                        item.name = name;
                    } else {
                        const newId = Date.now().toString();
                        this.state.config.collaborators.push({ id: newId, name });
                    }
                    this.saveState();
                    this.renderConfig('collaborators');
                    this.closeModal();
                }
            };
        } else if (type === 'projectType' || type === 'assignmentType') {
            title.textContent = isEdit ? 'Editar Tipo' : 'Nuevo Tipo';
            content.innerHTML = `
                <div>
                    <label class="block mb-2 text-sm font-medium text-slate-900">Nombre</label>
                    <input type="text" id="input-name" class="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5" value="${item ? item.name : ''}">
                </div>
            `;
            saveBtn.onclick = () => {
                const name = document.getElementById('input-name').value;
                if (name) {
                    if (isEdit) {
                        item.name = name;
                    } else {
                        const newId = Date.now().toString();
                        const collection = type === 'projectType' ? 'projectTypes' : 'assignmentTypes';
                        this.state.config[collection].push({ id: newId, name });
                    }
                    this.saveState();
                    this.renderConfig('types');
                    this.closeModal();
                }
            };
        }
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    },

    // --- Planning Module ---
    loadPlanning() {
        const year = this.state.ui.currentYear;
        const week = this.state.ui.currentWeek;
        const key = `${year}-W${week}`;

        // Ensure entry exists
        if (!this.state.planning[key]) {
            this.state.planning[key] = {};
        }

        const weekData = this.state.planning[key];
        const tbody = document.getElementById('planning-grid-body');
        tbody.innerHTML = '';

        this.state.config.collaborators.forEach(collab => {
            const collabData = weekData[collab.id] || {};

            const tr = document.createElement('tr');
            tr.className = 'bg-white border-b hover:bg-slate-50 transition-colors';

            // Generate Project Inputs
            let projectsHtml = '<div class="space-y-3">';
            this.state.config.projects.forEach(proj => {
                const hours = collabData[proj.id] || 0;

                projectsHtml += `
                    <div class="flex items-center justify-between text-sm group">
                        <span class="text-slate-600 w-1/2 truncate group-hover:text-brand-600 transition-colors" title="${proj.name}">${proj.name}</span>
                        <input type="number" min="0" max="168" step="0.5" 
                            class="w-24 bg-slate-50 border border-slate-200 text-slate-900 rounded-lg focus:ring-brand-500 focus:border-brand-500 p-1.5 text-right planning-input transition-all"
                            data-collab="${collab.id}" data-proj="${proj.id}" value="${hours === 0 ? '' : hours}" placeholder="-">
                    </div>
                `;
            });
            projectsHtml += '</div>';

            // Calculate Total
            const totalHours = Object.values(collabData).reduce((a, b) => a + (parseFloat(b) || 0), 0);
            let totalClass = "text-slate-600";
            if (totalHours > 40) totalClass = "text-red-500";
            if (totalHours > 0 && totalHours <= 40) totalClass = "text-emerald-600";

            tr.innerHTML = `
                <td class="px-6 py-4 font-medium text-slate-900 align-top">
                    <div class="flex items-center">
                         <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mr-3 text-xs font-bold">
                            ${collab.name.substring(0, 2).toUpperCase()}
                        </div>
                        ${collab.name}
                    </div>
                </td>
                <td class="px-6 py-4">${projectsHtml}</td>
                <td class="px-6 py-4 font-bold text-center align-top text-lg ${totalClass}" id="total-${collab.id}">${totalHours}</td>
            `;
            tbody.appendChild(tr);
        });

        // Add listeners for live calculation
        document.querySelectorAll('.planning-input').forEach(input => {
            input.addEventListener('input', (e) => this.handlePlanningInput(e));
        });
    },

    handlePlanningInput(e) {
        const collabId = e.target.dataset.collab;
        const inputs = document.querySelectorAll(`input[data-collab="${collabId}"]`);
        let total = 0;
        inputs.forEach(inp => total += parseFloat(inp.value) || 0);

        const totalEl = document.getElementById(`total-${collabId}`);
        totalEl.textContent = total;

        // Update color
        totalEl.className = "px-6 py-4 font-bold text-center align-top text-lg";
        if (total > 40) totalEl.classList.add("text-red-500");
        else if (total > 0) totalEl.classList.add("text-emerald-600");
        else totalEl.classList.add("text-slate-600");
    },

    savePlanning() {
        const year = this.state.ui.currentYear;
        const week = this.state.ui.currentWeek;
        const key = `${year}-W${week}`;

        const newData = {};

        document.querySelectorAll('.planning-input').forEach(input => {
            const val = parseFloat(input.value);
            if (val > 0) {
                const cId = input.dataset.collab;
                const pId = input.dataset.proj;
                if (!newData[cId]) newData[cId] = {};
                newData[cId][pId] = val;
            }
        });

        this.state.planning[key] = newData;
        this.saveState();

        // Show success feedback
        const btn = document.querySelector('button[onclick="app.savePlanning()"]');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Guardado';
        btn.classList.remove('bg-brand-600', 'hover:bg-brand-700');
        btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.add('bg-brand-600', 'hover:bg-brand-700');
            btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        }, 2000);
    },

    copyPreviousWeek() {
        const year = this.state.ui.currentYear;
        const week = this.state.ui.currentWeek;

        // Logic to find previous week (handle year rollover simply for now)
        let prevWeek = week - 1;
        let prevYear = year;
        if (prevWeek < 1) {
            prevWeek = 52;
            prevYear = year - 1;
        }

        const prevKey = `${prevYear}-W${prevWeek}`;
        const currentKey = `${year}-W${week}`;

        if (this.state.planning[prevKey]) {
            if (confirm(`¿Copiar datos de la Semana ${prevWeek}, ${prevYear}? Esto sobrescribirá los datos actuales.`)) {
                // Deep copy
                this.state.planning[currentKey] = JSON.parse(JSON.stringify(this.state.planning[prevKey]));
                this.saveState();
                this.loadPlanning();
            }
        } else {
            alert('No hay datos registrados en la semana anterior.');
        }
    },

    // --- Dashboard Module ---
    renderDashboard() {
        // Aggregate Data
        let totalHours = 0;
        let activeProjectsSet = new Set();
        let activeCollaboratorsSet = new Set();
        const projectTypeHours = {};
        const clientHours = {};

        Object.values(this.state.planning).forEach(weekData => {
            Object.keys(weekData).forEach(cId => {
                activeCollaboratorsSet.add(cId);
                Object.keys(weekData[cId]).forEach(pId => {
                    const h = weekData[cId][pId];
                    totalHours += h;
                    activeProjectsSet.add(pId);

                    const proj = this.state.config.projects.find(p => p.id === pId);
                    if (proj) {
                        // Type Stats
                        const tName = this.state.config.projectTypes.find(t => t.id === proj.typeId)?.name || 'Otros';
                        projectTypeHours[tName] = (projectTypeHours[tName] || 0) + h;

                        // Client/Project Stats
                        clientHours[proj.name] = (clientHours[proj.name] || 0) + h;
                    }
                });
            });
        });

        // KPIs
        document.getElementById('kpi-total-hours').textContent = totalHours.toLocaleString();
        document.getElementById('kpi-active-projects').textContent = activeProjectsSet.size;
        document.getElementById('kpi-collaborators').textContent = this.state.config.collaborators.length;

        // Utilization (Dummy calc: Total Hours / (Weeks * 40 * Collabs))
        const weeksCount = Object.keys(this.state.planning).length || 1;
        const avgUtil = (totalHours / weeksCount / (this.state.config.collaborators.length || 1)).toFixed(1);
        document.getElementById('kpi-utilization').textContent = `${avgUtil}h`;

        // Charts
        this.renderChart('chart-project-types', 'doughnut', Object.keys(projectTypeHours), Object.values(projectTypeHours), 'Horas por Tipo');

        // Sort clients by hours
        const sortedClients = Object.entries(clientHours).sort((a, b) => b[1] - a[1]).slice(0, 10);
        this.renderChart('chart-clients', 'bar', sortedClients.map(x => x[0]), sortedClients.map(x => x[1]), 'Horas por Proyecto');
    },

    renderChart(canvasId, type, labels, data, label) {
        const ctx = document.getElementById(canvasId).getContext('2d');

        // Destroy existing if any (store instance on canvas)
        if (window[canvasId] instanceof Chart) {
            window[canvasId].destroy();
        }

        window[canvasId] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#14b8a6'
                    ],
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
                },
                scales: type === 'bar' ? {
                    y: { beginAtZero: true, grid: { display: true, drawBorder: false } },
                    x: { grid: { display: false } }
                } : {}
            }
        });
    },

    exportData() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.state));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "resplan_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    importData(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.config && data.planning) {
                    this.state = data;
                    this.saveState();
                    alert('Datos importados correctamente. La página se recargará.');
                    location.reload();
                } else {
                    alert('El archivo no tiene el formato correcto.');
                }
            } catch (err) {
                alert('Error al leer el archivo JSON.');
            }
        };
        reader.readAsText(file);
    },

    // --- Excel Import Logic ---
    importExcel(input) {
        const file = input.files[0];
        if (!file) return;

        // Show Progress Modal
        this.showProgressModal();

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Look for "Nuevas_Hrs (2025)"
                let sheetName = workbook.SheetNames.find(n => n.includes('Nuevas_Hrs') || n.includes('2025'));
                if (!sheetName) {
                    console.warn("Sheet 'Nuevas_Hrs (2025)' not found. Using first sheet.");
                    sheetName = workbook.SheetNames[0];
                }

                console.log("Reading Sheet:", sheetName);
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });

                this.processExcelData(jsonData);
            } catch (err) {
                console.error(err);
                alert("Error al leer el archivo Excel.");
                this.hideProgressModal();
            }
        };
        reader.readAsArrayBuffer(file);
    },

    showProgressModal() {
        let modal = document.getElementById('progress-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'progress-modal';
            modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl p-8 w-96 text-center">
                    <div class="mb-4">
                        <i class="fa-solid fa-circle-notch fa-spin text-4xl text-brand-600"></i>
                    </div>
                    <h3 class="text-lg font-bold text-slate-800 mb-2">Importando Datos...</h3>
                    <p class="text-slate-500 text-sm mb-6" id="progress-text">Procesando archivo...</p>
                    <div class="w-full bg-slate-200 rounded-full h-2.5 mb-1 overflow-hidden">
                        <div id="progress-bar" class="bg-brand-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <p class="text-xs text-slate-400 text-right" id="progress-percent">0%</p>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
        this.updateProgress(0, "Iniciando...");
    },

    hideProgressModal() {
        const modal = document.getElementById('progress-modal');
        if (modal) modal.classList.add('hidden');
    },

    updateProgress(percent, text) {
        const bar = document.getElementById('progress-bar');
        const txt = document.getElementById('progress-text');
        const per = document.getElementById('progress-percent');
        if (bar) bar.style.width = `${percent}%`;
        if (txt) txt.textContent = text;
        if (per) per.textContent = `${Math.floor(percent)}%`;
    },

    processExcelData(rows) {
        if (!rows || rows.length === 0) {
            alert("El archivo Excel parece estar vacío.");
            this.hideProgressModal();
            return;
        }

        // 1. Identify Headers
        const headerRow = rows[0];
        const map = {
            client: -1,     // "Cliente" -> Projects
            collab: -1,     // "Colaborador" -> Collaborators
            projType: -1,   // "Tipo de Proyecto" -> Project Types
            assignType: -1, // "Proyecto" -> Assignment Types (User Request)
        };

        const weekCols = [];

        headerRow.forEach((cell, idx) => {
            if (typeof cell !== 'string') return;
            const lower = cell.trim().toLowerCase();

            if (lower === 'cliente') map.client = idx;
            else if (lower === 'colaborador') map.collab = idx;
            else if (lower === 'tipo de proyecto') map.projType = idx;
            else if (lower === 'proyecto') map.assignType = idx; // User said "Proyecto" col is Assign Type

            // Detect Weeks
            if (lower.includes('sem') || lower.includes('week') || lower.match(/^w\d+$/) || lower.match(/^s\d+$/)) {
                const match = cell.match(/\d+/);
                if (match) {
                    weekCols.push({ idx, week: parseInt(match[0]) });
                }
            }
        });

        console.log("Column Mapping:", map);
        console.log("Week Columns:", weekCols.length);

        if (map.client === -1 || map.collab === -1) {
            alert("No se encontraron las columnas 'Cliente' y 'Colaborador'. Verifique el archivo.");
            this.hideProgressModal();
            return;
        }

        // Helper to find or create ID
        const getOrAdd = (list, name, prefix) => {
            if (!name) return null;
            const strName = String(name).trim();
            if (strName === '') return null;
            let item = list.find(i => i.name.toLowerCase() === strName.toLowerCase());
            if (!item) {
                item = { id: `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`, name: strName };
                list.push(item);
            }
            return item.id;
        };

        // Process in Chunks to allow UI update
        let currentRow = 1;
        const totalRows = rows.length - 1;
        const chunkSize = 100;

        const processChunk = () => {
            const end = Math.min(currentRow + chunkSize, rows.length);

            for (let i = currentRow; i < end; i++) {
                const row = rows[i];
                const clientName = row[map.client];
                const collabName = row[map.collab];
                const projTypeName = map.projType !== -1 ? row[map.projType] : null;
                const assignTypeName = map.assignType !== -1 ? row[map.assignType] : null;

                if (!clientName) continue;

                // 1. Ensure Types
                const pTypeId = getOrAdd(this.state.config.projectTypes, projTypeName, 'pt');
                const aTypeId = getOrAdd(this.state.config.assignmentTypes, assignTypeName, 'at');

                // 2. Ensure Project (Cliente)
                let proj = this.state.config.projects.find(p => p.name === String(clientName).trim());
                if (!proj) {
                    proj = {
                        id: `p_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
                        name: String(clientName).trim(),
                        typeId: pTypeId || null,
                        assignmentTypeId: aTypeId || null
                    };
                    this.state.config.projects.push(proj);
                } else {
                    // Update types if present
                    if (pTypeId) proj.typeId = pTypeId;
                    if (aTypeId) proj.assignmentTypeId = aTypeId;
                }

                // 3. Ensure Collaborator
                let collabId = null;
                if (collabName) {
                    collabId = getOrAdd(this.state.config.collaborators, collabName, 'c');
                }

                // 4. Extract Hours
                if (collabId) {
                    weekCols.forEach(wc => {
                        const val = row[wc.idx];
                        const hours = parseFloat(val);
                        if (!isNaN(hours) && hours > 0) {
                            const year = this.state.ui.currentYear;
                            const key = `${year}-W${wc.week}`;

                            if (!this.state.planning[key]) this.state.planning[key] = {};
                            if (!this.state.planning[key][collabId]) this.state.planning[key][collabId] = {};

                            this.state.planning[key][collabId][proj.id] = hours;
                        }
                    });
                }
            }

            currentRow = end;
            const percent = (currentRow / totalRows) * 100;
            this.updateProgress(percent, `Procesando fila ${currentRow} de ${totalRows}`);

            if (currentRow < rows.length) {
                setTimeout(processChunk, 0); // Schedule next chunk
            } else {
                this.saveState();
                this.updateProgress(100, "¡Completado!");
                setTimeout(() => {
                    this.hideProgressModal();
                    alert(`Importación completada:\n- ${this.state.config.projects.length} Clientes\n- ${this.state.config.collaborators.length} Colaboradores`);
                    location.reload();
                }, 500);
            }
        };

        processChunk();
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
