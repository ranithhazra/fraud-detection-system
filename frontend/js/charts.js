let categoryChart, hourlyChart, riskChart, volumeChart;

document.addEventListener('DOMContentLoaded', () => {
    // Only load charts if canvas elements exist (i.e. on analytics.html)
    if (document.getElementById('categoryChart')) {
        loadAnalyticsCharts();
        
        // Listen to theme change events to dynamically swap chart grid/label colors
        window.addEventListener('themechanged', (e) => {
            const isDark = e.detail === 'dark';
            updateChartThemes(isDark);
        });
    }
});

async function loadAnalyticsCharts() {
    try {
        // Fetch core analytics
        const res = await fetch(`${window.location.origin}/api/analytics`);
        const result = await res.json();
        
        // Fetch recent transactions (up to 100) to calculate risk distribution
        const txRes = await fetch(`${window.location.origin}/api/transactions?limit=100`);
        const txResult = await txRes.json();
        
        if (result.status === 'success' && txResult.status === 'success') {
            const data = result.data;
            
            // Count risk levels dynamically from fetched transactions
            let lowCount = 0;
            let medCount = 0;
            let highCount = 0;
            
            txResult.data.forEach(tx => {
                const risk = (tx.risk_level || 'low').toLowerCase();
                if (risk === 'high') highCount++;
                else if (risk === 'medium') medCount++;
                else lowCount++;
            });
            
            data.risk_distribution = {
                low: lowCount,
                medium: medCount,
                high: highCount
            };
            
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const isDark = currentTheme === 'dark';
            
            buildCharts(data, isDark);
        } else {
            console.error("Failed to load analytics: ", result.message);
        }
    } catch (err) {
        console.error("Error communicating with analytics API: ", err);
    }
}

// Helper to determine text and grid colors based on theme
function getThemeColors(isDark) {
    return {
        text: isDark ? '#94a3b8' : '#64748b',
        grid: isDark ? '#1e293b' : '#e2e8f0',
        tooltipBg: isDark ? '#0f172a' : '#ffffff',
        tooltipBorder: isDark ? '#334155' : '#e2e8f0',
        tooltipText: isDark ? '#f8fafc' : '#0f172a'
    };
}

function buildCharts(analyticsData, isDark) {
    const colors = getThemeColors(isDark);
    
    // Set global Chart.js font defaults
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = colors.text;

    // ==========================================
    // CHART 1: Category Distribution (Genuine vs Fraud)
    // ==========================================
    const catData = analyticsData.category_breakdown;
    const catLabels = catData.map(c => c.category.replace('_pos', ' (POS)').replace('_net', ' (Web)'));
    const catGenuine = catData.map(c => c.genuine);
    const catFraud = catData.map(c => c.fraud);

    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    categoryChart = new Chart(ctxCat, {
        type: 'bar',
        data: {
            labels: catLabels,
            datasets: [
                {
                    label: 'Genuine',
                    data: catGenuine,
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1.5,
                    borderRadius: 4
                },
                {
                    label: 'Fraud',
                    data: catFraud,
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1.5,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: colors.text } }
            },
            scales: {
                x: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, stepSize: 1 },
                    beginAtZero: true
                }
            }
        }
    });

    // ==========================================
    // CHART 2: Hourly Fraud Patterns (Line Chart)
    // ==========================================
    const hourlyData = analyticsData.hourly_trends;
    
    // Pre-fill all 24 hours to ensure continuous chart flow
    const hourlyMap = {};
    for (let h = 0; h < 24; h++) {
        hourlyMap[h] = { total: 0, fraud: 0 };
    }
    hourlyData.forEach(h => {
        hourlyMap[h.hour] = { total: h.total, fraud: h.fraud };
    });

    const hours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
    const hourlyTotal = hours.map((_, i) => hourlyMap[i].total);
    const hourlyFraud = hours.map((_, i) => hourlyMap[i].fraud);

    const ctxHour = document.getElementById('hourlyChart').getContext('2d');
    hourlyChart = new Chart(ctxHour, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [
                {
                    label: 'Total Volume',
                    data: hourlyTotal,
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Fraud Flagged',
                    data: hourlyFraud,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 2.5,
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: colors.text } }
            },
            scales: {
                x: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: colors.grid },
                    ticks: { color: colors.text, stepSize: 1 },
                    beginAtZero: true
                }
            }
        }
    });

    // ==========================================
    // CHART 3: Risk Distribution (Doughnut Chart)
    // ==========================================
    const riskData = analyticsData.risk_distribution;
    const riskLabels = ['Low Risk', 'Medium Risk', 'High Risk'];
    const riskCounts = [riskData.low, riskData.medium, riskData.high];

    const ctxRisk = document.getElementById('riskChart').getContext('2d');
    riskChart = new Chart(ctxRisk, {
        type: 'doughnut',
        data: {
            labels: riskLabels,
            datasets: [{
                data: riskCounts,
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',  // Green for Low
                    'rgba(245, 158, 11, 0.7)',  // Orange for Medium
                    'rgba(239, 68, 68, 0.7)'    // Red for High
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: colors.text }
                }
            },
            cutout: '60%'
        }
    });

    // ==========================================
    // CHART 4: Volume Breakdown (Pie Chart)
    // ==========================================
    const kpis = analyticsData.kpi;
    const ctxVol = document.getElementById('volumeChart').getContext('2d');
    volumeChart = new Chart(ctxVol, {
        type: 'pie',
        data: {
            labels: ['Genuine', 'Fraud'],
            datasets: [{
                data: [kpis.genuine_transactions, kpis.fraud_transactions],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(239, 68, 68, 0.7)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: colors.text }
                }
            }
        }
    });
}

// Function triggered on window 'themechanged' event
function updateChartThemes(isDark) {
    const colors = getThemeColors(isDark);
    
    const charts = [categoryChart, hourlyChart, riskChart, volumeChart];
    
    charts.forEach(chart => {
        if (!chart) return;
        
        // Update general font color
        chart.options.plugins.legend.labels.color = colors.text;
        
        // If the chart uses linear axes, update grid lines
        if (chart.options.scales) {
            if (chart.options.scales.x) {
                chart.options.scales.x.grid.color = colors.grid;
                chart.options.scales.x.ticks.color = colors.text;
            }
            if (chart.options.scales.y) {
                chart.options.scales.y.grid.color = colors.grid;
                chart.options.scales.y.ticks.color = colors.text;
            }
        }
        
        chart.update();
    });
}
