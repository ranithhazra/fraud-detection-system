const API_BASE = "https://fraud-detection-system-fcb7.onrender.com";

document.addEventListener('DOMContentLoaded', () => {
    // API base URL configuration
    // API base URL configured globally

    // Initialize Theme Switcher
    initTheme();

    // Load top KPIs on dashboard and analytics pages
    loadKPIs();

    // Routing page-specific initializations
    if (document.getElementById('predict-form')) {
        initPredictorPage();
    }
    if (document.getElementById('alerts-container')) {
        initAlertsPage();
    }
});

// ==========================================
// 1. THEME SWITCHING STATE ENGINE
// ==========================================
function initTheme() {
    const darkBtn = document.getElementById('theme-dark-btn');
    const lightBtn = document.getElementById('theme-light-btn');
    
    // Retrieve cached theme or default to dark
    let currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeButtons(currentTheme);

    darkBtn.addEventListener('click', () => setTheme('dark'));
    lightBtn.addEventListener('click', () => setTheme('light'));

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeButtons(theme);
        
        // Dispatch custom event for Chart.js redrawing with new colors
        window.dispatchEvent(new CustomEvent('themechanged', { detail: theme }));
    }

    function updateThemeButtons(theme) {
        if (theme === 'dark') {
            darkBtn.classList.add('active');
            lightBtn.classList.remove('active');
        } else {
            lightBtn.classList.add('active');
            darkBtn.classList.remove('active');
        }
    }
}

// ==========================================
// 2. TOP KPI POPULATOR HELPERS
// ==========================================
async function loadKPIs() {
    const totalEl = document.getElementById('kpi-total');
    const genuineEl = document.getElementById('kpi-genuine');
    const fraudEl = document.getElementById('kpi-fraud');
    const rateEl = document.getElementById('kpi-rate');

    if (!totalEl) return; // Not on dashboard or analytics page

    try {
        const res = await fetch(`${API_BASE}/api/analytics`);
        const result = await res.json();
        
        if (result.status === 'success') {
            const kpi = result.data.kpi;
            
            // Format numbers with commas
            totalEl.textContent = kpi.total_transactions.toLocaleString();
            genuineEl.textContent = kpi.genuine_transactions.toLocaleString();
            fraudEl.textContent = kpi.fraud_transactions.toLocaleString();
            rateEl.textContent = `${kpi.fraud_percentage}%`;
            
            // Dynamically adjust header threat system status
            const threatText = document.getElementById('threat-text');
            const threatBadge = document.getElementById('threat-badge');
            
            if (threatText && threatBadge) {
                if (kpi.fraud_transactions > 10) {
                    threatBadge.className = "threat-badge high";
                    threatText.textContent = "Status: Critical Threat Alert";
                } else if (kpi.fraud_transactions > 0) {
                    threatBadge.className = "threat-badge elevated";
                    threatText.textContent = `Status: ${kpi.fraud_transactions} Warnings Active`;
                } else {
                    threatBadge.className = "threat-badge low";
                    threatText.textContent = "Status: Vault Secure";
                }
            }
        }
    } catch (err) {
        console.error('Error fetching KPIs:', err);
    }
}

