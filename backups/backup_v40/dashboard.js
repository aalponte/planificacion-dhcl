// ============================================
// Dashboard Analytics Functions
// ============================================

// Register the plugin to all charts:
Chart.register(ChartDataLabels);

let projectTypeChart = null;
let collaboratorChart = null;
let currentProjectTypeFilter = null;

// Initialize dashboard with current week dates (Monday to Sunday)
function initDashboard() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ... 6=Saturday

    // Calculate Monday of the current week
    // If today is Sunday (0), go back 6 days; otherwise go back (dayOfWeek - 1) days
    const monday = new Date(today);
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(today.getDate() - daysToMonday);

    // Sunday is 6 days after Monday
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    document.getElementById('dash-start-date').valueAsDate = monday;
    document.getElementById('dash-end-date').valueAsDate = sunday;

    updateDashboard();
}

// Update dashboard with selected date range
async function updateDashboard() {
    const startDate = document.getElementById('dash-start-date').value;
    const endDate = document.getElementById('dash-end-date').value;

    if (!startDate || !endDate) {
        alert('Por favor selecciona un rango de fechas válido');
        return;
    }

    try {
        const response = await fetch(`/api/dashboard/analytics?startDate=${startDate}&endDate=${endDate}`, {
            credentials: 'include'
        });

        // Handle session expiration - redirect to login
        if (response.status === 401) {
            console.warn('[Dashboard] Session expired, redirecting to login');
            if (typeof app !== 'undefined' && app.logout) {
                app.logout();
            }
            return;
        }

        const data = await response.json();

        // Check for API errors
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Error en la respuesta del servidor');
        }

        // Update KPIs
        document.getElementById('dash-total-hours').textContent = data.kpis.totalHours || 0;
        document.getElementById('dash-active-projects').textContent = data.kpis.activeProjects || 0;
        document.getElementById('dash-active-collaborators').textContent = data.kpis.activeCollaborators || 0;
        document.getElementById('dash-avg-allocation').textContent = `${data.kpis.averageAllocation || 0}h`;

        // New KPIs
        document.getElementById('dash-vacation-collaborators').textContent = data.kpis.vacationCollaborators || 0;
        document.getElementById('dash-training-collaborators').textContent = data.kpis.trainingCollaborators || 0;
        document.getElementById('dash-training-hours').textContent = `${data.kpis.trainingHours || 0}h`;

        // Render charts
        renderProjectTypeChart(data.projectTypeDistribution);
        renderCollaboratorChart(data.collaboratorHours);
    } catch (error) {
        console.error('Error updating dashboard:', error);
        // Show error in console but don't block the UI with an alert
        console.warn('[Dashboard] Failed to load data:', error.message);
    }
}

// Render project type pie chart
function renderProjectTypeChart(data) {
    const ctx = document.getElementById('project-type-chart');

    if (projectTypeChart) {
        projectTypeChart.destroy();
    }

    const colors = [
        '#E63946', '#457B9D', '#F1FAEE', '#A8DADC', '#1D3557',
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'
    ];

    projectTypeChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.map(d => d.type),
            datasets: [{
                data: data.map(d => d.hours),
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 2,
                borderColor: '#fff',
                offset: data.map(() => 0) // Initial offset for all slices
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow custom height
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 15,
                        font: {
                            family: 'Montserrat',
                            size: 12
                        }
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: (value, ctx) => {
                        const percentage = data[ctx.dataIndex].percentage;
                        // Only show if percentage > 5% to avoid clutter
                        return percentage > 5 ? percentage + '%' : '';
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = data[context.dataIndex].percentage;
                            return `${label}: ${value}h (${percentage}%)`;
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    const selectedType = data[index].type;

                    // Toggle filter: if clicking the same slice, clear filter
                    if (currentProjectTypeFilter === selectedType) {
                        currentProjectTypeFilter = null;
                        // Reset all offsets
                        projectTypeChart.data.datasets[0].offset = data.map(() => 0);
                        projectTypeChart.update();

                        // Re-fetch and show all data
                        const startDate = document.getElementById('dash-start-date').value;
                        const endDate = document.getElementById('dash-end-date').value;

                        fetch(`/api/dashboard/analytics?startDate=${startDate}&endDate=${endDate}`, {
                            credentials: 'include'
                        })
                            .then(res => res.json())
                            .then(responseData => {
                                renderCollaboratorChart(responseData.collaboratorHours, null);
                            });
                    } else {
                        currentProjectTypeFilter = selectedType;

                        // Set offset: separate the selected slice
                        projectTypeChart.data.datasets[0].offset = data.map((_, i) => i === index ? 15 : 0);
                        projectTypeChart.update();

                        // Re-fetch data and update collaborator chart with filter
                        const startDate = document.getElementById('dash-start-date').value;
                        const endDate = document.getElementById('dash-end-date').value;

                        fetch(`/api/dashboard/analytics?startDate=${startDate}&endDate=${endDate}`, {
                            credentials: 'include'
                        })
                            .then(res => res.json())
                            .then(responseData => {
                                renderCollaboratorChart(responseData.collaboratorHours, selectedType);
                            });
                    }
                }
            }
        }
    });
}