// ==========================================
// 3. CORE TRANSACTION TESTER SIMULATOR
// ==========================================
function initPredictorPage() {
    const form = document.getElementById('predict-form');
    const loadGenuineBtn = document.getElementById('btn-load-genuine');
    const loadFraudBtn = document.getElementById('btn-load-fraud');
    
    // Output UI blocks
    const emptyState = document.getElementById('output-empty-state');
    const spinner = document.getElementById('output-spinner');
    const outputData = document.getElementById('output-data');

    // 1. Hook templates load click events
    loadGenuineBtn.addEventListener('click', () => loadTemplate('genuine'));
    loadFraudBtn.addEventListener('click', () => loadTemplate('fraud'));

    // 2. Form submission handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // UI states
        emptyState.style.display = 'none';
        outputData.style.display = 'none';
        spinner.style.display = 'block';

        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            // Convert to numbers if numeric inputs
            if (['amt', 'lat', 'long', 'merch_lat', 'merch_long', 'city_pop', 'zip'].includes(key)) {
                data[key] = parseFloat(value);
            } else {
                data[key] = value;
            }
        });

        try {
            const res = await fetch(`${API_BASE}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const response = await res.json();
            
            spinner.style.display = 'none';
            
            if (response.status === 'success') {
                renderPrediction(response.data);
                loadKPIs();            // Reload top metrics counters
                loadTransactionLog();  // Reload recent logs table
            } else {
                showPredictionError(response.message);
            }
        } catch (err) {
            spinner.style.display = 'none';
            showPredictionError("Server communication failed. Ensure backend Flask is running.");
        }
    });

    // 3. Load initial logs table
    loadTransactionLog();

    // Populate transaction simulator templates
    function loadTemplate(type) {
        const templates = {
            genuine: {
                merchant: "fraud_Krunck",
                category: "grocery_pos",
                amt: 58.42,
                gender: "F",
                city: "Phoenix",
                state: "AZ",
                zip: 85001,
                city_pop: 1600000,
                lat: 33.4484,
                long: -112.0740,
                merch_lat: 33.4812,
                merch_long: -112.1023,
                job: "Software Engineer",
                dob: "1992-05-15",
                trans_date_trans_time: ""
            },
            fraud: {
                merchant: "fraud_Rippin",
                category: "shopping_net",
                amt: 985.50,
                gender: "M",
                city: "Dallas",
                state: "TX",
                zip: 75201,
                city_pop: 1340000,
                lat: 32.7767,
                long: -96.7970,
                merch_lat: 35.1205,
                merch_long: -110.1542,
                job: "Teacher",
                dob: "1975-10-22",
                trans_date_trans_time: new Date().getFullYear() + "-06-03 02:15:30" // early morning flag
            }
        };

        const t = templates[type];
        Object.keys(t).forEach(key => {
            const input = document.getElementById(key);
            if (input) {
                input.value = t[key];
            }
        });
    }

    function renderPrediction(data) {
        outputData.style.display = 'block';
        
        // Probability Gauge animation
        const percentage = Math.round(data.probability * 100);
        document.getElementById('gauge-val').textContent = `${percentage}%`;
        
        const circle = document.getElementById('gauge-circle');
        const r = 70;
        const circ = 2 * Math.PI * r; // 439.6
        const offset = circ - (data.probability * circ);
        circle.style.strokeDashoffset = offset;

        // Apply risk colors based on probability
        const badge = document.getElementById('output-badge');
        badge.textContent = data.status;
        
        if (data.prediction === 1) {
            badge.className = "result-badge fraud";
            circle.style.stroke = "var(--danger)";
        } else if (data.probability >= 0.20) {
            badge.className = "result-badge";
            badge.style.backgroundColor = "var(--warning-bg)";
            badge.style.color = "var(--warning)";
            badge.style.borderColor = "var(--warning)";
            circle.style.stroke = "var(--warning)";
        } else {
            badge.className = "result-badge genuine";
            circle.style.stroke = "var(--success)";
        }

        // Fill detail rows
        document.getElementById('detail-id').textContent = data.transaction_id;
        document.getElementById('detail-status').textContent = `${data.status} (${data.risk_level} Risk)`;
        document.getElementById('detail-distance').textContent = `${data.engineered_features.distance.toFixed(2)} units`;
        document.getElementById('detail-age').textContent = `${data.engineered_features.age} yrs`;
        document.getElementById('detail-time').textContent = `${data.engineered_features.hour}:00h (Day ${data.engineered_features.day_of_week})`;
    }

    function showPredictionError(msg) {
        outputData.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.querySelector('h3').textContent = "Prediction Error";
        emptyState.querySelector('p').textContent = msg;
    }
}

// ==========================================
// 4. LIVE TRANSACTION LOG TABLE
// ==========================================
async function loadTransactionLog() {
    const tbody = document.getElementById('transaction-log-body');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE}/api/transactions?limit=10`);
        const result = await res.json();
        
        if (result.status === 'success' && result.count > 0) {
            tbody.innerHTML = '';
            result.data.forEach(tx => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight: 700; font-family: 'Outfit';">${tx.transaction_id}</td>
                    <td>${tx.timestamp}</td>
                    <td>${tx.merchant}</td>
                    <td>${tx.category}</td>
                    <td style="font-weight: 600;">$${tx.amount.toFixed(2)}</td>
                    <td><span class="risk-pill ${tx.risk_level.toLowerCase()}">${tx.risk_level}</span></td>
                    <td><span class="status-pill ${tx.status.toLowerCase()}">${tx.status}</span></td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No transactions queried yet.</td></tr>`;
        }
    } catch (err) {
        console.error('Error fetching transaction logs:', err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Failed to query logs.</td></tr>`;
    }
}

// ==========================================
// 5. SECURE ALERTS FEED RESOLUTION WORKFLOW
// ==========================================
async function initAlertsPage() {
    const container = document.getElementById('alerts-container');
    const refreshBtn = document.getElementById('btn-refresh-alerts');
    const headerBadgeText = document.getElementById('threat-text');
    const headerBadge = document.getElementById('threat-badge');

    refreshBtn.addEventListener('click', loadAlertsList);
    
    // Initial fetch
    loadAlertsList();

    async function loadAlertsList() {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <div class="spinner" style="margin: 0 auto 1rem;"></div>
                <span>Syncing threat alerts queue...</span>
            </div>
        `;
        
        try {
            const res = await fetch(`${API_BASE}/api/alerts?limit=50`);
            const result = await res.json();
            
            if (result.status === 'success') {
                renderAlerts(result.data);
            } else {
                container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--danger);">Error loaded alerts feed: ${result.message}</div>`;
            }
        } catch (err) {
            container.error('Alerts error:', err);
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--danger);">Connection lost. Ensure the API server is online.</div>`;
        }
    }

    function renderAlerts(alerts) {
        // Adjust alert status counters
        const summaryTitle = document.getElementById('alerts-title-summary');
        if (summaryTitle) {
            summaryTitle.textContent = `${alerts.length} Active Threat Alert${alerts.length !== 1 ? 's' : ''}`;
        }
        if (headerBadge && headerBadgeText) {
            if (alerts.length > 0) {
                headerBadge.className = "threat-badge high";
                headerBadgeText.textContent = `Alerts Queue: ${alerts.length} Flagged`;
            } else {
                headerBadge.className = "threat-badge low";
                headerBadgeText.textContent = "System Status: Clean";
            }
        }

        if (alerts.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <h3 style="font-family: 'Outfit'; color: var(--text-primary);">Vault Secure</h3>
                    <p style="max-width: 400px; font-size: 0.9rem;">No transactions have been flagged as fraudulent by the machine learning engine.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        alerts.forEach(al => {
            const item = document.createElement('div');
            item.className = 'alert-item';
            item.id = `alert-${al.transaction_id}`;
            
            // Format probability percentage
            const pct = Math.round(al.probability * 100);
            
            item.innerHTML = `
                <div class="alert-info">
                    <div class="alert-title">
                        <span style="color: var(--danger); font-family: 'Outfit';">${al.transaction_id}</span>
                        <span class="risk-pill ${al.risk_level.toLowerCase()}">${al.risk_level} Risk (${pct}%)</span>
                    </div>
                    <div class="alert-meta">
                        <span><strong>Time:</strong> ${al.timestamp}</span>
                        <span>•</span>
                        <span><strong>Merchant:</strong> ${al.merchant}</span>
                        <span>•</span>
                        <span><strong>Category:</strong> ${al.category}</span>
                    </div>
                    
                    <div class="alert-details-grid">
                        <div class="alert-detail-item">
                            <span class="alert-detail-label">Amount</span>
                            <span class="alert-detail-value" style="color: var(--danger); font-family: 'Outfit'; font-size: 0.95rem;">$${al.amount.toFixed(2)}</span>
                        </div>
                        <div class="alert-detail-item">
                            <span class="alert-detail-label">Location</span>
                            <span class="alert-detail-value">${al.city}, ${al.state} (Dist: ${al.distance.toFixed(2)} units)</span>
                        </div>
                        <div class="alert-detail-item">
                            <span class="alert-detail-label">Cardholder</span>
                            <span class="alert-detail-value">Age ${al.age} | ${al.job}</span>
                        </div>
                    </div>
                </div>
                
                <div class="alert-actions">
                    <button class="btn-primary" style="margin-top: 0; padding: 0.5rem 1rem; font-size: 0.8rem; background: var(--accent-gradient);" onclick="resolveAlert('${al.transaction_id}', 'freeze')">
                        Freeze Card
                    </button>
                    <button class="btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick="resolveAlert('${al.transaction_id}', 'dismiss')">
                        Dismiss
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }
}

// Global resolve handler referenced by alerts onclick
window.resolveAlert = function(txId, action) {
    const alertRow = document.getElementById(`alert-${txId}`);
    if (!alertRow) return;

    // Apply clean slide-out animations
    alertRow.style.opacity = '0';
    alertRow.style.transform = 'translateX(20px)';
    
    setTimeout(() => {
        alertRow.remove();
        
        // Update header alerts tally dynamically
        const activeAlerts = document.querySelectorAll('.alert-item');
        const summaryTitle = document.getElementById('alerts-title-summary');
        const headerBadgeText = document.getElementById('threat-text');
        const headerBadge = document.getElementById('threat-badge');
        
        if (summaryTitle) {
            summaryTitle.textContent = `${activeAlerts.length} Active Threat Alert${activeAlerts.length !== 1 ? 's' : ''}`;
        }
        
        if (activeAlerts.length === 0) {
            const container = document.getElementById('alerts-container');
            if (container) {
                container.innerHTML = `
                    <div class="card" style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        <h3 style="font-family: 'Outfit'; color: var(--text-primary);">Vault Secure</h3>
                        <p style="max-width: 400px; font-size: 0.9rem;">All threats resolved successfully.</p>
                    </div>
                `;
            }
            if (headerBadge && headerBadgeText) {
                headerBadge.className = "threat-badge low";
                headerBadgeText.textContent = "System Status: Clean";
            }
        } else {
            if (headerBadge && headerBadgeText) {
                headerBadge.className = "threat-badge high";
                headerBadgeText.textContent = `Alerts Queue: ${activeAlerts.length} Flagged`;
            }
        }
        
        // Show simulated action toast
        const toastMsg = action === 'freeze' ? `Card associated with transaction ${txId} has been Frozen.` : `Alert ${txId} dismissed.`;
        alert(toastMsg); // Simple fallback alert modal
    }, 300);
};