// Render collaborator hours bar chart
function renderCollaboratorChart(data, filterType = null) {
    const ctx = document.getElementById('collaborator-hours-chart');

    if (collaboratorChart) {
        collaboratorChart.destroy();
    }

    // Filter and prepare data
    let chartData = data.map(collab => {
        let projects = collab.projects;

        // Filter by project type if specified
        if (filterType) {
            projects = projects.filter(p => p.type === filterType);
        }

        return {
            collaborator: collab.collaborator,
            totalHours: projects.reduce((sum, p) => sum + p.hours, 0),
            projects: projects
        };
    }).filter(d => d.totalHours > 0);

    // Sort by total hours descending
    chartData.sort((a, b) => b.totalHours - a.totalHours);

    const labels = chartData.map(d => d.collaborator);

    // Get all unique projects across all collaborators
    const allProjects = new Set();
    chartData.forEach(collab => {
        collab.projects.forEach(p => allProjects.add(p.client));
    });
    const projectList = Array.from(allProjects);

    // Color palette for projects
    const projectColors = [
        '#E63946', '#457B9D', '#1D3557', '#A8DADC', '#F1FAEE',
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F77F00', '#06FFA5', '#9B59B6', '#E74C3C', '#3498DB'
    ];

    // Create datasets - one per project
    const datasets = projectList.map((projectName, index) => {
        return {
            label: projectName,
            data: chartData.map(collab => {
                const project = collab.projects.find(p => p.client === projectName);
                return project ? project.hours : 0;
            }),
            backgroundColor: projectColors[index % projectColors.length],
            borderColor: '#fff',
            borderWidth: 1
        };
    });

    collaboratorChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow custom height
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        padding: 10,
                        font: {
                            family: 'Montserrat',
                            size: 11
                        },
                        boxWidth: 15
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 10
                    },
                    formatter: (value) => {
                        // Only show if value > 0
                        return value > 0 ? value : '';
                    }
                },
                title: {
                    display: filterType ? true : false,
                    text: filterType ? `Filtrado por: ${filterType}` : '',
                    font: {
                        family: 'Montserrat',
                        size: 14,
                        weight: '600'
                    }
                },
                tooltip: {
                    callbacks: {
                        footer: function (tooltipItems) {
                            let total = 0;
                            tooltipItems.forEach(item => {
                                total += item.parsed.y;
                            });
                            return 'Total: ' + total + 'h';
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        callback: function (value) {
                            return value + 'h';
                        }
                    }
                }
            }
        }
    });
}




// Make functions available globally for onclick handlers
window.updateDashboard = updateDashboard;
window.initDashboard = initDashboard;

// NOTE: Don't auto-initialize dashboard here.
// Let app.js control when to load the dashboard after authentication.
// The app.loadDashboard() function will call initDashboard() when appropriate.

// Also add to app object if it exists
if (typeof app !== 'undefined') {
    app.updateDashboard = updateDashboard;
    app.initDashboard = initDashboard;
}
