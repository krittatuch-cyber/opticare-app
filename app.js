/* ==========================================================================
   OptiCare Frontend Engine - Bilingual Single Page Application
   ========================================================================== */

const API_BASE = "/api";

// Global fetch interceptor to inject logged in user headers
const originalFetch = window.fetch;
window.fetch = function(url, options) {
    options = options || {};
    if (!options.headers) {
        options.headers = {};
    }
    if (state && state.user) {
        if (options.headers instanceof Headers) {
            options.headers.set("X-User-Id", String(state.user.id));
            options.headers.set("X-User-Name", state.user.username);
        } else if (Array.isArray(options.headers)) {
            options.headers.push(["X-User-Id", String(state.user.id)]);
            options.headers.push(["X-User-Name", state.user.username]);
        } else {
            options.headers["X-User-Id"] = String(state.user.id);
            options.headers["X-User-Name"] = state.user.username;
        }
    }
    return originalFetch(url, options);
};

// 1. Global Application State
let state = {
    lang: "th",
    theme: "light",
    activeBranchId: 1,
    activePage: "dashboard",
    user: null,
    branches: [],
    customers: [],
    inventory: [],
    appointments: [],
    // POS Cart State
    cart: [],
    cartDiscount: 0,
    cartDeposit: 0,
    posSelectedCustomer: null, // null means Walk-in
    posPaymentMethod: "Cash",
    isSplitPayment: false,
    posSplitPayments: { Cash: 0, "Bank Transfer": 0, "Credit Card": 0 },
    reportsChartInstances: {},
    categories: [],
    activeReportsTab: "sales",
    reportsData: null,
    activeUsersTab: "directory"
};

// 2. Translation Helper
function t(key) {
    if (TRANSLATIONS[state.lang] && TRANSLATIONS[state.lang][key]) {
        return TRANSLATIONS[state.lang][key];
    }
    return key;
}

function calculateAge(dob, dateLimit = null) {
    if (!dob) return "-";
    const birthDate = new Date(dob);
    const limitDate = dateLimit ? new Date(dateLimit) : new Date();
    if (isNaN(birthDate.getTime())) return "-";
    
    let age = limitDate.getFullYear() - birthDate.getFullYear();
    const m = limitDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && limitDate.getDate() < birthDate.getDate())) {
        age--;
    }
    return age >= 0 ? age : 0;
}

// Translate the static HTML labels
function updateLanguageUI() {
    // Menu items
    document.getElementById("lbl-menu-dashboard").innerText = t("menu_dashboard");
    document.getElementById("lbl-menu-customers").innerText = t("menu_customers");
    document.getElementById("lbl-menu-inventory").innerText = t("menu_inventory");
    document.getElementById("lbl-menu-pos").innerText = t("menu_pos");
    document.getElementById("lbl-menu-appointments").innerText = t("menu_appointments");
    document.getElementById("lbl-menu-users").innerText = t("menu_users");
    document.getElementById("lbl-menu-reports").innerText = t("menu_reports");
    document.getElementById("lbl-menu-settings").innerText = t("menu_settings");

    // Menu groups
    const grpCore = document.getElementById("grp-core");
    if (grpCore) grpCore.innerText = t("menu_group_analytics");
    const grpServices = document.getElementById("grp-services");
    if (grpServices) grpServices.innerText = t("menu_group_services");
    const grpManagement = document.getElementById("grp-management");
    if (grpManagement) grpManagement.innerText = t("menu_group_management");

    // Login screen static elements
    const tagline = document.getElementById("lbl-tagline");
    if (tagline) tagline.innerText = t("tagline");
    const desc = document.getElementById("lbl-login-desc");
    if (desc) desc.innerText = t("loginDesc");
    const loginTitle = document.getElementById("lbl-login-title");
    if (loginTitle) loginTitle.innerText = t("loginTitle");
    const loginSub = document.getElementById("lbl-login-subtitle");
    if (loginSub) loginSub.innerText = t("loginSubtitle");
    const emailLabel = document.getElementById("lbl-email");
    if (emailLabel) emailLabel.innerText = t("email");
    const passLabel = document.getElementById("lbl-password");
    if (passLabel) passLabel.innerText = t("password");
    const loginBtnText = document.getElementById("lbl-login-btn");
    if (loginBtnText) loginBtnText.innerText = t("loginBtn");
    const forgotLink = document.getElementById("lbl-forgot-link");
    if (forgotLink) forgotLink.innerText = t("login_forgot_link");
    
    const branchLabel = document.getElementById("lbl-select-branch");
    if (branchLabel) branchLabel.innerText = t("selectBranch");

    // Language Toggle Button Text
    document.getElementById("lang-toggle-btn").innerText = state.lang === "th" ? "EN" : "TH";

    // Active page title & render
    updateNavbarTitle();
    
    // Rerender page to apply language
    if (state.user) {
        renderCurrentPage();
    }
}

function updateNavbarTitle() {
    const titleEl = document.getElementById("active-page-title");
    if (titleEl) {
        titleEl.innerText = t(`menu_${state.activePage}`) || state.activePage;
    }
}

// 3. Theme Management
function toggleTheme() {
    state.theme = state.theme === "light" ? "dark" : "light";
    const body = document.body;
    const themeIcon = document.getElementById("theme-icon");
    
    if (state.theme === "dark") {
        body.classList.add("dark-theme");
        themeIcon.setAttribute("data-lucide", "sun");
    } else {
        body.classList.remove("dark-theme");
        themeIcon.setAttribute("data-lucide", "moon");
    }
    lucide.createIcons();
}

// 4. Language Management
function toggleLanguage() {
    state.lang = state.lang === "th" ? "en" : "th";
    updateLanguageUI();
}

// 5. Authentication
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            state.user = data.user;
            
            // Set User Initials and UI
            document.getElementById("user-display-name").innerText = state.user.username;
            document.getElementById("user-display-role").innerText = t(`user_role_${state.user.role}`);
            document.getElementById("user-avatar-initials").innerText = state.user.username.slice(0, 2).toUpperCase();

            // Fetch Branches & Categories
            await fetchBranches();
            await fetchCategories();
            
            // Hide Login and Show App
            document.getElementById("login-screen").style.display = "none";
            document.getElementById("main-app").style.display = "flex";
            
            // Navigate to Dashboard
            navigate("dashboard");
        } else {
            alert(data.error || data.detail || "เข้าสู่ระบบไม่สำเร็จ / Login failed");
        }
    } catch (err) {
        console.error("Login Error:", err);
        alert("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง / Login failed, please try again.");
    }
}

function showForgotPasswordModal(event) {
    if (event) event.preventDefault();
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 400px;">
            <div class="modal-header">
                <h3><i data-lucide="key-round"></i> ${t("forgot_title")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitForgotPassword(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1rem;">
                    <p style="font-size:0.9rem; color:var(--text-muted); margin:0;">${t("forgot_email_lbl")}</p>
                    <div class="input-group">
                        <label>${t("email")} <span class="required-asterisk">*</span></label>
                        <input type="email" id="forgot-email-input" class="input-control" placeholder="admin@opticare.com" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("forgot_btn_reset")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById("forgot-email-input").value;
    try {
        const res = await fetch(`${API_BASE}/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(data.message);
            closeModal();
        } else {
            alert(data.error || data.detail || "Email not found in system.");
        }
    } catch (err) {
        console.error(err);
        alert("Connection error.");
    }
}

function handleLogout() {
    state.user = null;
    document.getElementById("main-app").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    state.cart = [];
}

// 6. Branch Management
async function fetchBranches() {
    try {
        const res = await fetch(`${API_BASE}/branches`);
        state.branches = await res.json();
        
        const select = document.getElementById("branch-select");
        select.innerHTML = "";
        
        state.branches.forEach(b => {
            const opt = document.createElement("option");
            opt.value = b.id;
            opt.innerText = state.lang === "th" ? b.name_th : b.name_en;
            select.appendChild(opt);
        });
        
        state.activeBranchId = parseInt(select.value);
    } catch (err) {
        console.error("Error fetching branches:", err);
    }
}

async function fetchCategories() {
    try {
        const res = await fetch(`${API_BASE}/categories`);
        state.categories = await res.json();
    } catch (err) {
        console.error("Error fetching categories:", err);
    }
    if (!state.categories || state.categories.length === 0) {
        state.categories = [
            { id: 1, key: "frame", name_th: "กรอบแว่นตา", name_en: "Frames" },
            { id: 2, key: "lens", name_th: "เลนส์สายตา", name_en: "Optical Lenses" },
            { id: 3, key: "contact", name_th: "คอนแทคเลนส์", name_en: "Contact Lenses" }
        ];
    }
}

function changeBranch(branchId) {
    state.activeBranchId = parseInt(branchId);
    state.cart = []; // clear cart when switching branch
    renderCurrentPage();
}

// 7. Navigation Router
function navigate(pageId, extraParam = null) {
    state.activePage = pageId;
    state.activePageParam = extraParam;
    
    if (pageId === "customer-detail") {
        activeCustomerSubTab = "exam";
    }
    
    // Update active class in sidebar
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    
    const activeItem = document.getElementById(`menu-${pageId}`);
    if (activeItem) {
        activeItem.classList.add("active");
    }

    updateNavbarTitle();
    renderCurrentPage();
}

// Render dynamic pages
function renderCurrentPage() {
    const container = document.getElementById("page-content");
    container.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:200px;"><i data-lucide="loader-2" class="animate-spin" style="width:40px; height:40px; color:var(--secondary);"></i></div>`;
    lucide.createIcons();

    switch (state.activePage) {
        case "dashboard":
            renderDashboard(container);
            break;
        case "customers":
            renderCustomers(container);
            break;
        case "customer-detail":
            renderCustomerDetail(container, state.activePageParam);
            break;
        case "inventory":
            renderInventory(container);
            break;
        case "pos":
            renderPOS(container);
            break;
        case "appointments":
            renderAppointments(container);
            break;
        case "users":
            renderUsers(container);
            break;
        case "reports":
            renderReports(container);
            break;
        case "settings":
            renderSettings(container);
            break;
        default:
            container.innerHTML = `<h3>Page Not Found</h3>`;
    }
}

// ==========================================================================
// PAGE RENDERS & API INTEGRATIONS
// ==========================================================================

// --- PAGE 2: DASHBOARD ---
// --- PAGE 2: DASHBOARD ---
async function renderDashboard(container) {
    try {
        const res = await fetch(`${API_BASE}/dashboard?branch_id=${state.activeBranchId}`);
        const data = await res.json();
        
        container.innerHTML = `
            <div class="fade-in" style="display:flex; flex-direction:column; gap:1.5rem;">
                
                <!-- Category 1: Financial Performance -->
                <div>
                    <h3 style="margin-bottom: 1rem; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-heading); font-size: 1.15rem;">
                        <span style="display: inline-block; width: 4px; height: 16px; background-color: var(--secondary); border-radius: 2px;"></span>
                        ${t("db_group_financials")}
                    </h3>
                    <div class="stats-grid">
                        <!-- Card 1: Today's Sales -->
                        <div class="glass-card stat-card" style="border-left: 3px solid var(--secondary);">
                            <div class="stat-info">
                                <span class="stat-label">${t("db_today_sales")}</span>
                                <span class="stat-value" style="font-size: 1.6rem;">${data.today_sales.toLocaleString()} ฿</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${t("db_today_sales")}</span>
                            </div>
                            <div class="stat-icon"><i data-lucide="banknote"></i></div>
                        </div>
                        
                        <!-- Card 2: Monthly Sales -->
                        <div class="glass-card stat-card" style="border-left: 3px solid var(--primary);">
                            <div class="stat-info">
                                <span class="stat-label">${t("db_monthly_sales")}</span>
                                <span class="stat-value" style="font-size: 1.6rem;">${data.monthly_sales.toLocaleString()} ฿</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${t("db_monthly_sales")}</span>
                            </div>
                            <div class="stat-icon"><i data-lucide="trending-up"></i></div>
                        </div>

                        <!-- Card 3: Monthly Profit -->
                        <div class="glass-card stat-card" style="border-left: 3px solid var(--success);">
                            <div class="stat-info">
                                <span class="stat-label">${t("db_monthly_profit")}</span>
                                <span class="stat-value" style="color: var(--success); font-size: 1.6rem;">${data.monthly_profit.toLocaleString()} ฿</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">Est. Gross Profit</span>
                            </div>
                            <div class="stat-icon" style="background: rgba(16,185,129,0.1); color: var(--success);"><i data-lucide="dollar-sign"></i></div>
                        </div>

                        <!-- Card 4: Bill Count -->
                        <div class="glass-card stat-card" style="border-left: 3px solid var(--info);">
                            <div class="stat-info">
                                <span class="stat-label">${t("db_bill_count")}</span>
                                <span class="stat-value" style="font-size: 1.6rem;">${data.monthly_bills} ${t("db_bill_suffix")}</span>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">Today: ${data.today_bills} ${t("db_bill_suffix")}</span>
                            </div>
                            <div class="stat-icon" style="background: rgba(59,130,246,0.1); color: var(--info);"><i data-lucide="receipt"></i></div>
                        </div>
                    </div>
                </div>

                <!-- Category 2 & 3 Side by Side -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
                    <!-- Category 2: Customer Insights -->
                    <div>
                        <h3 style="margin-bottom: 1rem; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-heading); font-size: 1.15rem;">
                            <span style="display: inline-block; width: 4px; height: 16px; background-color: var(--secondary); border-radius: 2px;"></span>
                            ${t("db_group_customers")}
                        </h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <!-- Card 5: New Customers -->
                            <div class="glass-card stat-card" style="padding: 1.25rem;">
                                <div class="stat-info">
                                    <span class="stat-label">${t("db_new_customers")}</span>
                                    <span class="stat-value" style="font-size: 1.5rem;">${data.new_customers} ${t("db_customer_suffix")}</span>
                                </div>
                                <div class="stat-icon" style="width: 40px; height: 40px; font-size: 1.1rem; background: rgba(13,92,80,0.05); color: var(--primary);"><i data-lucide="user-plus"></i></div>
                            </div>
                            
                            <!-- Card 6: Returning Customers -->
                            <div class="glass-card stat-card" style="padding: 1.25rem;">
                                <div class="stat-info">
                                    <span class="stat-label">${t("db_returning_customers")}</span>
                                    <span class="stat-value" style="font-size: 1.5rem; color: var(--secondary);">${data.returning_customers} ${t("db_customer_suffix")}</span>
                                </div>
                                <div class="stat-icon" style="width: 40px; height: 40px; font-size: 1.1rem; background: rgba(205,162,80,0.1); color: var(--secondary);"><i data-lucide="refresh-cw"></i></div>
                            </div>
                        </div>
                    </div>

                    <!-- Category 3: Operations & Fulfillment -->
                    <div>
                        <h3 style="margin-bottom: 1rem; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-heading); font-size: 1.15rem;">
                            <span style="display: inline-block; width: 4px; height: 16px; background-color: var(--secondary); border-radius: 2px;"></span>
                            ${t("db_group_operations")}
                        </h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <!-- Card 7: Pending Lab Jobs -->
                            <div class="glass-card stat-card" style="padding: 1.25rem;">
                                <div class="stat-info">
                                    <span class="stat-label">${t("db_pending_deliveries")}</span>
                                    <span class="stat-value" style="font-size: 1.5rem;">${data.pending_labs} ${t("db_item_suffix")}</span>
                                </div>
                                <div class="stat-icon" style="width: 40px; height: 40px; font-size: 1.1rem; background: rgba(16,185,129,0.1); color: var(--success);"><i data-lucide="wrench"></i></div>
                            </div>
                            
                            <!-- Card 8: Overdue Jobs -->
                            <div class="glass-card stat-card" style="padding: 1.25rem; ${data.overdue_labs > 0 ? 'border: 1px solid var(--danger); background: rgba(239,68,68,0.02);' : ''}">
                                <div class="stat-info">
                                    <span class="stat-label">${t("db_overdue_jobs")}</span>
                                    <span class="stat-value" style="font-size: 1.5rem; ${data.overdue_labs > 0 ? 'color: var(--danger);' : ''}">${data.overdue_labs} ${t("db_item_suffix")}</span>
                                    ${data.overdue_labs > 0 ? `<span style="font-size: 0.7rem; color: var(--danger); font-weight: 600;">${t("db_overdue_tag")}</span>` : `<span style="font-size: 0.7rem; color: var(--text-muted);">Within schedule</span>`}
                                </div>
                                <div class="stat-icon" style="width: 40px; height: 40px; font-size: 1.1rem; background: ${data.overdue_labs > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(13,92,80,0.05)'}; color: ${data.overdue_labs > 0 ? 'var(--danger)' : 'var(--text-muted)'};"><i data-lucide="alert-circle"></i></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Category 4: Stock & Sales Analysis -->
                <div>
                    <h3 style="margin-bottom: 1rem; color: var(--primary); display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-heading); font-size: 1.15rem;">
                        <span style="display: inline-block; width: 4px; height: 16px; background-color: var(--secondary); border-radius: 2px;"></span>
                        ${t("db_group_inventory")}
                    </h3>
                    
                    <div class="dashboard-layout" style="grid-template-columns: 1.2fr 1.8fr;">
                        
                        <!-- Card 9: Low Stock Alert -->
                        <div class="glass-card" style="height: fit-content;">
                            <h4 style="margin-bottom: 1rem; display:flex; align-items:center; gap:0.5rem; color:var(--danger); font-size: 1.05rem;">
                                <i data-lucide="alert-triangle"></i> ${t("db_low_stock_count")}
                                <span class="badge badge-danger" style="margin-left:auto; font-size:0.8rem; padding: 0.2rem 0.5rem;">${data.low_stock_count} ${t("db_item_suffix")}</span>
                            </h4>
                            <div style="display:flex; flex-direction:column; gap:0.75rem; max-height: 250px; overflow-y: auto; padding-right: 0.25rem;">
                                ${data.low_stock_items.length === 0 ? `<div style="text-align:center; color:var(--text-muted); padding:2rem;">All stock healthy</div>` :
                                    data.low_stock_items.map(item => `
                                        <div class="eye-val-box" style="text-align:left; border-color: rgba(239,68,68,0.15); background:rgba(239,68,68,0.02); flex-direction:row; align-items:center; justify-content:space-between; padding: 0.75rem 1rem; border-radius: 12px; display:flex;">
                                            <div style="display:flex; flex-direction:column; gap:0.15rem;">
                                                <span style="font-weight:600; font-size:0.85rem; color: var(--text-main);">${state.lang === 'th' ? item.name_th : item.name_en}</span>
                                                <span style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${item.category}</span>
                                            </div>
                                            <div style="text-align:right;">
                                                <span style="font-size:1rem; font-weight:700; color:var(--danger);">${item.stock}</span>
                                                <span style="font-size:0.65rem; color:var(--text-muted); display:block;">min: ${item.min_stock}</span>
                                            </div>
                                        </div>
                                    `).join('')
                                }
                            </div>
                        </div>

                        <!-- Card 10: Top 5 Best Sellers -->
                        <div class="glass-card" style="height: fit-content;">
                            <h4 style="margin-bottom: 1rem; display:flex; align-items:center; gap:0.5rem; color:var(--primary); font-size: 1.05rem;">
                                <i data-lucide="trophy" style="color:var(--secondary);"></i> ${t("db_top_sellers")}
                            </h4>
                            <div class="table-wrapper" style="margin-top: 0;">
                                <table class="custom-table" style="font-size: 0.85rem;">
                                    <thead>
                                        <tr>
                                            <th>${t("db_product")}</th>
                                            <th style="text-align:center;">${t("inv_category")}</th>
                                            <th style="text-align:right;">${t("inv_price")}</th>
                                            <th style="text-align:right;">${t("db_qty_sold")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.top_sellers.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1rem;">No data</td></tr>` : 
                                            data.top_sellers.map(p => `
                                                <tr>
                                                    <td style="font-weight:600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                        ${state.lang === 'th' ? p.name_th : p.name_en}
                                                    </td>
                                                    <td style="text-align:center;">
                                                        <span class="badge badge-info" style="font-size: 0.65rem; padding: 0.15rem 0.4rem; text-transform: uppercase;">
                                                            ${p.category}
                                                        </span>
                                                    </td>
                                                    <td style="text-align:right; font-weight:700; color:var(--primary);">${p.price.toLocaleString()} ฿</td>
                                                    <td style="text-align:right; font-weight:700; font-size: 0.95rem; color:var(--secondary-hover);">${p.total_qty}</td>
                                                </tr>
                                            `).join('')
                                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- Recent Activity Feeds -->
                <div class="dashboard-layout">
                    <!-- Column Left: Recent Orders -->
                    <div class="glass-card">
                        <h3 style="margin-bottom: 1rem; display:flex; align-items:center; gap:0.5rem; color:var(--primary); font-size: 1.1rem;">
                            <i data-lucide="shopping-bag"></i> ${t("db_orders")}
                        </h3>
                        <div class="table-wrapper" style="margin-top:0;">
                            <table class="custom-table" style="font-size: 0.85rem;">
                                <thead>
                                    <tr>
                                        <th>${t("db_customer")}</th>
                                        <th>${t("det_date")}</th>
                                        <th>${t("db_amount")}</th>
                                        <th>${t("db_status")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.recent_orders.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${t("db_no_recent_orders")}</td></tr>` : 
                                        data.recent_orders.map(o => `
                                            <tr style="cursor:pointer;" onclick="navigate('customer-detail', ${o.customer_id || 1})">
                                                <td style="font-weight:600;">${o.customer_name}</td>
                                                <td>${o.date.slice(0, 16)}</td>
                                                <td style="font-weight:700; color:var(--primary);">${o.total_amount.toLocaleString()} ฿</td>
                                                <td><span class="badge ${o.status === 'Paid' ? 'badge-success' : 'badge-warning'}">${t('status_' + o.status.toLowerCase())}</span></td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Column Right: Recent Lab Jobs -->
                    <div class="glass-card">
                        <h3 style="margin-bottom: 1rem; display:flex; align-items:center; gap:0.5rem; color:var(--primary); font-size: 1.1rem;">
                            <i data-lucide="wrench"></i> ${t("db_lab_jobs")}
                        </h3>
                        <div class="table-wrapper" style="margin-top:0;">
                            <table class="custom-table" style="font-size: 0.85rem;">
                                <thead>
                                    <tr>
                                        <th>${t("db_customer")}</th>
                                        <th>${t("inv_category")}</th>
                                        <th>${t("db_status")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.lab_jobs.length === 0 ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No lab jobs</td></tr>` : 
                                        data.lab_jobs.map(j => `
                                            <tr>
                                                <td style="font-weight:600;">${j.customer_name}</td>
                                                <td style="font-size:0.75rem; color:var(--text-muted); white-space:pre-line; max-width:180px; overflow:hidden; text-overflow:ellipsis;">${j.details}</td>
                                                <td><span class="badge ${j.status === 'completed' ? 'badge-success' : 'badge-warning'}">${t('status_' + j.status)}</span></td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("Dashboard Render Error:", err);
    }
}

// --- PAGE 3: CUSTOMERS & ALERTS ---
let customerSearchQuery = "";
let filterCheckupOnly = false;
let customerPage = 1;
let customerPerPage = 20;

function changeCustomerPerPage(val) {
    customerPerPage = parseInt(val);
    customerPage = 1;
    renderCurrentPage();
}

function changeCustomerPage(dir) {
    customerPage += dir;
    renderCurrentPage();
}

async function renderCustomers(container) {
    try {
        const res = await fetch(`${API_BASE}/customers?q=${customerSearchQuery}`);
        let data = await res.json();
        
        if (filterCheckupOnly) {
            data = data.filter(c => c.checkup_due);
        }

        // Sort data dynamically
        const s = sorts.customers;
        data.sort((a, b) => {
            let valA, valB;
            if (s.field === "name") {
                valA = state.lang === 'th' ? `${a.first_name_th} ${a.last_name_th}` : `${a.first_name_en} ${a.last_name_en}`;
                valB = state.lang === 'th' ? `${b.first_name_th} ${b.last_name_th}` : `${b.first_name_en} ${b.last_name_en}`;
            } else if (s.field === "checkup_due_date") {
                valA = a.checkup_due_date || (s.asc ? "9999-99-99" : "0000-00-00");
                valB = b.checkup_due_date || (s.asc ? "9999-99-99" : "0000-00-00");
            } else {
                valA = a[s.field] || "";
                valB = b[s.field] || "";
            }

            if (typeof valA === "number" && typeof valB === "number") {
                return s.asc ? valA - valB : valB - valA;
            }
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
            if (valA < valB) return s.asc ? -1 : 1;
            if (valA > valB) return s.asc ? 1 : -1;
            return 0;
        });

        // Pagination calculations
        const totalItems = data.length;
        const totalPages = Math.ceil(totalItems / customerPerPage) || 1;
        if (customerPage > totalPages) {
            customerPage = totalPages;
        }
        const startIndex = (customerPage - 1) * customerPerPage;
        const endIndex = startIndex + customerPerPage;
        const pageData = data.slice(startIndex, endIndex);

        container.innerHTML = `
            <div class="fade-in">
                <!-- Search & Action Toolbar -->
                <div class="actions-bar">
                    <div class="search-input-wrapper">
                        <i data-lucide="search" class="search-icon"></i>
                        <input type="text" class="search-control" id="cust-search" placeholder="${t("cust_search_placeholder")}" value="${customerSearchQuery}" oninput="searchCustomers(this.value)">
                    </div>

                    <div style="display:flex; gap:1rem; align-items:center;">
                        <!-- Filter Checkup due -->
                        <div style="display:flex; background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:0.25rem;">
                            <button class="btn-qty" style="padding:0.5rem 1rem; width:auto; height:auto; font-size:0.85rem; border:none; background:${!filterCheckupOnly ? 'var(--primary)' : 'transparent'}; color:${!filterCheckupOnly ? 'white' : 'var(--text-muted)'};" onclick="toggleCheckupFilter(false)">
                                ${t("cust_all_status")}
                            </button>
                            <button class="btn-qty" style="padding:0.5rem 1rem; width:auto; height:auto; font-size:0.85rem; border:none; background:${filterCheckupOnly ? 'var(--danger)' : 'transparent'}; color:${filterCheckupOnly ? 'white' : 'var(--text-muted)'};" onclick="toggleCheckupFilter(true)">
                                ${t("cust_alert_only")}
                            </button>
                        </div>

                        <button class="btn-premium" onclick="showAddCustomerModal()">
                            <i data-lucide="user-plus"></i> ${t("cust_add")}
                        </button>
                    </div>
                </div>

                <!-- Customer Table -->
                <div class="glass-card">
                    <div class="table-wrapper">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th class="sortable" onclick="handleSort('customers', 'name')">${t("cust_name")} ${getSortIcon('customers', 'name')}</th>
                                    <th class="sortable" onclick="handleSort('customers', 'phone')">${t("cust_phone")} ${getSortIcon('customers', 'phone')}</th>
                                    <th class="sortable" onclick="handleSort('customers', 'email')">${t("cust_email")} ${getSortIcon('customers', 'email')}</th>
                                    <th class="sortable" onclick="handleSort('customers', 'last_visit')">${t("cust_last_visit")} ${getSortIcon('customers', 'last_visit')}</th>
                                    <th class="sortable" onclick="handleSort('customers', 'checkup_due_date')">${t("cust_due_date")} ${getSortIcon('customers', 'checkup_due_date')}</th>
                                    <th>${t("cust_actions")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pageData.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No customers found</td></tr>` :
                                    pageData.map(c => `
                                        <tr class="${c.checkup_due ? 'alert-row' : ''}">
                                            <td style="font-weight:600; cursor:pointer;" onclick="navigate('customer-detail', ${c.id})">
                                                <div style="display:flex; align-items:center; gap:0.75rem;">
                                                    ${c.photo ? 
                                                        `<img src="${c.photo}" alt="customer photo" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color); flex-shrink:0;">` :
                                                        `<div style="width:36px; height:36px; border-radius:50%; background:rgba(13,92,80,0.05); border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; color:var(--primary); flex-shrink:0;"><i data-lucide="user" style="width:16px; height:16px;"></i></div>`
                                                    }
                                                    <div style="display:flex; flex-direction:column; text-align:left;">
                                                        <span>
                                                            ${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`}
                                                            ${c.checkup_due ? `<span class="badge badge-danger" style="margin-left:0.5rem; padding: 0.15rem 0.4rem; font-size: 0.65rem;"><i data-lucide="bell" style="width:10px; height:10px;"></i> ${t("cust_checkup_due_alert")}</span>` : ''}
                                                        </span>
                                                        <span style="font-size:0.75rem; color:var(--text-muted); font-weight:400;">
                                                            ${t("cust_age")}: ${calculateAge(c.dob)} ${t("cust_years")} | ${state.lang === 'th' ? c.gender || '-' : (c.gender === 'ชาย' ? 'Male' : (c.gender === 'หญิง' ? 'Female' : c.gender || '-'))}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>${c.phone}</td>
                                            <td>${c.email || '-'}</td>
                                            <td>${c.last_visit || '-'}</td>
                                            <td style="${c.checkup_due ? 'color: var(--danger); font-weight: 700;' : ''}">${c.checkup_due_date || '-'}</td>
                                            <td>
                                                <button class="btn-secondary" style="padding:0.4rem 1rem; font-size:0.8rem;" onclick="navigate('customer-detail', ${c.id})">
                                                    <i data-lucide="eye" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> View
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')
                                }
                            </tbody>
                        </table>
                    </div>

                    <!-- Pagination Controls -->
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.5rem; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:1rem;">
                        <!-- Items Per Page Dropdown -->
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:var(--text-muted);">
                            <span>${state.lang === 'th' ? 'แสดงข้อมูลต่อหน้า:' : 'Items per page:'}</span>
                            <select class="input-control" style="width:75px; padding:0.4rem 0.5rem; font-size:0.85rem; height:auto; border-radius:8px; cursor:pointer;" onchange="changeCustomerPerPage(this.value)">
                                <option value="20" ${customerPerPage === 20 ? 'selected' : ''}>20</option>
                                <option value="50" ${customerPerPage === 50 ? 'selected' : ''}>50</option>
                                <option value="100" ${customerPerPage === 100 ? 'selected' : ''}>100</option>
                            </select>
                        </div>
                        
                        <!-- Page Info & Navigation -->
                        <div style="display:flex; align-items:center; gap:1rem; font-size:0.85rem;">
                            <span style="color:var(--text-muted);">${state.lang === 'th' ? `หน้า ${customerPage} จาก ${totalPages}` : `Page ${customerPage} of ${totalPages}`}</span>
                            <div style="display:flex; gap:0.25rem;">
                                <button class="btn-qty" style="width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color); background:transparent; cursor:pointer;" onclick="changeCustomerPage(-1)" ${customerPage === 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                    <i data-lucide="chevron-left" style="width:16px; height:16px;"></i>
                                </button>
                                <button class="btn-qty" style="width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color); background:transparent; cursor:pointer;" onclick="changeCustomerPage(1)" ${customerPage === totalPages ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                    <i data-lucide="chevron-right" style="width:16px; height:16px;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("Customers Render Error:", err);
    }
}

// Helpers for Customer Table Actions
let searchTimeout;
function searchCustomers(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        customerSearchQuery = query;
        customerPage = 1;
        renderCurrentPage();
    }, 300);
}

function toggleCheckupFilter(dueOnly) {
    filterCheckupOnly = dueOnly;
    customerPage = 1;
    renderCurrentPage();
}

// --- PAGE 4: CUSTOMER DETAILS (PRESCRIPTION RECORDS OD/OS) ---
async function renderCustomerDetail(container, id) {
    try {
        const res = await fetch(`${API_BASE}/customers/${id}`);
        const data = await res.json();
        const c = data.customer;
        
        container.innerHTML = `
            <div class="fade-in">
                <!-- Back Button & Header -->
                <div class="customer-detail-header" style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap; margin-bottom:2rem; padding-bottom:1.5rem; border-bottom:1px solid var(--border-color);">
                    ${c.photo ? 
                        `<img src="${c.photo}" alt="customer photo" style="width:90px; height:90px; border-radius:50%; object-fit:cover; border:2.5px solid var(--secondary); box-shadow:var(--shadow-premium); flex-shrink:0;">` :
                        `<div style="width:90px; height:90px; border-radius:50%; background:rgba(205,162,80,0.1); border:2.5px solid var(--gold-border); display:flex; align-items:center; justify-content:center; color:var(--secondary); flex-shrink:0;"><i data-lucide="user" style="width:40px; height:40px;"></i></div>`
                    }
                    <div class="client-meta" style="flex-grow:1; display:flex; flex-direction:column; gap:0.25rem;">
                        <button class="btn-secondary" style="width:fit-content; padding:0.4rem 0.85rem; font-size:0.8rem; margin-bottom:0.5rem;" onclick="navigate('customers')">
                            <i data-lucide="arrow-left" style="width:12px; height:12px; vertical-align:middle;"></i> ${t("det_back")}
                        </button>
                        <h2 class="client-name" style="margin-bottom:0.25rem; font-size:1.8rem; color:var(--primary-dark);">
                            ${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`}
                            ${c.checkup_due ? `<span class="badge badge-danger" style="font-size:0.75rem; margin-left:0.75rem; vertical-align:middle;"><i data-lucide="bell" style="width:12px; height:12px;"></i> ${t("cust_checkup_due_alert")}</span>` : ''}
                        </h2>
                        <div class="client-contacts" style="display:flex; flex-wrap:wrap; gap:1.25rem; font-size:0.85rem; color:var(--text-muted);">
                            <span><i data-lucide="phone" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> ${c.phone}</span>
                            <span><i data-lucide="mail" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> ${c.email || '-'}</span>
                            <span><i data-lucide="info" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> ${t("cust_gender")}: ${state.lang === 'th' ? c.gender || '-' : (c.gender === 'ชาย' ? 'Male' : (c.gender === 'หญิง' ? 'Female' : c.gender || '-'))}</span>
                            <span><i data-lucide="cake" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> Birth: ${c.dob || '-'} (${t("cust_age")} ${calculateAge(c.dob)} ${t("cust_years")})</span>
                            <span><i data-lucide="calendar" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> Last Visit: ${c.last_visit || '-'}</span>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem; display:flex; align-items:flex-start; gap:0.25rem; text-align:left;">
                            <i data-lucide="map-pin" style="width:14px; height:14px; flex-shrink:0; margin-top:0.15rem;"></i> <span><strong>${t("cust_address")}:</strong> ${c.address || '-'}</span>
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                        <button class="btn-premium" onclick="showAddPrescriptionModal(${c.id})">
                            <i data-lucide="plus-circle"></i> ${t("det_new_exam")}
                        </button>
                        <button class="btn-secondary" style="padding:0.75rem 1.25rem;" onclick="showAddAppointmentModal(${c.id})">
                            <i data-lucide="calendar-plus" style="width:16px; height:16px; vertical-align:middle; margin-right:0.25rem;"></i> ${state.lang === 'th' ? 'สร้างนัดหมาย' : 'Book Appointment'}
                        </button>
                    </div>
                </div>

                <!-- Sub tab navigation for history -->
                <div class="tab-container" style="margin-bottom: 1.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.25rem;">
                    <button class="tab-btn ${activeCustomerSubTab === 'exam' ? 'active' : ''}" style="display:inline-flex; align-items:center; gap:0.25rem;" onclick="switchCustomerSubTab('exam')">
                        <i data-lucide="glasses" style="width:16px; height:16px;"></i> ${state.lang === 'th' ? 'ประวัติการตรวจสายตา' : 'Eye Exam History'}
                    </button>
                    <button class="tab-btn ${activeCustomerSubTab === 'order' ? 'active' : ''}" style="display:inline-flex; align-items:center; gap:0.25rem;" onclick="switchCustomerSubTab('order')">
                        <i data-lucide="receipt" style="width:16px; height:16px;"></i> ${state.lang === 'th' ? 'ประวัติการซื้อ' : 'Purchase History'}
                    </button>
                </div>

                <!-- Eye Prescription Refraction Logs (OD/OS History) -->
                <div id="customer-exam-tab" style="display: ${activeCustomerSubTab === 'exam' ? 'block' : 'none'};">
                    <div class="glass-card" style="margin-bottom: 2rem;">
                        <                        ${data.prescriptions.length === 0 ? `<div style="text-align:center; color:var(--text-muted); padding:3rem;">No prescription records found.</div>` :
                            data.prescriptions.map((p, index) => {
                                const isLatest = index === 0;
                                return `
                                    <div class="eye-val-box collapsible-exam-card" style="text-align:left; border-color:var(--gold-border); margin-bottom:1.5rem; padding:0; border-radius:12px; overflow:hidden;">
                                        <!-- Collapsible Header -->
                                        <div class="exam-card-header" style="display:flex; justify-content:space-between; align-items:center; padding:1.25rem 1.5rem; cursor:pointer; background:rgba(205,162,80,0.03); transition:background-color 0.2s;" onclick="toggleExamCard(${p.id})">
                                            <span style="font-weight:700; font-size:1.1rem; color:var(--primary-light); display:inline-flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                                                <i data-lucide="calendar" style="width:16px; height:16px;"></i> 
                                                ${t("det_date")}: ${p.date} 
                                                <span style="font-size:0.85rem; font-weight:500; color:var(--text-muted); margin-left:0.5rem;">
                                                    (${t("cust_exam_age")}: ${calculateAge(c.dob, p.date)} ${t("cust_years")})
                                                </span>
                                            </span>
                                            <div style="display:flex; align-items:center; gap:1rem; margin-left:auto;">
                                                <span style="font-size:0.85rem; color:var(--text-muted); display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                                    ${t("det_recorded_by")}: <strong>${p.recorded_by}</strong>
                                                </span>
                                                <i data-lucide="chevron-down" class="exam-toggle-icon" id="exam-toggle-icon-${p.id}" style="width:20px; height:20px; transition:transform 0.2s ease; ${isLatest ? 'transform:rotate(180deg);' : ''}"></i>
                                            </div>
                                        </div>
                                        
                                        <!-- Collapsible Body -->
                                        <div class="exam-card-body" id="exam-card-body-${p.id}" style="padding:1.5rem; border-top:1px solid var(--border-color); display:${isLatest ? 'block' : 'none'};">
                                            <div class="prescription-container">
                                                <!-- OD Right Eye -->
                                                <div class="eye-section od">
                                                    <h4><i data-lucide="eye"></i> ${t("det_od")}</h4>
                                                    <div class="eye-grid">
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_sph")}</span>
                                                            <span class="eye-val-num">${p.od_sph !== null ? (p.od_sph > 0 ? '+' : '') + p.od_sph.toFixed(2) : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_cyl")}</span>
                                                            <span class="eye-val-num">${p.od_cyl !== null ? (p.od_cyl > 0 ? '+' : '') + p.od_cyl.toFixed(2) : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_axis")}</span>
                                                            <span class="eye-val-num">${p.od_axis !== null ? p.od_axis + '°' : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_add")}</span>
                                                            <span class="eye-val-num">${p.od_add !== null ? '+' + p.od_add.toFixed(2) : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_va")}</span>
                                                            <span class="eye-val-num">${p.od_va || '-'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <!-- OS Left Eye -->
                                                <div class="eye-section os">
                                                    <h4><i data-lucide="eye"></i> ${t("det_os")}</h4>
                                                    <div class="eye-grid">
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_sph")}</span>
                                                            <span class="eye-val-num">${p.os_sph !== null ? (p.os_sph > 0 ? '+' : '') + p.os_sph.toFixed(2) : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_cyl")}</span>
                                                            <span class="eye-val-num">${p.os_cyl !== null ? (p.os_cyl > 0 ? '+' : '') + p.os_cyl.toFixed(2) : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_axis")}</span>
                                                            <span class="eye-val-num">${p.os_axis !== null ? p.os_axis + '°' : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_add")}</span>
                                                            <span class="eye-val-num">${p.os_add !== null ? '+' + p.os_add.toFixed(2) : '-'}</span>
                                                        </div>
                                                        <div class="eye-val-box">
                                                            <span class="eye-val-label">${t("det_va")}</span>
                                                            <span class="eye-val-num">${p.os_va || '-'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <!-- Medical conditions, Previous Glasses & Doctors comments -->
                                            <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px dashed var(--border-color); display:grid; grid-template-columns:1fr 1fr; gap:1.5rem;">
                                                <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:0.75rem 1rem;">
                                                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.25rem; display:flex; align-items:center; gap:0.25rem;">
                                                        <i data-lucide="activity" style="width:14px; height:14px;"></i> ${t("det_med_history")}
                                                    </div>
                                                    <div style="font-weight:600; font-size:0.9rem; color:var(--text-main);">${p.medical_history || '-'}</div>
                                                </div>
                                                <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:10px; padding:0.75rem 1rem;">
                                                    <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.25rem; display:flex; align-items:center; gap:0.25rem;">
                                                        <i data-lucide="glasses" style="width:14px; height:14px;"></i> ${t("det_prev_glasses")}
                                                    </div>
                                                    <div style="font-weight:600; font-size:0.9rem; color:var(--text-main);">${p.previous_glasses || '-'}</div>
                                                </div>
                                            </div>
                                            <div style="margin-top:1rem; background:rgba(13,92,80,0.02); border:1px solid rgba(13,92,80,0.08); border-radius:10px; padding:0.75rem 1rem;">
                                                <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--primary); margin-bottom:0.25rem; display:flex; align-items:center; gap:0.25rem;">
                                                    <i data-lucide="clipboard-list" style="width:14px; height:14px;"></i> ${t("det_notes_lbl")}
                                                </div>
                                                <div style="font-weight:500; font-size:0.95rem; color:var(--text-main); font-style:italic;">${p.notes || '-'}</div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                </div>

                <!-- Historical purchases -->
                <div id="customer-order-tab" style="display: ${activeCustomerSubTab === 'order' ? 'block' : 'none'};">
                    <div class="glass-card">
                        <h3 style="margin-bottom: 1.5rem; display:flex; align-items:center; gap:0.5rem; color:var(--primary);">
                            <i data-lucide="receipt"></i> ${t("det_pur_history")}
                        </h3>
                        <div class="table-wrapper">
                            <table class="custom-table">
                                <thead>
                                    <tr>
                                        <th>${t("det_date")}</th>
                                        <th>${t("det_total")}</th>
                                        <th>${t("det_deposit")}</th>
                                        <th>${t("det_payment_method")}</th>
                                        <th>${t("det_status")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.orders.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No purchases logged yet.</td></tr>` :
                                        data.orders.map(o => `
                                            <tr>
                                                <td style="font-weight:600;">${o.date}</td>
                                                <td style="font-weight:700; color:var(--primary);">${o.total_amount.toLocaleString()} ฿</td>
                                                <td>${o.deposit_amount.toLocaleString()} ฿</td>
                                                <td>${o.payment_method}</td>
                                                <td><span class="badge ${o.status === 'Paid' ? 'badge-success' : 'badge-warning'}">${t('status_' + o.status.toLowerCase())}</span></td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("Customer Details Render Error:", err);
    }
}

function switchCustomerSubTab(tab) {
    activeCustomerSubTab = tab;
    const btnExam = document.querySelector('[onclick="switchCustomerSubTab(\'exam\')"]');
    const btnOrder = document.querySelector('[onclick="switchCustomerSubTab(\'order\')"]');
    const divExam = document.getElementById('customer-exam-tab');
    const divOrder = document.getElementById('customer-order-tab');
    
    if (btnExam && btnOrder && divExam && divOrder) {
        if (tab === 'exam') {
            btnExam.classList.add('active');
            btnOrder.classList.remove('active');
            divExam.style.display = 'block';
            divOrder.style.display = 'none';
        } else {
            btnExam.classList.remove('active');
            btnOrder.classList.add('active');
            divExam.style.display = 'none';
            divOrder.style.display = 'block';
        }
    }
}

// --- PAGE 5: INVENTORY TABBED TABLE ---
let activeInventoryTab = "frame"; // frame, lens, contact
let activeSettingsTab = "branch"; // branch, general
let activeCustomerSubTab = "exam"; // exam, order
let inventorySearchQuery = "";
let inventoryStockFilter = "all"; // all, instock, low, outof
let inventoryPage = 1;
let inventoryPerPage = 20;

function changeInventoryPerPage(val) {
    inventoryPerPage = parseInt(val);
    inventoryPage = 1;
    renderCurrentPage();
}

function changeInventoryPage(dir) {
    inventoryPage += dir;
    renderCurrentPage();
}

// Sorting State
let sorts = {
    customers: { field: "name", asc: true },
    inventory: { field: "name", asc: true },
    purchases: { field: "date", asc: false },
    users: { field: "username", asc: true },
    branches: { field: "id", asc: true },
    categories: { field: "id", asc: true }
};

function handleSort(page, field) {
    const s = sorts[page];
    if (s.field === field) {
        s.asc = !s.asc;
    } else {
        s.field = field;
        s.asc = true;
    }
    renderCurrentPage();
}

function getSortIcon(page, field) {
    const s = sorts[page];
    if (s.field === field) {
        return `<i data-lucide="${s.asc ? 'arrow-up-narrow-wide' : 'arrow-down-wide-narrow'}" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px;"></i>`;
    }
    return `<i data-lucide="chevrons-up-down" style="width: 14px; height: 14px; vertical-align: middle; margin-left: 4px; opacity: 0.3;"></i>`;
}

async function renderInventory(container) {
    try {
        // Ensure activeInventoryTab is a valid category
        if (state.categories && state.categories.length > 0) {
            const isValidTab = state.categories.some(cat => cat.key === activeInventoryTab);
            if (!isValidTab) {
                activeInventoryTab = state.categories[0].key;
            }
        }

        const res = await fetch(`${API_BASE}/inventory?branch_id=${state.activeBranchId}&category=${activeInventoryTab}`);
        let data = await res.json();

        // client-side search query filtering
        if (inventorySearchQuery) {
            const query = inventorySearchQuery.toLowerCase().trim();
            data = data.filter(p => 
                (p.barcode && p.barcode.toLowerCase().includes(query)) ||
                (p.name_th && p.name_th.toLowerCase().includes(query)) ||
                (p.name_en && p.name_en.toLowerCase().includes(query)) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }

        // client-side stock status filtering
        if (inventoryStockFilter === "instock") {
            data = data.filter(p => p.stock > p.min_stock);
        } else if (inventoryStockFilter === "low") {
            data = data.filter(p => p.stock <= p.min_stock && p.stock > 0);
        } else if (inventoryStockFilter === "outof") {
            data = data.filter(p => p.stock <= 0);
        }

        // client-side sorting
        const s = sorts.inventory;
        data.sort((a, b) => {
            let valA, valB;
            if (s.field === "name") {
                valA = state.lang === 'th' ? a.name_th : a.name_en;
                valB = state.lang === 'th' ? b.name_th : b.name_en;
            } else {
                valA = a[s.field];
                valB = b[s.field];
            }

            if (typeof valA === "number" && typeof valB === "number") {
                return s.asc ? valA - valB : valB - valA;
            }

            valA = valA ? String(valA).toLowerCase() : "";
            valB = valB ? String(valB).toLowerCase() : "";
            if (valA < valB) return s.asc ? -1 : 1;
            if (valA > valB) return s.asc ? 1 : -1;
            return 0;
        });

        // Pagination calculations
        const totalItems = data.length;
        const totalPages = Math.ceil(totalItems / inventoryPerPage) || 1;
        if (inventoryPage > totalPages) {
            inventoryPage = totalPages;
        }
        const startIndex = (inventoryPage - 1) * inventoryPerPage;
        const endIndex = startIndex + inventoryPerPage;
        const pageData = data.slice(startIndex, endIndex);

        // Store active element and selection to restore focus after re-rendering
        const activeId = document.activeElement ? document.activeElement.id : null;
        const selStart = document.activeElement ? document.activeElement.selectionStart : null;
        const selEnd = document.activeElement ? document.activeElement.selectionEnd : null;
        
        container.innerHTML = `
            <div class="fade-in">
                <!-- Actions Bar / Header row with Tabs and Add Product Button -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; gap:1rem; flex-wrap:wrap;">
                    <!-- Tabs -->
                    <div class="tab-container" style="margin-bottom:0; border-bottom:none; padding-bottom:0;">
                        ${state.categories.map(cat => `
                            <button class="tab-btn ${activeInventoryTab === cat.key ? 'active' : ''}" onclick="switchInventoryTab('${cat.key}')">
                                ${state.lang === 'th' ? cat.name_th : cat.name_en}
                            </button>
                        `).join('')}
                    </div>
                    <button class="btn-premium" onclick="showAddProductModal()">
                        <i data-lucide="plus-circle"></i> ${t("inv_add_prod")}
                    </button>
                </div>

                <!-- Search & Filters Toolbar -->
                <div class="actions-bar" style="margin-bottom:1.5rem; display:flex; gap:1rem; flex-wrap:wrap; align-items:center;">
                    <div class="search-input-wrapper" style="flex:1; min-width:250px; margin-bottom:0;">
                        <i data-lucide="search" class="search-icon"></i>
                        <input type="text" class="search-control" id="inv-search" placeholder="${t("inv_search_placeholder")}" value="${inventorySearchQuery}" oninput="searchInventory(this.value)">
                    </div>
                    
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <select class="input-control" id="inv-stock-filter" style="width:200px; padding:0.85rem 1.25rem; font-weight:500; cursor:pointer; height:auto; border-radius:12px;" onchange="filterInventoryStock(this.value)">
                            <option value="all" ${inventoryStockFilter === 'all' ? 'selected' : ''}>${t("inv_stock_filter_all")}</option>
                            <option value="instock" ${inventoryStockFilter === 'instock' ? 'selected' : ''}>${t("inv_stock_filter_instock")}</option>
                            <option value="low" ${inventoryStockFilter === 'low' ? 'selected' : ''}>${t("inv_stock_filter_low")}</option>
                            <option value="outof" ${inventoryStockFilter === 'outof' ? 'selected' : ''}>${t("inv_stock_filter_outof")}</option>
                        </select>
                    </div>
                </div>

                <!-- Products Table -->
                <div class="glass-card">
                    <div class="table-wrapper">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th class="sortable" onclick="handleSort('inventory', 'barcode')">${t("inv_barcode")} ${getSortIcon('inventory', 'barcode')}</th>
                                    <th class="sortable" onclick="handleSort('inventory', 'name')">${t("inv_name")} ${getSortIcon('inventory', 'name')}</th>
                                    <th class="sortable" onclick="handleSort('inventory', 'price')">${t("inv_price")} ${getSortIcon('inventory', 'price')}</th>
                                    <th class="sortable" onclick="handleSort('inventory', 'stock')">${t("inv_stock")} ${getSortIcon('inventory', 'stock')}</th>
                                    <th class="sortable" onclick="handleSort('inventory', 'min_stock')">${t("inv_min")} ${getSortIcon('inventory', 'min_stock')}</th>
                                    <th>${t("inv_action")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pageData.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No products match the criteria</td></tr>` :
                                    pageData.map(p => `
                                        <tr style="${p.low_stock ? 'background-color:rgba(239,68,68,0.02);' : ''}">
                                            <td style="font-family:monospace; font-weight:600;">${p.barcode}</td>
                                            <td style="font-weight:600; min-width: 280px;">
                                                <div style="display:flex; align-items:center; gap:0.75rem;">
                                                    ${p.image ? 
                                                        `<img src="${p.image}" alt="product img" style="width:44px; height:44px; border-radius:8px; object-fit:cover; border:1px solid var(--border-color); flex-shrink:0;">` :
                                                        `<div style="width:44px; height:44px; border-radius:8px; background:rgba(205,162,80,0.1); border:1px solid var(--gold-border); display:flex; align-items:center; justify-content:center; color:var(--secondary); flex-shrink:0;"><i data-lucide="image" style="width:20px; height:20px;"></i></div>`
                                                    }
                                                    <div style="display:flex; flex-direction:column; gap:0.2rem; text-align:left;">
                                                        <span style="font-weight:600; color:var(--text-main); line-height:1.2;">${state.lang === 'th' ? p.name_th : p.name_en}</span>
                                                        ${p.description ? `<span style="font-size:0.75rem; color:var(--text-muted); font-weight:400; max-width:320px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.3;">${p.description}</span>` : ''}
                                                        ${p.low_stock ? `<span class="badge badge-danger" style="margin-top:0.25rem; width:fit-content; padding: 0.15rem 0.5rem; font-size: 0.65rem;"><i data-lucide="alert-triangle" style="width:10px; height:10px;"></i> ${t("inv_low_stock_tag")}</span>` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td style="font-weight:700; color:var(--primary);">${p.price.toLocaleString()} ฿</td>
                                            <td style="${p.low_stock ? 'color: var(--danger); font-weight: 700;' : ''}">${p.stock}</td>
                                            <td>${p.min_stock}</td>
                                            <td>
                                                <button class="btn-premium" style="padding:0.4rem 1rem; font-size:0.8rem; background:linear-gradient(135deg, var(--primary), var(--primary-light)); color:white; box-shadow:none;" onclick="showAdjustStockModal(${p.id}, '${state.lang === 'th' ? p.name_th : p.name_en}', ${p.stock})">
                                                    <i data-lucide="edit" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> ${t("inv_adjust")}
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')
                                }
                            </tbody>
                        </table>
                    </div>

                    <!-- Pagination Controls -->
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:1rem 1.5rem; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:1rem;">
                        <!-- Items Per Page Dropdown -->
                        <div style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:var(--text-muted);">
                            <span>${state.lang === 'th' ? 'แสดงข้อมูลต่อหน้า:' : 'Items per page:'}</span>
                            <select class="input-control" style="width:75px; padding:0.4rem 0.5rem; font-size:0.85rem; height:auto; border-radius:8px; cursor:pointer;" onchange="changeInventoryPerPage(this.value)">
                                <option value="20" ${inventoryPerPage === 20 ? 'selected' : ''}>20</option>
                                <option value="50" ${inventoryPerPage === 50 ? 'selected' : ''}>50</option>
                                <option value="100" ${inventoryPerPage === 100 ? 'selected' : ''}>100</option>
                            </select>
                        </div>
                        
                        <!-- Page Info & Navigation -->
                        <div style="display:flex; align-items:center; gap:1rem; font-size:0.85rem;">
                            <span style="color:var(--text-muted);">${state.lang === 'th' ? `หน้า ${inventoryPage} จาก ${totalPages}` : `Page ${inventoryPage} of ${totalPages}`}</span>
                            <div style="display:flex; gap:0.25rem;">
                                <button class="btn-qty" style="width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color); background:transparent; cursor:pointer;" onclick="changeInventoryPage(-1)" ${inventoryPage === 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                    <i data-lucide="chevron-left" style="width:16px; height:16px;"></i>
                                </button>
                                <button class="btn-qty" style="width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; border:1px solid var(--border-color); background:transparent; cursor:pointer;" onclick="changeInventoryPage(1)" ${inventoryPage === totalPages ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                                    <i data-lucide="chevron-right" style="width:16px; height:16px;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Restore focus
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) {
                el.focus();
                if (selStart !== null && selEnd !== null && (el.type === 'text' || el.type === 'search')) {
                    el.setSelectionRange(selStart, selEnd);
                }
            }
        }

        lucide.createIcons();
    } catch (err) {
        console.error("Inventory Render Error:", err);
    }
}

function switchInventoryTab(tab) {
    activeInventoryTab = tab;
    inventorySearchQuery = "";
    inventoryStockFilter = "all";
    inventoryPage = 1;
    renderCurrentPage();
}

let inventorySearchTimeout;
function searchInventory(query) {
    clearTimeout(inventorySearchTimeout);
    inventorySearchTimeout = setTimeout(() => {
        inventorySearchQuery = query;
        inventoryPage = 1;
        renderCurrentPage();
    }, 250);
}

function filterInventoryStock(status) {
    inventoryStockFilter = status;
    inventoryPage = 1;
    renderCurrentPage();
}

// --- PAGE 6: POINT OF SALE (POS) ---
let posCatalogSearch = "";
let posActiveCategory = "all";

async function renderPOS(container) {
    try {
        // Fetch all inventory products for this branch to display in catalog
        const res = await fetch(`${API_BASE}/inventory?branch_id=${state.activeBranchId}`);
        let catalog = await res.json();
        
        // Filter by POS Active Category
        if (posActiveCategory !== "all") {
            catalog = catalog.filter(p => p.category === posActiveCategory);
        }
        
        if (posCatalogSearch) {
            catalog = catalog.filter(p => 
                p.barcode.toLowerCase().includes(posCatalogSearch.toLowerCase()) || 
                p.name_th.toLowerCase().includes(posCatalogSearch.toLowerCase()) || 
                p.name_en.toLowerCase().includes(posCatalogSearch.toLowerCase())
            );
        }

        // Fetch all customers for customer search drop-down
        const custRes = await fetch(`${API_BASE}/customers`);
        const customerList = await custRes.json();

        // Calculate Cart Totals
        const cartGross = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const cartNet = Math.max(0, cartGross - state.cartDiscount);
        
        container.innerHTML = `
            <div class="pos-layout fade-in">
                
                <!-- Catalog Section -->
                <div class="glass-card" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div style="display:flex; gap:1rem;">
                        <!-- Customer Dropdown Selector -->
                        <div style="flex:1;">
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.25rem;">${t("pos_search_cust")}</label>
                            <select class="input-control" onchange="posSelectCustomer(this.value)">
                                <option value="walkin">${t("pos_walkin")}</option>
                                ${customerList.map(c => `
                                    <option value="${c.id}" ${state.posSelectedCustomer && state.posSelectedCustomer.id === c.id ? 'selected' : ''}>
                                        ${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`} (${c.phone})
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <!-- Catalog Search Input -->
                        <div style="flex:1;">
                            <label style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); display:block; margin-bottom:0.25rem;">&nbsp;</label>
                            <div class="search-input-wrapper" style="max-width:none;">
                                <i data-lucide="search" class="search-icon"></i>
                                <input type="text" class="search-control" placeholder="${t("pos_search_prod")}" value="${posCatalogSearch}" oninput="searchPOSCatalog(this.value)">
                            </div>
                        </div>
                    </div>

                    <!-- Category pills horizontal slider -->
                    <div class="pos-category-pills-container">
                        <button class="pos-category-pill ${posActiveCategory === 'all' ? 'active' : ''}" onclick="switchPOSCategory('all')">
                            ${t("pos_all_categories")}
                        </button>
                        ${state.categories.map(cat => `
                            <button class="pos-category-pill ${posActiveCategory === cat.key ? 'active' : ''}" onclick="switchPOSCategory('${cat.key}')">
                                ${state.lang === 'th' ? cat.name_th : cat.name_en}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Products Grid -->
                    <div class="pos-catalog">
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:1rem;">
                            ${catalog.map(p => {
                                const catObj = state.categories.find(cat => cat.key === p.category);
                                const catName = catObj ? (state.lang === 'th' ? catObj.name_th : catObj.name_en) : p.category;
                                return `
                                    <div class="eye-val-box glass-card" style="text-align:left; border-color:${p.stock <= 0 ? 'var(--border-color)' : 'var(--gold-border)'}; cursor:${p.stock <= 0 ? 'not-allowed' : 'pointer'}; opacity:${p.stock <= 0 ? 0.5 : 1}; padding:1rem; flex-direction:column; justify-content:space-between;" onclick="${p.stock > 0 ? `posAddToCart(${JSON.stringify(p).replace(/"/g, '&quot;')})` : ''}">
                                        
                                        <!-- Product Image Wrapper -->
                                        <div class="pos-product-card-img-wrapper">
                                            ${p.image ? `
                                                <img class="pos-product-card-img" src="${p.image}" alt="${p.name_en}">
                                            ` : `
                                                <div class="pos-product-card-img-placeholder">
                                                    <i data-lucide="image" style="width: 24px; height: 24px;"></i>
                                                </div>
                                            `}
                                        </div>

                                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                                            <span style="font-size:0.7rem; color:var(--secondary); font-weight:700; text-transform:uppercase;">${catName}</span>
                                            <span style="font-weight:600; font-size:0.9rem; line-height:1.2; height:2.4rem; overflow:hidden;">${state.lang === 'th' ? p.name_th : p.name_en}</span>
                                        </div>
                                        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-top:1rem;">
                                            <span style="font-size:1.05rem; font-weight:800; color:var(--primary);">${p.price.toLocaleString()} ฿</span>
                                            <span style="font-size:0.75rem; color:${p.stock <= p.min_stock ? 'var(--danger)' : 'var(--text-muted)'}; font-weight:600;">Stock: ${p.stock}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>

                <!-- Shopping Cart Section -->
                <div class="glass-card pos-cart">
                    <h3 style="margin-bottom: 1rem; display:flex; align-items:center; gap:0.5rem; color:var(--primary); padding-bottom:0.75rem; border-bottom:1px solid var(--border-color);">
                        <i data-lucide="shopping-cart"></i> ${t("pos_cart")}
                    </h3>

                    <!-- Cart Scroll List -->
                    <div class="cart-items-wrapper">
                        ${state.cart.length === 0 ? `<div style="text-align:center; color:var(--text-muted); margin-top:4rem;">${t("pos_empty_cart")}</div>` :
                            state.cart.map(item => `
                                <div class="cart-item">
                                    <div class="cart-item-details">
                                        <span class="cart-item-name">${state.lang === 'th' ? item.name_th : item.name_en}</span>
                                        <span class="cart-item-qty-price">${item.price.toLocaleString()} ฿ / ea</span>
                                    </div>
                                    
                                    <div class="cart-qty-control">
                                        <button class="btn-qty" onclick="posUpdateCartQty(${item.id}, -1)">-</button>
                                        <span style="font-weight:700; font-size:1rem; min-width:20px; text-align:center;">${item.quantity}</span>
                                        <button class="btn-qty" onclick="posUpdateCartQty(${item.id}, 1)">+</button>
                                    </div>
                                    
                                    <div style="font-weight:700; color:var(--primary); font-size:1.05rem; min-width:80px; text-align:right;">
                                        ${(item.price * item.quantity).toLocaleString()} ฿
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>

                    <!-- Bill Totals & Discount -->
                    <div class="pos-totals">
                        <div class="total-row">
                            <span>${t("pos_total")}</span>
                            <span style="font-weight:600;">${cartGross.toLocaleString()} ฿</span>
                        </div>
                        <div class="total-row" style="align-items:center;">
                            <span>${t("pos_discount")}</span>
                            <input type="number" class="input-control" style="width:100px; padding:0.35rem 0.75rem; font-size:0.85rem;" value="${state.cartDiscount}" oninput="posSetDiscount(this.value)">
                        </div>
                        <div class="total-row grand">
                            <span>${t("pos_net")}</span>
                            <span>${cartNet.toLocaleString()} ฿</span>
                        </div>
                        
                        <!-- Deposit / Downpayment (Required for Lab jobs) -->
                        <div class="total-row" style="align-items:center; margin-top:0.5rem; border-top:1px dashed var(--border-color); padding-top:0.75rem;">
                            <span>${t("pos_deposit")}</span>
                            <input type="number" class="input-control" style="width:120px; padding:0.35rem 0.75rem; font-size:0.9rem;" value="${state.cartDeposit}" oninput="posSetDeposit(this.value)">
                        </div>

                        <!-- Split payment -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
                            <span style="font-size:0.85rem; font-weight:600; color:var(--text-muted);">${t("pos_split_payment")}</span>
                            <input type="checkbox" style="width:18px; height:18px; cursor:pointer;" ${state.isSplitPayment ? 'checked' : ''} onchange="posToggleSplit(this.checked)">
                        </div>

                        <!-- Payment Channels Dropdown or Inputs -->
                        ${!state.isSplitPayment ? `
                            <div style="margin-top:0.5rem;">
                                <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:0.25rem;">${t("pos_payment_type")}</label>
                                <select class="input-control" onchange="posSelectPaymentMethod(this.value)">
                                    <option value="Cash" ${state.posPaymentMethod === 'Cash' ? 'selected' : ''}>${t("pos_pay_cash")}</option>
                                    <option value="Bank Transfer" ${state.posPaymentMethod === 'Bank Transfer' ? 'selected' : ''}>${t("pos_pay_bank")}</option>
                                    <option value="Credit Card" ${state.posPaymentMethod === 'Credit Card' ? 'selected' : ''}>${t("pos_pay_card")}</option>
                                </select>
                            </div>
                        ` : `
                            <div style="display:flex; flex-direction:column; gap:0.5rem; margin-top:0.5rem; background:rgba(205,162,80,0.03); border:1px solid var(--border-color); padding:0.75rem; border-radius:10px;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.8rem; font-weight:600;">${t("pos_pay_cash")}</span>
                                    <input type="number" class="input-control" style="width:100px; padding:0.25rem 0.5rem; font-size:0.8rem;" value="${state.posSplitPayments.Cash}" oninput="posSetSplitVal('Cash', this.value)">
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.8rem; font-weight:600;">${t("pos_pay_bank")}</span>
                                    <input type="number" class="input-control" style="width:100px; padding:0.25rem 0.5rem; font-size:0.8rem;" value="${state.posSplitPayments['Bank Transfer']}" oninput="posSetSplitVal('Bank Transfer', this.value)">
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.8rem; font-weight:600;">${t("pos_pay_card")}</span>
                                    <input type="number" class="input-control" style="width:100px; padding:0.25rem 0.5rem; font-size:0.8rem;" value="${state.posSplitPayments['Credit Card']}" oninput="posSetSplitVal('Credit Card', this.value)">
                                </div>
                            </div>
                        `}
                    </div>

                    <!-- Submit Button -->
                    <button class="btn-premium" style="width:100%; justify-content:center; padding:0.9rem;" onclick="posCheckout()" ${state.cart.length === 0 ? 'disabled' : ''}>
                        <i data-lucide="check-circle-2"></i> ${t("pos_checkout")}
                    </button>
                </div>

            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("POS Render Error:", err);
    }
}

// Helpers for POS
function searchPOSCatalog(val) {
    posCatalogSearch = val;
    renderCurrentPage();
}

function switchPOSCategory(catKey) {
    posActiveCategory = catKey;
    renderCurrentPage();
}

function posSelectCustomer(val) {
    if (val === "walkin") {
        state.posSelectedCustomer = null;
    } else {
        // Fetch customer name/object
        fetch(`${API_BASE}/customers/${val}`)
            .then(res => res.json())
            .then(data => {
                state.posSelectedCustomer = data.customer;
            });
    }
}

function posAddToCart(prod) {
    const existing = state.cart.find(item => item.id === prod.id);
    if (existing) {
        if (existing.quantity >= prod.stock) {
            alert(t("pos_qty_alert"));
            return;
        }
        existing.quantity += 1;
    } else {
        state.cart.push({ ...prod, quantity: 1 });
    }
    
    // Set default deposit to net price by default
    const cartGross = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    state.cartDeposit = cartGross - state.cartDiscount;
    
    renderCurrentPage();
}

function posUpdateCartQty(prodId, amount) {
    const item = state.cart.find(i => i.id === prodId);
    if (!item) return;
    
    item.quantity += amount;
    if (item.quantity <= 0) {
        state.cart = state.cart.filter(i => i.id !== prodId);
    } else if (item.quantity > item.stock) {
        alert(t("pos_qty_alert"));
        item.quantity = item.stock;
    }
    
    // Recalculate totals
    const cartGross = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    state.cartDeposit = cartGross - state.cartDiscount;

    renderCurrentPage();
}

function posSetDiscount(val) {
    state.cartDiscount = parseFloat(val) || 0;
    const cartGross = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    state.cartDeposit = Math.max(0, cartGross - state.cartDiscount);
    renderCurrentPage();
}

function posSetDeposit(val) {
    state.cartDeposit = parseFloat(val) || 0;
}

function posToggleSplit(checked) {
    state.isSplitPayment = checked;
    renderCurrentPage();
}

function posSelectPaymentMethod(val) {
    state.posPaymentMethod = val;
}

function posSetSplitVal(channel, val) {
    state.posSplitPayments[channel] = parseFloat(val) || 0;
}

async function posCheckout() {
    if (state.cart.length === 0) return;
    
    const cartGross = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartNet = Math.max(0, cartGross - state.cartDiscount);
    
    // Validation for split payment totals
    if (state.isSplitPayment) {
        const splitSum = Object.values(state.posSplitPayments).reduce((sum, v) => sum + v, 0);
        if (splitSum !== state.cartDeposit) {
            alert(`ยอดชำระมัดจำแยกช่องทาง (${splitSum} ฿) ต้องเท่ากับยอดมัดจำทั้งหมด (${state.cartDeposit} ฿)\nSplit channel total (${splitSum} ฿) must equal deposit total (${state.cartDeposit} ฿).`);
            return;
        }
    }

    const orderData = {
        customer_id: state.posSelectedCustomer ? state.posSelectedCustomer.id : null,
        customer_name: state.posSelectedCustomer ? 
            (state.lang === 'th' ? `${state.posSelectedCustomer.first_name_th} ${state.posSelectedCustomer.last_name_th}` : `${state.posSelectedCustomer.first_name_en} ${state.posSelectedCustomer.last_name_en}`) : 
            t("pos_walkin"),
        branch_id: state.activeBranchId,
        total_amount: cartNet,
        deposit_amount: state.cartDeposit,
        payment_method: state.isSplitPayment ? "Split Channels" : state.posPaymentMethod,
        payment_details: state.isSplitPayment ? state.posSplitPayments : { [state.posPaymentMethod]: state.cartDeposit },
        status: state.cartDeposit >= cartNet ? "Paid" : "Deposit",
        items: state.cart.map(i => ({ product_id: i.id, quantity: i.quantity, price: i.price })),
        staff_id: state.user ? state.user.id : null
    };

    try {
        const res = await fetch(`${API_BASE}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderData)
        });
        const data = await res.json();
        
        if (data.success) {
            alert(t("pos_success"));
            
            // Show Printable Receipt Modal
            showReceiptPreviewModal(data.order_id, data.date, orderData);
            
            // Reset POS State
            state.cart = [];
            state.cartDiscount = 0;
            state.cartDeposit = 0;
            state.isSplitPayment = false;
            state.posSplitPayments = { Cash: 0, "Bank Transfer": 0, "Credit Card": 0 };
            
            renderCurrentPage();
        }
    } catch (err) {
        console.error("POS Order Checkout Error:", err);
        alert("ทำรายการล้มเหลว กรุณาตรวจสอบจำนวนสินค้าคงคลัง / Transaction failed, check inventory levels.");
    }
}

// --- PAGE 7: APPOINTMENTS INTERACTIVE CALENDAR ---
let calendarState = {
    view: "week", // 'month', 'week', 'day', 'staff'
    date: new Date("2026-05-29"),
    staffFilter: "all"
};

function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0 is Sunday, 1 is Monday...
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // 1 = Monday
    const startOfWeek = new Date(date.setDate(diff));
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
}

function formatCalendarTitle() {
    const d = calendarState.date;
    const locale = state.lang === 'th' ? 'th-TH' : 'en-US';
    
    if (calendarState.view === "month") {
        return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    } else if (calendarState.view === "week") {
        const start = getStartOfWeek(d);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        
        const startStr = start.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
        const endStr = end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
        return `${startStr} - ${endStr}`;
    } else {
        return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    }
}

async function renderAppointments(container) {
    try {
        // Fetch all appointments
        const res = await fetch(`${API_BASE}/appointments?branch_id=${state.activeBranchId}`);
        const allApts = await res.json();
        
        // Fetch all staff users for filter & column views
        const usersRes = await fetch(`${API_BASE}/users`);
        const staffUsers = await usersRes.json();
        
        // Add staff names to appointments
        allApts.forEach(apt => {
            const staff = staffUsers.find(u => u.id === apt.staff_id);
            apt.staff_name = staff ? staff.username : "-";
        });

        // Filter appointments based on staff filter (if applicable to non-staff views)
        const filteredApts = allApts.filter(a => {
            if (calendarState.view === "staff") return true; // staff view handles columns itself
            return calendarState.staffFilter === "all" || String(a.staff_id) === String(calendarState.staffFilter);
        });

        // Generate Toolbar UI
        const toolbarHTML = `
            <div class="actions-bar" style="flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: 1.5rem;">
                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap: wrap;">
                    <h3 style="color:var(--primary-light); font-size:1.25rem; display:flex; align-items:center; gap:0.5rem; margin-right:1rem;">
                        <i data-lucide="calendar"></i> ${formatCalendarTitle()}
                    </h3>
                    <div style="display:flex; gap:0.25rem; background:rgba(0,0,0,0.1); padding:0.25rem; border-radius:10px; border:1px solid var(--border-color); align-items:center;">
                        <button class="btn-qty" style="width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;" onclick="prevCalendarPeriod()"><i data-lucide="chevron-left" style="width:18px;"></i></button>
                        <button class="btn-qty" style="padding:0 0.75rem; height:34px; font-size:0.8rem; font-weight:600; border-radius:8px;" onclick="goCalendarToday()">${state.lang === 'th' ? 'วันนี้' : 'Today'}</button>
                        <button class="btn-qty" style="width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;" onclick="nextCalendarPeriod()"><i data-lucide="chevron-right" style="width:18px;"></i></button>
                    </div>
                </div>

                <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap: wrap; margin-left: auto;">
                    <!-- Staff Filter -->
                    ${calendarState.view !== 'staff' ? `
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span style="font-size:0.85rem; font-weight:600; color:var(--text-muted);">${t("apt_select_staff_lbl")}:</span>
                            <select class="input-control" style="width:150px; padding:0.4rem 0.75rem; font-size:0.85rem; height:38px;" onchange="filterCalendarStaff(this.value)">
                                <option value="all" ${calendarState.staffFilter === 'all' ? 'selected' : ''}>${t("apt_all_staff")}</option>
                                ${staffUsers.map(u => `<option value="${u.id}" ${String(calendarState.staffFilter) === String(u.id) ? 'selected' : ''}>${u.username}</option>`).join('')}
                            </select>
                        </div>
                    ` : ''}

                    <!-- View Switcher -->
                    <div style="display:flex; gap:0.25rem; background:rgba(0,0,0,0.1); padding:0.25rem; border-radius:10px; border:1px solid var(--border-color); height:38px; align-items:center;">
                        <button class="btn-qty ${calendarState.view === 'month' ? 'active' : ''}" style="padding:0 0.85rem; height:30px; font-size:0.8rem; font-weight:600; background:${calendarState.view === 'month' ? 'var(--secondary)' : 'transparent'}; color:${calendarState.view === 'month' ? 'var(--primary)' : 'var(--text-muted)'}; border:none; border-radius:6px;" onclick="switchCalendarView('month')">${t("apt_month")}</button>
                        <button class="btn-qty ${calendarState.view === 'week' ? 'active' : ''}" style="padding:0 0.85rem; height:30px; font-size:0.8rem; font-weight:600; background:${calendarState.view === 'week' ? 'var(--secondary)' : 'transparent'}; color:${calendarState.view === 'week' ? 'var(--primary)' : 'var(--text-muted)'}; border:none; border-radius:6px;" onclick="switchCalendarView('week')">${t("apt_week_tab")}</button>
                        <button class="btn-qty ${calendarState.view === 'day' ? 'active' : ''}" style="padding:0 0.85rem; height:30px; font-size:0.8rem; font-weight:600; background:${calendarState.view === 'day' ? 'var(--secondary)' : 'transparent'}; color:${calendarState.view === 'day' ? 'var(--primary)' : 'var(--text-muted)'}; border:none; border-radius:6px;" onclick="switchCalendarView('day')">${t("apt_day")}</button>
                        <button class="btn-qty ${calendarState.view === 'staff' ? 'active' : ''}" style="padding:0 0.85rem; height:30px; font-size:0.8rem; font-weight:600; background:${calendarState.view === 'staff' ? 'var(--secondary)' : 'transparent'}; color:${calendarState.view === 'staff' ? 'var(--primary)' : 'var(--text-muted)'}; border:none; border-radius:6px;" onclick="switchCalendarView('staff')">${t("apt_staff")}</button>
                    </div>

                    <!-- Add Appointment -->
                    <button class="btn-premium" style="height:38px; display:flex; align-items:center; gap:0.25rem;" onclick="showAddAppointmentModal()">
                        <i data-lucide="plus-circle" style="width:16px;"></i> ${t("apt_add")}
                    </button>
                </div>
            </div>
        `;

        // Render Calendar Body based on view mode
        let calendarBodyHTML = "";

        if (calendarState.view === "month") {
            const year = calendarState.date.getFullYear();
            const month = calendarState.date.getMonth();
            const firstDay = new Date(year, month, 1);
            const startGridDate = getStartOfWeek(firstDay);
            
            const weekdays = state.lang === 'th' 
                ? ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."]
                : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                
            calendarBodyHTML = `
                <div class="calendar-month-grid">
                    <!-- Weekday Headers -->
                    ${weekdays.map(w => `<div class="calendar-day-header" style="padding:0.5rem; font-size:0.8rem; text-align:center;">${w}</div>`).join('')}
                    
                    <!-- Calendar Cells -->
                    ${Array.from({ length: 42 }).map((_, idx) => {
                        const current = new Date(startGridDate);
                        current.setDate(startGridDate.getDate() + idx);
                        const dateStr = current.toISOString().slice(0, 10);
                        const isToday = current.toDateString() === new Date().toDateString();
                        const isCurrentMonth = current.getMonth() === month;
                        
                        const dayApts = filteredApts.filter(a => a.date_time.slice(0, 10) === dateStr);
                        
                        return `
                            <div class="calendar-month-cell ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''}">
                                <div class="calendar-month-day-num">
                                    <span>${current.getDate()}</span>
                                    ${dayApts.length > 0 ? `<span style="display:flex; gap:2px;">${dayApts.map(a => `<span class="calendar-month-apt-dot" style="background-color:${a.type === 'eye_exam' ? 'var(--secondary)' : a.type === 'pickup' ? '#10b981' : '#3b82f6'};"></span>`).join('')}</span>` : ''}
                                </div>
                                <div class="calendar-month-apts-container">
                                    ${dayApts.map(a => `
                                        <div class="calendar-month-apt-badge apt-${a.type}" style="cursor:pointer;" onclick="viewAppointmentDetail(${JSON.stringify(a).replace(/"/g, '&quot;')})">
                                            ${a.call_status === 'confirmed' ? '🟢' : a.call_status === 'no_answer' ? '🔴' : a.call_status === 'cancelled' ? '⚪' : '🟡'} ${a.date_time.slice(11)} ${a.customer_name} ${a.customer_phone ? `(${a.customer_phone})` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else if (calendarState.view === "week") {
            const startOfWeek = getStartOfWeek(calendarState.date);
            const days = [];
            for (let i = 0; i < 7; i++) {
                const current = new Date(startOfWeek);
                current.setDate(startOfWeek.getDate() + i);
                const dateStr = current.toISOString().slice(0, 10);
                const isToday = current.toDateString() === new Date().toDateString();
                
                days.push({
                    name: current.toLocaleDateString(state.lang === 'th' ? 'th-TH' : 'en-US', { weekday: 'short', day: 'numeric' }),
                    date: dateStr,
                    isToday: isToday
                });
            }

            calendarBodyHTML = `
                <div class="calendar-grid">
                    ${days.map(d => {
                        const dayApts = filteredApts.filter(a => a.date_time.slice(0, 10) === d.date);
                        dayApts.sort((a, b) => a.date_time.localeCompare(b.date_time));
                        
                        return `
                            <div class="calendar-day-cell ${d.isToday ? 'today' : ''}">
                                <div class="calendar-day-num">
                                    <span>${d.name}</span>
                                    ${d.isToday ? `<span class="badge badge-success" style="font-size:0.65rem; padding:0.15rem 0.4rem;">Today</span>` : ''}
                                </div>
                                <div style="display:flex; flex-direction:column; gap:0.5rem; flex-grow:1; overflow-y:auto;">
                                    ${dayApts.length === 0 
                                        ? `<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; margin-top:2rem;">-</div>` 
                                        : dayApts.map(a => `
                                            <div class="appointment-item apt-${a.type}" style="cursor:pointer;" onclick="viewAppointmentDetail(${JSON.stringify(a).replace(/"/g, '&quot;')})">
                                                <span style="font-weight:700; color:var(--primary); font-size:0.8rem; display:flex; align-items:center; gap:0.25rem;"><i data-lucide="clock" style="width:11px; height:11px;"></i> ${a.date_time.slice(11)}</span>
                                                <span style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-top:0.1rem;">${a.customer_name}</span>
                                                ${a.customer_phone ? `
                                                    <span style="font-size:0.7rem; color:var(--text-muted); display:flex; align-items:center; gap:0.25rem; margin-top:0.05rem;">
                                                        <i data-lucide="phone" style="width:10px; height:10px;"></i> ${a.customer_phone}
                                                    </span>
                                                ` : ''}
                                                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:0.25rem; align-items:center;">
                                                    <span class="badge apt-${a.type}" style="color:white; font-size:0.6rem; padding:0.1rem 0.35rem; border-radius:4px;">
                                                        ${t('apt_type_' + a.type.replace('eye_', ''))}
                                                    </span>
                                                    ${getCallStatusBadge(a.call_status)}
                                                </div>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else if (calendarState.view === "day") {
            const dayStr = calendarState.date.toISOString().slice(0, 10);
            const dayApts = filteredApts.filter(a => a.date_time.slice(0, 10) === dayStr);
            dayApts.sort((a, b) => a.date_time.localeCompare(b.date_time));

            calendarBodyHTML = `
                <div class="calendar-day-agenda">
                    ${dayApts.length === 0 
                        ? `<div class="glass-card" style="text-align:center; color:var(--text-muted); padding:4rem 0;">${state.lang === 'th' ? 'ไม่มีนัดหมายในวันนี้' : 'No appointments scheduled for this day'}</div>`
                        : dayApts.map(a => `
                            <div class="calendar-agenda-item" style="cursor:pointer;" onclick="viewAppointmentDetail(${JSON.stringify(a).replace(/"/g, '&quot;')})">
                                <div class="calendar-agenda-time">${a.date_time.slice(11)}</div>
                                <div class="calendar-agenda-details">
                                    <div class="calendar-agenda-name">${a.customer_name} ${a.customer_phone ? `<span style="font-weight:normal; font-size:0.85rem; color:var(--text-muted); margin-left:0.5rem;"><i data-lucide="phone" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-right:2px;"></i> ${a.customer_phone}</span>` : ''}</div>
                                    <div class="calendar-agenda-notes">${a.notes || ''}</div>
                                    <div class="calendar-agenda-meta" style="margin-top: 0.5rem; display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                                        <span class="badge apt-${a.type}" style="color:white;">${t('apt_type_' + a.type.replace('eye_', ''))}</span>
                                        ${getCallStatusBadge(a.call_status)}
                                        <span style="font-size:0.85rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem;">
                                            <i data-lucide="user" style="width:14px; height:14px;"></i> ${state.lang === 'th' ? 'ผู้ดูแล:' : 'Staff:'} ${a.staff_name}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            `;
        } else if (calendarState.view === "staff") {
            const dayStr = calendarState.date.toISOString().slice(0, 10);
            const dayApts = allApts.filter(a => a.date_time.slice(0, 10) === dayStr);
            const unassignedApts = dayApts.filter(a => !a.staff_id);

            calendarBodyHTML = `
                <div class="calendar-staff-grid">
                    ${staffUsers.map(u => {
                        const staffApts = dayApts.filter(a => String(a.staff_id) === String(u.id));
                        staffApts.sort((a, b) => a.date_time.localeCompare(b.date_time));
                        
                        return `
                            <div class="calendar-staff-column">
                                <div class="calendar-staff-header">
                                    <div class="calendar-staff-name">${u.username}</div>
                                    <div class="calendar-staff-role" style="text-transform:capitalize;">${t('user_role_' + u.role) || u.role}</div>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:0.5rem; flex-grow:1; overflow-y:auto; min-height: 250px;">
                                    ${staffApts.length === 0 
                                        ? `<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; margin-top:3rem;">${state.lang === 'th' ? 'ไม่มีงานนัดหมาย' : 'No appointments'}</div>`
                                        : staffApts.map(a => `
                                            <div class="appointment-item apt-${a.type}" style="cursor:pointer;" onclick="viewAppointmentDetail(${JSON.stringify(a).replace(/"/g, '&quot;')})">
                                                <span style="font-weight:700; color:var(--primary); font-size:0.8rem; display:flex; align-items:center; gap:0.25rem;"><i data-lucide="clock" style="width:11px; height:11px;"></i> ${a.date_time.slice(11)}</span>
                                                <span style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-top:0.1rem;">${a.customer_name}</span>
                                                ${a.customer_phone ? `
                                                    <span style="font-size:0.7rem; color:var(--text-muted); display:flex; align-items:center; gap:0.25rem; margin-top:0.05rem;">
                                                        <i data-lucide="phone" style="width:10px; height:10px;"></i> ${a.customer_phone}
                                                    </span>
                                                ` : ''}
                                                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:0.25rem; align-items:center;">
                                                    <span class="badge apt-${a.type}" style="color:white; font-size:0.6rem; padding:0.1rem 0.35rem; border-radius:4px;">
                                                        ${t('apt_type_' + a.type.replace('eye_', ''))}
                                                    </span>
                                                    ${getCallStatusBadge(a.call_status)}
                                                </div>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${unassignedApts.length > 0 ? `
                        <div class="calendar-staff-column" style="border-color:var(--border-color); background:rgba(0,0,0,0.02);">
                            <div class="calendar-staff-header">
                                <div class="calendar-staff-name" style="color:var(--text-muted);">${state.lang === 'th' ? 'ไม่ได้ระบุพนักงาน' : 'Unassigned'}</div>
                                <div class="calendar-staff-role">-</div>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:0.5rem; flex-grow:1; overflow-y:auto; min-height: 250px;">
                                ${unassignedApts.map(a => `
                                    <div class="appointment-item apt-${a.type}" style="cursor:pointer;" onclick="viewAppointmentDetail(${JSON.stringify(a).replace(/"/g, '&quot;')})">
                                        <span style="font-weight:700; color:var(--primary); font-size:0.8rem; display:flex; align-items:center; gap:0.25rem;"><i data-lucide="clock" style="width:11px; height:11px;"></i> ${a.date_time.slice(11)}</span>
                                        <span style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-top:0.1rem;">${a.customer_name}</span>
                                        ${a.customer_phone ? `
                                            <span style="font-size:0.7rem; color:var(--text-muted); display:flex; align-items:center; gap:0.25rem; margin-top:0.05rem;">
                                                <i data-lucide="phone" style="width:10px; height:10px;"></i> ${a.customer_phone}
                                            </span>
                                        ` : ''}
                                        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:0.25rem; align-items:center;">
                                            <span class="badge apt-${a.type}" style="color:white; font-size:0.6rem; padding:0.1rem 0.35rem; border-radius:4px;">
                                                ${t('apt_type_' + a.type.replace('eye_', ''))}
                                            </span>
                                            ${getCallStatusBadge(a.call_status)}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        container.innerHTML = `
            <div class="fade-in">
                ${toolbarHTML}
                ${calendarBodyHTML}
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("Appointments Render Error:", err);
    }
}

function getCallStatusBadge(status) {
    status = status || "pending";
    let icon = "phone";
    let text = t('apt_status_' + status);
    let colorClass = "badge-secondary";
    
    if (status === "confirmed") {
        icon = "phone-call";
        colorClass = "badge-success";
    } else if (status === "no_answer") {
        icon = "phone-off";
        colorClass = "badge-warning";
    } else if (status === "cancelled") {
        icon = "phone-missed";
        colorClass = "badge-danger";
    }
    
    return `<span class="badge ${colorClass}" style="font-size:0.6rem; padding:0.15rem 0.4rem; border-radius:6px; display:inline-flex; align-items:center; gap:2px; vertical-align:middle;"><i data-lucide="${icon}" style="width:10px; height:10px;"></i> ${text}</span>`;
}

async function updateAppointmentCallStatus(id, newStatus) {
    try {
        const res = await fetch(`${API_BASE}/appointments/${id}/call_status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ call_status: newStatus })
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        } else {
            alert("ไม่สามารถอัปเดตสถานะการโทรได้ / Failed to update call status");
        }
    } catch (err) {
        console.error("Error updating call status:", err);
        alert("ไม่สามารถอัปเดตสถานะการโทรได้ / Failed to update call status");
    }
}

function switchCalendarView(view) {
    calendarState.view = view;
    renderCurrentPage();
}

function filterCalendarStaff(staffId) {
    calendarState.staffFilter = staffId;
    renderCurrentPage();
}

function prevCalendarPeriod() {
    const d = new Date(calendarState.date);
    if (calendarState.view === "month") {
        d.setMonth(d.getMonth() - 1);
    } else if (calendarState.view === "week") {
        d.setDate(d.getDate() - 7);
    } else {
        d.setDate(d.getDate() - 1);
    }
    calendarState.date = d;
    renderCurrentPage();
}

function nextCalendarPeriod() {
    const d = new Date(calendarState.date);
    if (calendarState.view === "month") {
        d.setMonth(d.getMonth() + 1);
    } else if (calendarState.view === "week") {
        d.setDate(d.getDate() + 7);
    } else {
        d.setDate(d.getDate() + 1);
    }
    calendarState.date = d;
    renderCurrentPage();
}

function goCalendarToday() {
    calendarState.date = new Date();
    renderCurrentPage();
}

function viewAppointmentDetail(a) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    const staffName = a.staff_name || "-";
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 450px;">
            <div class="modal-header">
                <h3><i data-lucide="calendar"></i> ${state.lang === 'th' ? 'รายละเอียดนัดหมาย' : 'Appointment Details'}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body" style="display:flex; flex-direction:column; gap:1rem;">
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${state.lang === 'th' ? 'วันและเวลา:' : 'Date & Time:'}</span>
                    <span style="font-weight:600; color:var(--primary);">${a.date_time}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${state.lang === 'th' ? 'ชื่อลูกค้า:' : 'Customer Name:'}</span>
                    <span style="font-weight:600;">${a.customer_name}</span>
                </div>
                ${a.customer_phone ? `
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${t("cust_phone")}:</span>
                    <span style="font-weight:600; color:var(--primary-light); display:inline-flex; align-items:center; gap:0.25rem;"><i data-lucide="phone" style="width:14px; height:14px;"></i> ${a.customer_phone}</span>
                </div>
                ` : ''}
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${state.lang === 'th' ? 'ประเภท:' : 'Type:'}</span>
                    <span class="badge apt-${a.type}" style="color:white;">${t('apt_type_' + a.type.replace('eye_', ''))}</span>
                </div>
                <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${state.lang === 'th' ? 'ผู้ดูแล:' : 'Assigned Staff:'}</span>
                    <span style="font-weight:600; color:var(--secondary);">${staffName}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${t("apt_status_lbl")}:</span>
                    <select class="input-control" style="width:180px; padding:0.35rem 0.5rem; font-size:0.85rem; height:34px;" onchange="updateAppointmentCallStatus(${a.id}, this.value)">
                        <option value="pending" ${a.call_status === 'pending' ? 'selected' : ''}>${t("apt_status_pending")}</option>
                        <option value="confirmed" ${a.call_status === 'confirmed' ? 'selected' : ''}>${t("apt_status_confirmed")}</option>
                        <option value="no_answer" ${a.call_status === 'no_answer' ? 'selected' : ''}>${t("apt_status_no_answer")}</option>
                        <option value="cancelled" ${a.call_status === 'cancelled' ? 'selected' : ''}>${t("apt_status_cancelled")}</option>
                    </select>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.25rem;">
                    <span style="font-weight:700; color:var(--text-muted);">${t("apt_notes")}:</span>
                    <div style="background:var(--bg-main); border:1px solid var(--border-color); padding:0.75rem; border-radius:8px; min-height:60px; font-size:0.9rem; white-space:pre-wrap;">${a.notes || '-'}</div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn-premium" onclick="closeModal()">${t("modal_close")}</button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// --- PAGE 8: USERS & PERMISSIONS ---
function switchUsersTab(tab) {
    state.activeUsersTab = tab;
    renderCurrentPage();
}

function getAuditBadgeClass(action) {
    if (action.startsWith("CREATE_")) return "badge-success";
    if (action.startsWith("UPDATE_")) return "badge-warning";
    if (action.startsWith("DELETE_")) return "badge-danger";
    if (action === "LOGIN") return "badge-info";
    return "badge-info";
}

async function renderUsers(container) {
    try {
        if (!state.activeUsersTab) state.activeUsersTab = "directory";
        
        if (state.activeUsersTab === "directory") {
            const res = await fetch(`${API_BASE}/users`);
            const data = await res.json();
            
            container.innerHTML = `
                <div class="fade-in">
                    <div class="glass-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                            <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:var(--primary);">
                                <i data-lucide="user-check"></i> ${t("user_title")}
                            </h3>
                            <button class="btn-premium" onclick="showAddUserModal()">
                                <i data-lucide="user-plus" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_add_btn")}
                            </button>
                        </div>
                        
                        <!-- Sub-tabs navigation -->
                        <div class="reports-tabs" style="margin-bottom: 1.5rem; display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                            <button class="tab-btn ${state.activeUsersTab === "directory" ? "active" : ""}" onclick="switchUsersTab('directory')">
                                <i data-lucide="users" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_directory")}
                            </button>
                            <button class="tab-btn ${state.activeUsersTab === "roles" ? "active" : ""}" onclick="switchUsersTab('roles')">
                                <i data-lucide="shield-check" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_roles")}
                            </button>
                            <button class="tab-btn ${state.activeUsersTab === "audit" ? "active" : ""}" onclick="switchUsersTab('audit')">
                                <i data-lucide="clipboard-list" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_audit")}
                            </button>
                        </div>
                        
                        <div class="table-wrapper">
                            <table class="custom-table">
                                <thead>
                                    <tr>
                                        <th>${t("user_table_name")}</th>
                                        <th>${t("user_table_email")}</th>
                                        <th>${t("user_lbl_phone")}</th>
                                        <th>${t("user_table_role")}</th>
                                        <th>${t("user_table_branch")}</th>
                                        <th>${t("user_lbl_status")}</th>
                                        <th>${t("user_table_perms")}</th>
                                        <th>${t("cust_actions")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.map(u => {
                                        const activePerms = Object.keys(u.permissions).filter(k => u.permissions[k]).map(k => t('menu_' + k));
                                        const isSelf = state.user && u.id === state.user.id;
                                        
                                        return `
                                            <tr>
                                                <td style="font-weight:600;">${u.username}</td>
                                                <td>${u.email}</td>
                                                <td>${u.phone || '-'}</td>
                                                <td style="font-weight:600; color:var(--secondary); text-transform:capitalize;">${t('user_role_' + u.role)}</td>
                                                <td>${u.branch_name || '-'}</td>
                                                <td>
                                                    <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">${t('user_status_' + u.status)}</span>
                                                </td>
                                                <td>
                                                    <div style="display:flex; flex-wrap:wrap; gap:0.25rem;">
                                                        ${activePerms.map(p => `<span class="badge badge-info" style="font-size:0.65rem;">${p}</span>`).join('')}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="display:flex; gap:0.35rem;">
                                                        <button class="btn-premium" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="showEditPermissionsModal(${u.id}, '${u.username}', '${u.role}', ${JSON.stringify(u.permissions).replace(/"/g, '&quot;')}, ${u.branch_id}, '${u.phone || ''}', '${u.status || 'active'}')">
                                                            <i data-lucide="shield-alert" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> ${t("user_edit_perms")}
                                                        </button>
                                                        <button class="btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem; border-color:var(--secondary); color:var(--secondary);" onclick="showChangePasswordModal(${u.id}, '${u.username}')" title="${t("change_pw_title")}">
                                                            <i data-lucide="key" style="width:14px; height:14px; vertical-align:middle;"></i>
                                                        </button>
                                                        <button class="btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem; border-color:var(--danger); color:var(--danger); ${isSelf ? 'opacity:0.5; cursor:not-allowed;' : ''}" ${isSelf ? 'disabled' : `onclick="deleteUser(${u.id})"`}>
                                                            <i data-lucide="trash-2" style="width:14px; height:14px; vertical-align:middle;"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.activeUsersTab === "roles") {
            let rolesData = [];
            try {
                const rolesRes = await fetch(`${API_BASE}/roles`);
                if (rolesRes.ok) {
                    rolesData = await rolesRes.json();
                } else {
                    console.error("Failed to fetch roles:", rolesRes.statusText);
                }
            } catch (fetchErr) {
                console.error("Failed to fetch roles due to error:", fetchErr);
            }
            if (!Array.isArray(rolesData)) {
                rolesData = [];
            }
            
            const allMenus = ["dashboard", "customers", "inventory", "pos", "appointments", "users", "reports", "settings"];
            const rolesList = ["admin", "optometrist", "receptionist"];

            container.innerHTML = `
                <div class="fade-in">
                    <div class="glass-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                            <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:var(--primary);">
                                <i data-lucide="user-check"></i> ${t("user_title")}
                            </h3>
                        </div>
                        
                        <!-- Sub-tabs navigation -->
                        <div class="reports-tabs" style="margin-bottom: 1.5rem; display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                            <button class="tab-btn ${state.activeUsersTab === "directory" ? "active" : ""}" onclick="switchUsersTab('directory')">
                                <i data-lucide="users" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_directory")}
                            </button>
                            <button class="tab-btn ${state.activeUsersTab === "roles" ? "active" : ""}" onclick="switchUsersTab('roles')">
                                <i data-lucide="shield-check" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_roles")}
                            </button>
                            <button class="tab-btn ${state.activeUsersTab === "audit" ? "active" : ""}" onclick="switchUsersTab('audit')">
                                <i data-lucide="clipboard-list" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_audit")}
                            </button>
                        </div>
                        
                        <p style="color:var(--text-muted); font-size:0.95rem; margin-bottom:1.5rem;">
                            * ${t("user_save_roles")}
                        </p>

                        <div class="table-wrapper">
                            <table class="custom-table" style="max-width:800px;">
                                <thead>
                                    <tr>
                                        <th>${t("user_table_perms")}</th>
                                        ${rolesList.map(r => `<th>${t("user_role_" + r)}</th>`).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${allMenus.map(menu => {
                                        return `
                                            <tr>
                                                <td style="font-weight:600;">${t("menu_" + menu)}</td>
                                                ${rolesList.map(r => {
                                                    const rObj = rolesData.find(x => x.role === r);
                                                    const isChecked = rObj && rObj.permissions && rObj.permissions[menu] ? "checked" : "";
                                                    return `
                                                        <td>
                                                            <input type="checkbox" class="role-matrix-chk" data-role="${r}" data-menu="${menu}" style="width:20px; height:20px; cursor:pointer;" ${isChecked}>
                                                        </td>
                                                    `;
                                                }).join('')}
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                        
                        <div style="margin-top:1.5rem; display:flex; justify-content:flex-end;">
                            <button class="btn-premium" onclick="saveRolePermissionsMatrix()">
                                <i data-lucide="save" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("modal_save")}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.activeUsersTab === "audit") {
            const auditRes = await fetch(`${API_BASE}/audit-logs`);
            const auditLogs = await auditRes.json();
            
            container.innerHTML = `
                <div class="fade-in">
                    <div class="glass-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
                            <h3 style="margin:0; display:flex; align-items:center; gap:0.5rem; color:var(--primary);">
                                <i data-lucide="user-check"></i> ${t("user_title")}
                            </h3>
                        </div>
                        
                        <!-- Sub-tabs navigation -->
                        <div class="reports-tabs" style="margin-bottom: 1.5rem; display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                            <button class="tab-btn ${state.activeUsersTab === "directory" ? "active" : ""}" onclick="switchUsersTab('directory')">
                                <i data-lucide="users" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_directory")}
                            </button>
                            <button class="tab-btn ${state.activeUsersTab === "roles" ? "active" : ""}" onclick="switchUsersTab('roles')">
                                <i data-lucide="shield-check" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_roles")}
                            </button>
                            <button class="tab-btn ${state.activeUsersTab === "audit" ? "active" : ""}" onclick="switchUsersTab('audit')">
                                <i data-lucide="clipboard-list" style="width:16px; height:16px; margin-right:0.25rem; vertical-align:middle;"></i> ${t("user_tab_audit")}
                            </button>
                        </div>

                        <div class="table-wrapper">
                            <table class="custom-table">
                                <thead>
                                    <tr>
                                        <th>${t("audit_col_time")}</th>
                                        <th>${t("audit_col_user")}</th>
                                        <th>${t("audit_col_action")}</th>
                                        <th>${t("audit_col_details")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${auditLogs.length === 0 ? `
                                        <tr>
                                            <td colspan="4" style="text-align:center; color:var(--text-muted); padding:2rem;">No audit logs recorded yet.</td>
                                        </tr>
                                    ` : auditLogs.map(log => `
                                        <tr>
                                            <td style="white-space:nowrap; font-size:0.85rem; color:var(--text-muted);">${log.timestamp}</td>
                                            <td style="font-weight:600;">${log.username} ${log.user_id ? `<span style="font-size:0.75rem; color:var(--text-muted);">(ID: ${log.user_id})</span>` : '<span style="font-size:0.75rem; color:var(--text-muted);">(System)</span>'}</td>
                                            <td><span class="badge ${getAuditBadgeClass(log.action)}" style="font-size:0.75rem;">${log.action}</span></td>
                                            <td style="font-size:0.9rem;">${log.details}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
        lucide.createIcons();
    } catch (err) {
        console.error("Users Render Error:", err);
    }
}

// --- PAGE 9: REPORTS (CHART.JS GRAPHS) ---
// --- PAGE 9: REPORTS (CHART.JS GRAPHS & EXPORT EXCEL) ---
function switchReportsTab(tabName) {
    state.activeReportsTab = tabName;
    renderCurrentPage();
}

function exportToExcel(filename, headers, rows) {
    let csvContent = "\uFEFF"; // UTF-8 BOM so Thai characters display correctly in Excel
    csvContent += headers.join(",") + "\n";
    rows.forEach(row => {
        const rowStr = row.map(val => {
            let text = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
            if (text.includes(',') || text.includes('\n') || text.includes('"')) {
                text = `"${text}"`;
            }
            return text;
        }).join(",");
        csvContent += rowStr + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename + ".csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportReport(type) {
    if (!state.reportsData) {
        alert("No data available to export");
        return;
    }

    let headers = [];
    let rows = [];
    let filename = "";

    switch(type) {
        case 'sales_daily':
            filename = `Daily_Sales_Report_Branch_${state.activeBranchId}`;
            headers = ["Date (วันที่)", "Bills (จำนวนบิล)", "Sales (ยอดขายรวม)", "Collected (ยอดมัดจำ/รับเงิน)"];
            rows = state.reportsData.sales.daily.map(d => [d.day, d.bills, d.sales, d.deposit]);
            break;
        case 'sales_monthly':
            filename = `Monthly_Sales_Report_Branch_${state.activeBranchId}`;
            headers = ["Month (เดือน)", "Bills (จำนวนบิล)", "Sales (ยอดขายรวม)", "Collected (ยอดมัดจำ/รับเงิน)"];
            rows = state.reportsData.sales.monthly.map(m => [m.month, m.bills, m.sales, m.deposit]);
            break;
        case 'sales_by_product':
            filename = `Sales_By_Product_Branch_${state.activeBranchId}`;
            headers = ["Barcode (บาร์โค้ด)", "Product Name TH (ชื่อสินค้า TH)", "Product Name EN", "Category (หมวดหมู่)", "Quantity Sold (จำนวนชิ้นที่ขาย)", "Total Sales (ยอดขายรวม)"];
            rows = state.reportsData.sales.by_product.map(p => [p.barcode, p.name_th, p.name_en, p.category, p.qty_sold, p.total_sales]);
            break;
        case 'sales_by_staff':
            filename = `Sales_By_Staff_Branch_${state.activeBranchId}`;
            headers = ["Staff Name (ชื่อพนักงาน)", "Role (ตำแหน่ง)", "Bills Issued (จำนวนบิล)", "Total Sales (ยอดขายรวม)"];
            rows = state.reportsData.sales.by_staff.map(s => [s.username, s.role, s.bills, s.total_sales]);
            break;
        case 'customers_new':
            filename = `New_Customers_Report_Branch_${state.activeBranchId}`;
            headers = ["ID", "Name TH", "Name EN", "Phone (เบอร์โทร)", "First Purchase Date (วันที่ซื้อครั้งแรก)", "First Order Amount (ยอดซื้อแรก)"];
            rows = state.reportsData.customers.new.map(c => [c.id, `${c.first_name_th} ${c.last_name_th}`, `${c.first_name_en} ${c.last_name_en}`, c.phone, c.first_purchase_date, c.total_amount]);
            break;
        case 'customers_returning':
            filename = `Returning_Customers_Report_Branch_${state.activeBranchId}`;
            headers = ["ID", "Name TH", "Name EN", "Phone (เบอร์โทร)", "Total Bills (จำนวนบิลทั้งหมด)", "Total Purchases (ยอดซื้อสะสม)"];
            rows = state.reportsData.customers.returning.map(c => [c.id, `${c.first_name_th} ${c.last_name_th}`, `${c.first_name_en} ${c.last_name_en}`, c.phone, c.total_bills, c.total_spent]);
            break;
        case 'customers_due':
            filename = `Due_Eye_Exams_Report_Branch_${state.activeBranchId}`;
            headers = ["ID", "Name TH", "Name EN", "Phone (เบอร์โทร)", "Last Exam Visit (ตรวจล่าสุด)", "Next Exam Due (กำหนดตรวจถัดไป)"];
            rows = state.reportsData.customers.due_checkups.map(c => [c.id, `${c.first_name_th} ${c.last_name_th}`, `${c.first_name_en} ${c.last_name_en}`, c.phone, c.last_visit || '-', c.checkup_due_date || '-']);
            break;
        case 'jobs_work_orders':
            filename = `Work_Orders_Report_Branch_${state.activeBranchId}`;
            headers = ["Job ID (รหัสงาน)", "Order ID (เลขบิล)", "Customer (ชื่อลูกค้า)", "Lens Details (รายละเอียด)", "Status (สถานะ)", "Updated At (อัปเดตล่าสุด)"];
            rows = state.reportsData.jobs.work_orders.map(j => [j.id, j.order_id, j.customer_name, j.details, j.status, j.updated_at]);
            break;
        case 'jobs_pending':
            filename = `Pending_Deliveries_Report_Branch_${state.activeBranchId}`;
            headers = ["Job ID (รหัสงาน)", "Order ID (เลขบิล)", "Customer (ชื่อลูกค้า)", "Details (รายละเอียด)", "Status (สถานะ)", "Order Date (วันที่สั่งซื้อ)", "Days Overdue (วันค้างส่ง)"];
            rows = state.reportsData.jobs.pending.map(j => {
                const diffTime = Math.max(0, Date.now() - new Date(j.order_date).getTime());
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                return [j.id, j.order_id, j.customer_name, j.details, j.status, j.order_date, diffDays];
            });
            break;
        case 'stock_remaining':
            filename = `Inventory_Stock_Report_Branch_${state.activeBranchId}`;
            headers = ["Barcode (บาร์โค้ด)", "Product Name TH (ชื่อสินค้า TH)", "Product Name EN", "Category (หมวดหมู่)", "Price (ราคา)", "Stock Qty (จำนวนสต็อก)", "Stock Value (มูลค่าสต็อก)"];
            rows = state.reportsData.stock.remaining.map(s => [s.barcode, s.name_th, s.name_en, s.category, s.price, s.stock, s.stock_value]);
            break;
        case 'stock_best_sellers':
            filename = `Best_Selling_Products_Branch_${state.activeBranchId}`;
            headers = ["Barcode (บาร์โค้ด)", "Product Name TH (ชื่อสินค้า TH)", "Product Name EN", "Category (หมวดหมู่)", "Quantity Sold (จำนวนชิ้นที่ขาย)", "Total Value (ยอดขายรวม)"];
            rows = state.reportsData.stock.best_sellers.map(p => [p.barcode, p.name_th, p.name_en, p.category, p.qty_sold, p.total_sales]);
            break;
        case 'stock_dead':
            filename = `Dead_Stock_Report_Branch_${state.activeBranchId}`;
            headers = ["Barcode (บาร์โค้ด)", "Product Name TH (ชื่อสินค้า TH)", "Product Name EN", "Category (หมวดหมู่)", "Price (ราคา)", "Stock Qty (จำนวนสต็อก)"];
            rows = state.reportsData.stock.dead_stock.map(d => [d.barcode, d.name_th, d.name_en, d.category, d.price, d.stock]);
            break;
        case 'finance_collected':
            filename = `Revenue_Collected_Report_Branch_${state.activeBranchId}`;
            headers = ["Order ID (เลขบิล)", "Customer (ชื่อลูกค้า)", "Order Date (วันที่)", "Total Amount (ยอดรวม)", "Paid Amount (รับเงินแล้ว)", "Payment Method (ช่องทางการชำระ)", "Status (สถานะ)"];
            rows = state.reportsData.finance.collected.map(f => [f.id, f.customer_name, f.date, f.total_amount, f.deposit_amount, f.payment_method, f.status]);
            break;
        case 'finance_deposits':
            filename = `Deposits_Report_Branch_${state.activeBranchId}`;
            headers = ["Order ID (เลขบิล)", "Customer (ชื่อลูกค้า)", "Order Date (วันที่)", "Total Amount (ยอดรวม)", "Deposit Paid (เงินมัดจำรับ)", "Outstanding Balance (ยอดค้างจ่าย)", "Payment Method (ช่องทางการชำระ)", "Status (สถานะ)"];
            rows = state.reportsData.finance.deposits.map(f => [f.id, f.customer_name, f.date, f.total_amount, f.deposit_amount, f.balance, f.payment_method, f.status]);
            break;
    }

    exportToExcel(filename, headers, rows);
}

async function renderReports(container) {
    try {
        const res = await fetch(`${API_BASE}/reports?branch_id=${state.activeBranchId}`);
        const data = await res.json();
        state.reportsData = data;
        
        // Build sub-tab menu
        let tabsHtml = `
            <div class="tab-container" style="margin-bottom: 1.5rem;">
                <button class="tab-btn ${state.activeReportsTab === 'sales' ? 'active' : ''}" onclick="switchReportsTab('sales')"><i data-lucide="banknote" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> ${t("rep_tab_sales")}</button>
                <button class="tab-btn ${state.activeReportsTab === 'customers' ? 'active' : ''}" onclick="switchReportsTab('customers')"><i data-lucide="users" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> ${t("rep_tab_customers")}</button>
                <button class="tab-btn ${state.activeReportsTab === 'jobs' ? 'active' : ''}" onclick="switchReportsTab('jobs')"><i data-lucide="wrench" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> ${t("rep_tab_jobs")}</button>
                <button class="tab-btn ${state.activeReportsTab === 'stock' ? 'active' : ''}" onclick="switchReportsTab('stock')"><i data-lucide="package" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> ${t("rep_tab_stock")}</button>
                <button class="tab-btn ${state.activeReportsTab === 'finance' ? 'active' : ''}" onclick="switchReportsTab('finance')"><i data-lucide="dollar-sign" style="width:16px; height:16px; vertical-align:middle; margin-right:4px;"></i> ${t("rep_tab_finance")}</button>
            </div>
        `;

        let contentHtml = "";

        if (state.activeReportsTab === 'sales') {
            const todayStr = new Date().toISOString().slice(0, 10);
            const todayRec = data.sales.daily.find(d => d.day === todayStr);
            const todaySalesVal = todayRec ? todayRec.sales : 0;
            
            const monthStr = new Date().toISOString().slice(0, 7);
            const monthRec = data.sales.monthly.find(m => m.month === monthStr);
            const monthSalesVal = monthRec ? monthRec.sales : 0;

            contentHtml = `
                <div class="stats-grid" style="margin-bottom: 1.5rem;">
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--secondary);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_sales_daily")} (${t("db_today_sales")})</span>
                            <span class="stat-value" style="font-size:1.5rem;">${todaySalesVal.toLocaleString()} ฿</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="banknote"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--primary);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_sales_monthly")}</span>
                            <span class="stat-value" style="font-size:1.5rem;">${monthSalesVal.toLocaleString()} ฿</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="trending-up"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--success);">
                        <div class="stat-info">
                            <span class="stat-label">${t("db_bill_count")} (${t("inv_stock_filter_all")})</span>
                            <span class="stat-value" style="font-size:1.5rem;">${data.sales.daily.reduce((sum, d) => sum + d.bills, 0)} ${t("db_bill_suffix")}</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="receipt"></i></div>
                    </div>
                </div>

                <!-- Sales Charts -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:1.5rem;">
                    <div class="glass-card">
                        <h4><i data-lucide="line-chart"></i> ${t("rep_revenue_trend")} (30 วัน)</h4>
                        <div style="height:250px; position:relative; margin-top:1rem;">
                            <canvas id="chart-sales-daily"></canvas>
                        </div>
                    </div>
                    <div class="glass-card">
                        <h4><i data-lucide="pie-chart"></i> ${t("rep_cat_distribution")}</h4>
                        <div style="height:250px; position:relative; margin-top:1rem;">
                            <canvas id="chart-sales-category"></canvas>
                        </div>
                    </div>
                </div>

                <!-- Sales Data Tables -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <!-- 1. Daily Sales Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="calendar"></i> ${t("rep_sales_daily")}</h4>
                            <button class="btn-premium" onclick="exportReport('sales_daily')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>วันที่ (Date)</th>
                                        <th>จำนวนบิล (Bills)</th>
                                        <th style="text-align:right;">ยอดรวมบิล (Sales)</th>
                                        <th style="text-align:right;">ยอดรับจริง (Collected)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.sales.daily.map(d => `
                                        <tr>
                                            <td>${d.day}</td>
                                            <td>${d.bills}</td>
                                            <td style="text-align:right; font-weight:700; color:var(--primary);">${d.sales.toLocaleString()} ฿</td>
                                            <td style="text-align:right; font-weight:700; color:var(--success);">${d.deposit.toLocaleString()} ฿</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 2. Monthly Sales Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="trending-up"></i> ${t("rep_sales_monthly")}</h4>
                            <button class="btn-premium" onclick="exportReport('sales_monthly')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>เดือน (Month)</th>
                                        <th>จำนวนบิล (Bills)</th>
                                        <th style="text-align:right;">ยอดรวมบิล (Sales)</th>
                                        <th style="text-align:right;">ยอดรับจริง (Collected)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.sales.monthly.map(m => `
                                        <tr>
                                            <td>${m.month}</td>
                                            <td>${m.bills}</td>
                                            <td style="text-align:right; font-weight:700; color:var(--primary);">${m.sales.toLocaleString()} ฿</td>
                                            <td style="text-align:right; font-weight:700; color:var(--success);">${m.deposit.toLocaleString()} ฿</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 3. Sales By Product Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="package"></i> ${t("rep_sales_by_product")}</h4>
                            <button class="btn-premium" onclick="exportReport('sales_by_product')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>บาร์โค้ด (Barcode)</th>
                                        <th>ชื่อสินค้า (Product Name)</th>
                                        <th>หมวดหมู่ (Category)</th>
                                        <th style="text-align:right;">จำนวนชิ้น (Qty Sold)</th>
                                        <th style="text-align:right;">ยอดขายรวม (Total Sales)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.sales.by_product.map(p => `
                                        <tr>
                                            <td><code>${p.barcode}</code></td>
                                            <td style="font-weight:600;">${state.lang === 'th' ? p.name_th : p.name_en}</td>
                                            <td><span class="badge badge-info" style="text-transform:uppercase; font-size:0.7rem;">${p.category}</span></td>
                                            <td style="text-align:right; font-weight:700;">${p.qty_sold}</td>
                                            <td style="text-align:right; font-weight:700; color:var(--primary);">${p.total_sales.toLocaleString()} ฿</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 4. Sales By Staff Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="user-check"></i> ${t("rep_sales_by_staff")}</h4>
                            <button class="btn-premium" onclick="exportReport('sales_by_staff')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>ชื่อพนักงาน (Staff Name)</th>
                                        <th>ตำแหน่ง (Role)</th>
                                        <th>จำนวนบิล (Bills)</th>
                                        <th style="text-align:right;">ยอดขายรวม (Total Sales)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.sales.by_staff.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No sales data registered for staff members</td></tr>` :
                                        data.sales.by_staff.map(s => `
                                            <tr>
                                                <td style="font-weight:600;">${s.username}</td>
                                                <td style="text-transform:capitalize;">${s.role}</td>
                                                <td>${s.bills}</td>
                                                <td style="text-align:right; font-weight:700; color:var(--primary);">${s.total_sales.toLocaleString()} ฿</td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.activeReportsTab === 'customers') {
            contentHtml = `
                <div class="stats-grid" style="margin-bottom: 1.5rem;">
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--secondary);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_cust_new")} (เดือนนี้)</span>
                            <span class="stat-value" style="font-size:1.5rem;">${data.customers.new.length} ${t("db_customer_suffix")}</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="user-plus"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--primary);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_cust_returning")} (เดือนนี้)</span>
                            <span class="stat-value" style="font-size:1.5rem;">${data.customers.returning.length} ${t("db_customer_suffix")}</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="refresh-cw"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--danger);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_cust_due")}</span>
                            <span class="stat-value" style="font-size:1.5rem; color:var(--danger);">${data.customers.due_checkups.length} ${t("db_customer_suffix")}</span>
                        </div>
                        <div class="stat-icon" style="background:rgba(239,68,68,0.1); color:var(--danger);"><i data-lucide="calendar-clock"></i></div>
                    </div>
                </div>

                <!-- Customer Chart -->
                <div class="glass-card" style="margin-bottom:1.5rem; max-width: 500px; margin-left: auto; margin-right: auto;">
                    <h4><i data-lucide="pie-chart"></i> สัดส่วนประเภทลูกค้าใหม่ vs ลูกค้าซื้อซ้ำ</h4>
                    <div style="height:220px; position:relative; margin-top:1rem;">
                        <canvas id="chart-customers-split"></canvas>
                    </div>
                </div>

                <!-- Data Tables -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <!-- 1. New Customers Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="user-plus"></i> ${t("rep_cust_new")}</h4>
                            <button class="btn-premium" onclick="exportReport('customers_new')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>ชื่อ-นามสกุล (Name)</th>
                                        <th>เบอร์โทร (Phone)</th>
                                        <th>วันที่ซื้อแรก (First Purchase Date)</th>
                                        <th style="text-align:right;">ยอดซื้อแรก (First Amount)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.customers.new.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No new customers registered this month</td></tr>` :
                                        data.customers.new.map(c => `
                                            <tr>
                                                <td style="font-weight:600;">${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`}</td>
                                                <td>${c.phone}</td>
                                                <td>${c.first_purchase_date}</td>
                                                <td style="text-align:right; font-weight:700; color:var(--primary);">${c.total_amount.toLocaleString()} ฿</td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 2. Returning Customers Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="refresh-cw"></i> ${t("rep_cust_returning")}</h4>
                            <button class="btn-premium" onclick="exportReport('customers_returning')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>ชื่อ-นามสกุล (Name)</th>
                                        <th>เบอร์โทร (Phone)</th>
                                        <th>จำนวนบิลทั้งหมด (Total Bills)</th>
                                        <th style="text-align:right;">ยอดซื้อสะสม (Total Purchases)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.customers.returning.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No returning customer sales recorded this month</td></tr>` :
                                        data.customers.returning.map(c => `
                                            <tr>
                                                <td style="font-weight:600;">${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`}</td>
                                                <td>${c.phone}</td>
                                                <td>${c.total_bills}</td>
                                                <td style="text-align:right; font-weight:700; color:var(--primary);">${c.total_spent.toLocaleString()} ฿</td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 3. Due Eye Exams Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--danger);"><i data-lucide="calendar-clock"></i> ${t("rep_cust_due")}</h4>
                            <button class="btn-premium" onclick="exportReport('customers_due')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>ชื่อ-นามสกุล (Name)</th>
                                        <th>เบอร์โทร (Phone)</th>
                                        <th>วันที่ตรวจล่าสุด (Last Visit)</th>
                                        <th>กำหนดตรวจรอบถัดไป (Due Date)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.customers.due_checkups.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No customer eye exam checkups due</td></tr>` :
                                        data.customers.due_checkups.map(c => `
                                            <tr class="alert-row">
                                                <td style="font-weight:600;">${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`}</td>
                                                <td>${c.phone}</td>
                                                <td>${c.last_visit || '-'}</td>
                                                <td style="font-weight:700; color:var(--danger);">${c.checkup_due_date || '-'}</td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.activeReportsTab === 'jobs') {
            contentHtml = `
                <div class="stats-grid" style="margin-bottom: 1.5rem;">
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--primary);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_jobs_wo")}</span>
                            <span class="stat-value" style="font-size:1.5rem;">${data.jobs.work_orders.length} ${t("db_item_suffix")}</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="wrench"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--danger);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_jobs_pending")}</span>
                            <span class="stat-value" style="font-size:1.5rem; color:var(--danger);">${data.jobs.pending.length} ${t("db_item_suffix")}</span>
                        </div>
                        <div class="stat-icon" style="background:rgba(239,68,68,0.1); color:var(--danger);"><i data-lucide="alert-circle"></i></div>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <!-- 1. Work Order Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="wrench"></i> ${t("rep_jobs_wo")}</h4>
                            <button class="btn-premium" onclick="exportReport('jobs_work_orders')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 300px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>รหัสงาน (Job ID)</th>
                                        <th>บิลสั่งซื้อ (Order ID)</th>
                                        <th>ลูกค้า (Customer)</th>
                                        <th>รายละเอียด (Details)</th>
                                        <th>สถานะ (Status)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.jobs.work_orders.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No lab jobs found</td></tr>` :
                                        data.jobs.work_orders.map(j => `
                                            <tr>
                                                <td><code>JOB-${j.id}</code></td>
                                                <td>#${j.order_id}</td>
                                                <td style="font-weight:600;">${j.customer_name}</td>
                                                <td style="font-size:0.75rem; white-space:pre-line;">${j.details}</td>
                                                <td><span class="badge ${j.status === 'completed' ? 'badge-success' : 'badge-warning'}">${t('status_' + j.status)}</span></td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 2. Pending Deliveries Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--danger);"><i data-lucide="alert-circle"></i> ${t("rep_jobs_pending")}</h4>
                            <button class="btn-premium" onclick="exportReport('jobs_pending')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>บิลสั่งซื้อ (Order ID)</th>
                                        <th>ลูกค้า (Customer)</th>
                                        <th>รายละเอียดเลนส์ (Details)</th>
                                        <th>วันที่สั่งซื้อ (Order Date)</th>
                                        <th style="text-align:right;">${t("rep_days_overdue")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.jobs.pending.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No pending or overdue deliveries</td></tr>` :
                                        data.jobs.pending.map(j => {
                                            const diffTime = Math.max(0, Date.now() - new Date(j.order_date).getTime());
                                            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                                            return `
                                                <tr style="${diffDays >= 3 ? 'background:rgba(239,68,68,0.02); font-weight:500;' : ''}">
                                                    <td>#${j.order_id}</td>
                                                    <td style="font-weight:600;">${j.customer_name}</td>
                                                    <td style="font-size:0.75rem; white-space:pre-line;">${j.details}</td>
                                                    <td>${j.order_date.slice(0, 16)}</td>
                                                    <td style="text-align:right; font-weight:700; ${diffDays >= 3 ? 'color:var(--danger);' : ''}">${diffDays} วัน</td>
                                                </tr>
                                            `;
                                        }).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.activeReportsTab === 'stock') {
            const totalStockVal = data.stock.remaining.reduce((sum, s) => sum + s.stock_value, 0);
            const totalStockQty = data.stock.remaining.reduce((sum, s) => sum + s.stock, 0);

            contentHtml = `
                <div class="stats-grid" style="margin-bottom: 1.5rem;">
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--primary);">
                        <div class="stat-info">
                            <span class="stat-label">มูลค่าสินค้าในคลังรวม (Asset Value)</span>
                            <span class="stat-value" style="font-size:1.5rem;">${totalStockVal.toLocaleString()} ฿</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="coins"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--secondary);">
                        <div class="stat-info">
                            <span class="stat-label">จำนวนสินค้าสะสมในคลัง (Stock Qty)</span>
                            <span class="stat-value" style="font-size:1.5rem;">${totalStockQty.toLocaleString()} ชิ้น</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="package"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--danger);">
                        <div class="stat-info">
                            <span class="stat-label">${t("rep_stock_dead")}</span>
                            <span class="stat-value" style="font-size:1.5rem; color:var(--danger);">${data.stock.dead_stock.length} ${t("db_item_suffix")}</span>
                        </div>
                        <div class="stat-icon" style="background:rgba(239,68,68,0.1); color:var(--danger);"><i data-lucide="alert-triangle"></i></div>
                    </div>
                </div>

                <!-- Stock Chart -->
                <div class="glass-card" style="margin-bottom:1.5rem; max-width: 500px; margin-left: auto; margin-right: auto;">
                    <h4><i data-lucide="pie-chart"></i> สัดส่วนมูลค่าสินค้าในสต็อกแยกตามหมวดหมู่</h4>
                    <div style="height:220px; position:relative; margin-top:1rem;">
                        <canvas id="chart-stock-split"></canvas>
                    </div>
                </div>

                <!-- Stock Data Tables -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <!-- 1. Stock Remaining Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="package"></i> ${t("rep_stock_remaining")}</h4>
                            <button class="btn-premium" onclick="exportReport('stock_remaining')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>บาร์โค้ด (Barcode)</th>
                                        <th>ชื่อสินค้า (Product Name)</th>
                                        <th>หมวดหมู่ (Category)</th>
                                        <th style="text-align:right;">ราคาขาย (Price)</th>
                                        <th style="text-align:right;">จำนวนสต็อก (Stock)</th>
                                        <th style="text-align:right;">มูลค่าสต็อก (Stock Value)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.stock.remaining.map(s => `
                                        <tr>
                                            <td><code>${s.barcode}</code></td>
                                            <td style="font-weight:600;">${state.lang === 'th' ? s.name_th : s.name_en}</td>
                                            <td><span class="badge badge-info" style="text-transform:uppercase; font-size:0.7rem;">${s.category}</span></td>
                                            <td style="text-align:right;">${s.price.toLocaleString()} ฿</td>
                                            <td style="text-align:right; font-weight:700; ${s.stock <= 3 ? 'color:var(--danger);' : ''}">${s.stock}</td>
                                            <td style="text-align:right; font-weight:700; color:var(--primary);">${s.stock_value.toLocaleString()} ฿</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 2. Stock Best Sellers Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--primary);"><i data-lucide="trophy"></i> ${t("rep_stock_best")}</h4>
                            <button class="btn-premium" onclick="exportReport('stock_best_sellers')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>ชื่อสินค้า (Product Name)</th>
                                        <th>หมวดหมู่ (Category)</th>
                                        <th style="text-align:right;">ราคาขาย (Price)</th>
                                        <th style="text-align:right;">ขายแล้ว (Qty Sold)</th>
                                        <th style="text-align:right;">รวมเงิน (Total Sales)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.stock.best_sellers.map(p => `
                                        <tr>
                                            <td style="font-weight:600;">${state.lang === 'th' ? p.name_th : p.name_en}</td>
                                            <td><span class="badge badge-info" style="text-transform:uppercase; font-size:0.7rem;">${p.category}</span></td>
                                            <td style="text-align:right;">${p.price.toLocaleString()} ฿</td>
                                            <td style="text-align:right; font-weight:700; color:var(--secondary-hover);">${p.qty_sold}</td>
                                            <td style="text-align:right; font-weight:700; color:var(--primary);">${p.total_sales.toLocaleString()} ฿</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 3. Dead Stock Table -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--danger);"><i data-lucide="alert-triangle"></i> ${t("rep_stock_dead")}</h4>
                            <button class="btn-premium" onclick="exportReport('stock_dead')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>บาร์โค้ด (Barcode)</th>
                                        <th>ชื่อสินค้า (Product Name)</th>
                                        <th>หมวดหมู่ (Category)</th>
                                        <th style="text-align:right;">ราคาขาย (Price)</th>
                                        <th style="text-align:right;">คงเหลือค้างคลัง (Stock)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.stock.dead_stock.length === 0 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No dead stock (all products have active sales within 90 days)</td></tr>` :
                                        data.stock.dead_stock.map(d => `
                                            <tr>
                                                <td><code>${d.barcode}</code></td>
                                                <td style="font-weight:600;">${state.lang === 'th' ? d.name_th : d.name_en}</td>
                                                <td><span class="badge badge-warning" style="text-transform:uppercase; font-size:0.7rem;">${d.category}</span></td>
                                                <td style="text-align:right;">${d.price.toLocaleString()} ฿</td>
                                                <td style="text-align:right; font-weight:700; color:var(--danger);">${d.stock}</td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (state.activeReportsTab === 'finance') {
            const totalCollected = data.finance.collected.reduce((sum, f) => sum + f.deposit_amount, 0);
            const totalDeposits = data.finance.deposits.reduce((sum, f) => sum + f.deposit_amount, 0);
            const totalIntake = totalCollected + totalDeposits;

            contentHtml = `
                <div class="stats-grid" style="margin-bottom: 1.5rem;">
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--success);">
                        <div class="stat-info">
                            <span class="stat-label">ยอดเก็บเงินสมบูรณ์ (${t("rep_finance_collected")})</span>
                            <span class="stat-value" style="font-size:1.5rem; color:var(--success);">${totalCollected.toLocaleString()} ฿</span>
                        </div>
                        <div class="stat-icon" style="background:rgba(16,185,129,0.1); color:var(--success);"><i data-lucide="check-circle2"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--secondary);">
                        <div class="stat-info">
                            <span class="stat-label">ยอดเงินมัดจำรับค้างจัดส่ง (${t("rep_finance_deposits")})</span>
                            <span class="stat-value" style="font-size:1.5rem; color:var(--secondary);">${totalDeposits.toLocaleString()} ฿</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="receipt"></i></div>
                    </div>
                    <div class="glass-card stat-card" style="border-left: 3px solid var(--primary);">
                        <div class="stat-info">
                            <span class="stat-label">รายได้รวมทราฟฟิก (Financial Intake)</span>
                            <span class="stat-value" style="font-size:1.5rem;">${totalIntake.toLocaleString()} ฿</span>
                        </div>
                        <div class="stat-icon"><i data-lucide="wallet"></i></div>
                    </div>
                </div>

                <!-- Finance Chart -->
                <div class="glass-card" style="margin-bottom:1.5rem; max-width: 500px; margin-left: auto; margin-right: auto;">
                    <h4><i data-lucide="pie-chart"></i> สัดส่วนช่องทางชำระเงิน (ตามเงินรับจริง)</h4>
                    <div style="height:220px; position:relative; margin-top:1rem;">
                        <canvas id="chart-finance-methods"></canvas>
                    </div>
                </div>

                <!-- Finance Data Tables -->
                <div style="display:flex; flex-direction:column; gap:1.5rem;">
                    <!-- 1. Fully Paid collected -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--success);"><i data-lucide="check-circle"></i> ${t("rep_finance_collected")}</h4>
                            <button class="btn-premium" onclick="exportReport('finance_collected')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>เลขบิล (Order ID)</th>
                                        <th>ลูกค้า (Customer Name)</th>
                                        <th>วันที่ทำรายการ (Date)</th>
                                        <th style="text-align:right;">ราคารวมบิล (Total Amount)</th>
                                        <th style="text-align:right;">ชำระแล้ว (Amount Paid)</th>
                                        <th>ช่องทางชำระเงิน (Method)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.finance.collected.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No fully paid receipts found</td></tr>` :
                                        data.finance.collected.map(f => `
                                            <tr>
                                                <td>#${f.id}</td>
                                                <td style="font-weight:600;">${f.customer_name}</td>
                                                <td>${f.date.slice(0, 16)}</td>
                                                <td style="text-align:right; font-weight:700;">${f.total_amount.toLocaleString()} ฿</td>
                                                <td style="text-align:right; font-weight:700; color:var(--success);">${f.deposit_amount.toLocaleString()} ฿</td>
                                                <td><span class="badge badge-success" style="font-size:0.7rem;">${f.payment_method}</span></td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 2. Deposit orders -->
                    <div class="glass-card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                            <h4 style="color:var(--secondary-hover);"><i data-lucide="receipt"></i> ${t("rep_finance_deposits")}</h4>
                            <button class="btn-premium" onclick="exportReport('finance_deposits')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i data-lucide="download" style="width:14px; height:14px;"></i> ${t("rep_export_excel")}</button>
                        </div>
                        <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; margin-top:0;">
                            <table class="custom-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>เลขบิล (Order ID)</th>
                                        <th>ลูกค้า (Customer Name)</th>
                                        <th>วันที่ทำรายการ (Date)</th>
                                        <th style="text-align:right;">ราคารวมบิล (Total)</th>
                                        <th style="text-align:right;">มัดจำที่รับแล้ว (Deposit)</th>
                                        <th style="text-align:right;">ยอดค้างจ่าย (Balance)</th>
                                        <th>ช่องทางชำระเงิน (Method)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.finance.deposits.length === 0 ? `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">No deposits/balances collected</td></tr>` :
                                        data.finance.deposits.map(f => `
                                            <tr>
                                                <td>#${f.id}</td>
                                                <td style="font-weight:600;">${f.customer_name}</td>
                                                <td>${f.date.slice(0, 16)}</td>
                                                <td style="text-align:right; font-weight:700;">${f.total_amount.toLocaleString()} ฿</td>
                                                <td style="text-align:right; font-weight:700; color:var(--secondary-hover);">${f.deposit_amount.toLocaleString()} ฿</td>
                                                <td style="text-align:right; font-weight:700; color:var(--danger);">${f.balance.toLocaleString()} ฿</td>
                                                <td><span class="badge badge-warning" style="font-size:0.7rem;">${f.payment_method}</span></td>
                                            </tr>
                                        `).join('')
                                    }
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="fade-in">
                ${tabsHtml}
                <div style="margin-top: 1rem;">
                    ${contentHtml}
                </div>
            </div>
        `;
        
        lucide.createIcons();

        // Render Chart.js instances inside setTimeout
        setTimeout(() => {
            if (state.reportsChartInstances) {
                Object.values(state.reportsChartInstances).forEach(c => c && c.destroy());
            }
            state.reportsChartInstances = {};

            if (state.activeReportsTab === 'sales') {
                // 1. Line Chart (Daily Sales - 30 days)
                const dailyCtx = document.getElementById("chart-sales-daily")?.getContext("2d");
                if (dailyCtx) {
                    const days = data.sales.daily.map(d => d.day).reverse();
                    const sales = data.sales.daily.map(d => d.sales).reverse();
                    state.reportsChartInstances.salesDaily = new Chart(dailyCtx, {
                        type: "line",
                        data: {
                            labels: days,
                            datasets: [{
                                label: t("rep_chart_sales"),
                                data: sales,
                                borderColor: "#cda250",
                                backgroundColor: "rgba(205, 162, 80, 0.1)",
                                tension: 0.3,
                                fill: true,
                                borderWidth: 3
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }

                // 2. Doughnut Chart (Categories)
                const catCtx = document.getElementById("chart-sales-category")?.getContext("2d");
                if (catCtx) {
                    const catSales = {};
                    data.sales.by_product.forEach(p => {
                        catSales[p.category] = (catSales[p.category] || 0) + p.total_sales;
                    });
                    const labels = Object.keys(catSales).map(c => t('inv_tab_' + c));
                    const dataset = Object.values(catSales);
                    state.reportsChartInstances.salesCategory = new Chart(catCtx, {
                        type: "doughnut",
                        data: {
                            labels: labels.length === 0 ? ["No data"] : labels,
                            datasets: [{
                                data: dataset.length === 0 ? [1] : dataset,
                                backgroundColor: ["#0d5c50", "#cda250", "#3b82f6", "#ef4444"],
                                borderWidth: 0
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }
            } else if (state.activeReportsTab === 'customers') {
                // 3. Doughnut Chart (New vs Returning)
                const custCtx = document.getElementById("chart-customers-split")?.getContext("2d");
                if (custCtx) {
                    state.reportsChartInstances.custSplit = new Chart(custCtx, {
                        type: "doughnut",
                        data: {
                            labels: [t("rep_cust_new"), t("rep_cust_returning")],
                            datasets: [{
                                data: [data.customers.new.length, data.customers.returning.length],
                                backgroundColor: ["#0d5c50", "#cda250"],
                                borderWidth: 0
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }
            } else if (state.activeReportsTab === 'stock') {
                // 4. Doughnut Chart (Stock value split by category)
                const stockCtx = document.getElementById("chart-stock-split")?.getContext("2d");
                if (stockCtx) {
                    const catStock = {};
                    data.stock.remaining.forEach(s => {
                        catStock[s.category] = (catStock[s.category] || 0) + s.stock_value;
                    });
                    const labels = Object.keys(catStock).map(c => t('inv_tab_' + c));
                    const dataset = Object.values(catStock);
                    state.reportsChartInstances.stockSplit = new Chart(stockCtx, {
                        type: "doughnut",
                        data: {
                            labels: labels.length === 0 ? ["No stock"] : labels,
                            datasets: [{
                                data: dataset.length === 0 ? [1] : dataset,
                                backgroundColor: ["#0d5c50", "#cda250", "#3b82f6", "#ef4444"],
                                borderWidth: 0
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }
            } else if (state.activeReportsTab === 'finance') {
                // 5. Pie Chart (Payment methods split)
                const finCtx = document.getElementById("chart-finance-methods")?.getContext("2d");
                if (finCtx) {
                    const paymentSplit = {};
                    data.finance.collected.forEach(f => {
                        paymentSplit[f.payment_method] = (paymentSplit[f.payment_method] || 0) + f.deposit_amount;
                    });
                    data.finance.deposits.forEach(f => {
                        if (f.payment_method === 'Split Channels') {
                            try {
                                const details = JSON.parse(f.payment_details || '{}');
                                Object.entries(details).forEach(([method, amt]) => {
                                    paymentSplit[method] = (paymentSplit[method] || 0) + amt;
                                });
                            } catch(e) {}
                        } else {
                            paymentSplit[f.payment_method] = (paymentSplit[f.payment_method] || 0) + f.deposit_amount;
                        }
                    });
                    const labels = Object.keys(paymentSplit);
                    const dataset = Object.values(paymentSplit);
                    state.reportsChartInstances.financeMethods = new Chart(finCtx, {
                        type: "pie",
                        data: {
                            labels: labels.length === 0 ? ["No sales"] : labels,
                            datasets: [{
                                data: dataset.length === 0 ? [1] : dataset,
                                backgroundColor: ["#0d5c50", "#cda250", "#3b82f6", "#10b981", "#f59e0b"],
                                borderWidth: 0
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false }
                    });
                }
            }
        }, 100);

    } catch (err) {
        console.error("Reports Render Error:", err);
    }
}

// --- PAGE 10: SETTINGS & MASTER DATA ---
async function renderSettings(container) {
    try {
        // Load general store settings from localStorage
        const shopProfile = JSON.parse(localStorage.getItem("opticare_shop_profile") || JSON.stringify({
            name: "Eye Focus",
            phone: "02-123-4567",
            address: "123 Siam Square Road, Pathum Wan, Bangkok 10330",
            taxRate: 7.0,
            receiptHeader: "ยินดีต้อนรับสู่คลินิกแว่นตา Eye Focus",
            receiptFooter: "ขอบพระคุณที่เลือกใช้บริการดูแลสายตากับเรา"
        }));

        // Fetch store branches
        const res = await fetch(`${API_BASE}/branches`);
        const branches = await res.json();

        container.innerHTML = `
            <div class="fade-in">
                <!-- Settings Tabs -->
                <div class="tab-container">
                    <button class="tab-btn ${activeSettingsTab === 'branch' ? 'active' : ''}" onclick="switchSettingsTab('branch')">${t("settings_tab_branch")}</button>
                    <button class="tab-btn ${activeSettingsTab === 'category' ? 'active' : ''}" onclick="switchSettingsTab('category')">${t("settings_tab_category")}</button>
                    <button class="tab-btn ${activeSettingsTab === 'general' ? 'active' : ''}" onclick="switchSettingsTab('general')">${t("settings_tab_general")}</button>
                </div>

                <!-- Tab Content: Branch Master -->
                ${activeSettingsTab === 'branch' ? `
                    <div class="actions-bar" style="justify-content: flex-end; margin-bottom: 1.5rem;">
                        <button class="btn-premium" onclick="showAddBranchModal()">
                            <i data-lucide="plus-circle"></i> ${t("settings_add_branch")}
                        </button>
                    </div>

                    <div class="glass-card">
                        <div class="table-wrapper">
                            <table class="custom-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>${t("settings_branch_th")}</th>
                                        <th>${t("settings_branch_en")}</th>
                                        <th>${t("cust_actions")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${branches.map(b => `
                                        <tr>
                                            <td style="font-family: monospace; font-weight: 600;">${b.id}</td>
                                            <td style="font-weight: 600;">${b.name_th}</td>
                                            <td style="font-weight: 600; color:var(--secondary);">${b.name_en}</td>
                                            <td>
                                                <button class="btn-premium" style="padding:0.4rem 1rem; font-size:0.8rem; background:linear-gradient(135deg, var(--primary), var(--primary-light)); color:white; box-shadow:none;" onclick="showEditBranchModal(${b.id}, '${b.name_th}', '${b.name_en}')">
                                                    <i data-lucide="edit" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> Edit
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : activeSettingsTab === 'category' ? `
                    <!-- Tab Content: Product Category Master -->
                    <div class="actions-bar" style="justify-content: flex-end; margin-bottom: 1.5rem;">
                        <button class="btn-premium" onclick="showAddCategoryModal()">
                            <i data-lucide="plus-circle"></i> ${t("settings_add_category")}
                        </button>
                    </div>

                    <div class="glass-card">
                        <div class="table-wrapper">
                            <table class="custom-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>${t("settings_category_key")}</th>
                                        <th>${t("settings_category_th")}</th>
                                        <th>${t("settings_category_en")}</th>
                                        <th>${t("cust_actions")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${state.categories.map(cat => `
                                        <tr>
                                            <td style="font-family: monospace; font-weight: 600;">${cat.id}</td>
                                            <td style="font-weight: 600; font-family: monospace; color: var(--primary);">${cat.key}</td>
                                            <td style="font-weight: 600;">${cat.name_th}</td>
                                            <td style="font-weight: 600; color:var(--secondary);">${cat.name_en}</td>
                                            <td>
                                                <div style="display: flex; gap: 0.5rem;">
                                                    <button class="btn-premium" style="padding:0.4rem 1rem; font-size:0.8rem; background:linear-gradient(135deg, var(--primary), var(--primary-light)); color:white; box-shadow:none;" onclick="showEditCategoryModal(${cat.id}, '${cat.key}', '${cat.name_th}', '${cat.name_en}')">
                                                        <i data-lucide="edit" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> Edit
                                                    </button>
                                                    ${['frame', 'lens', 'contact'].includes(cat.key) ? '' : `
                                                        <button class="btn-premium" style="padding:0.4rem 1rem; font-size:0.8rem; background:linear-gradient(135deg, #ef4444, #f87171); color:white; box-shadow:none;" onclick="deleteCategory(${cat.id})">
                                                            <i data-lucide="trash-2" style="width:14px; height:14px; vertical-align:middle; margin-right:0.25rem;"></i> Delete
                                                        </button>
                                                    `}
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : `
                    <!-- Tab Content: General Profile -->
                    <div class="glass-card" style="max-width: 600px; margin: 0 auto;">
                        <form onsubmit="saveGeneralProfile(event)" style="display:flex; flex-direction:column; gap:1.25rem;">
                            
                            <div class="input-group">
                                <label>${t("settings_shop_name")} <span class="required-asterisk">*</span></label>
                                <input type="text" id="set-shop-name" class="input-control" value="${shopProfile.name}" required>
                            </div>
                            
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                                <div class="input-group">
                                    <label>${t("settings_shop_phone")} <span class="required-asterisk">*</span></label>
                                    <input type="text" id="set-shop-phone" class="input-control" value="${shopProfile.phone}" required>
                                </div>
                                <div class="input-group">
                                    <label>${t("settings_tax_rate")} <span class="required-asterisk">*</span></label>
                                    <input type="number" step="0.1" id="set-shop-tax" class="input-control" value="${shopProfile.taxRate}" required>
                                </div>
                            </div>
                            
                            <div class="input-group">
                                <label>${t("settings_shop_address")}</label>
                                <textarea id="set-shop-address" class="input-control" style="height:60px; resize:none;" required>${shopProfile.address}</textarea>
                            </div>
                            
                            <div class="input-group">
                                <label>${t("settings_receipt_header")}</label>
                                <input type="text" id="set-receipt-header" class="input-control" value="${shopProfile.receiptHeader}">
                            </div>

                            <div class="input-group">
                                <label>${t("settings_receipt_footer")}</label>
                                <input type="text" id="set-receipt-footer" class="input-control" value="${shopProfile.receiptFooter}">
                            </div>
                            
                            <div style="display:flex; justify-content: flex-end; margin-top: 1rem;">
                                <button type="submit" class="btn-premium">
                                    <i data-lucide="save"></i> ${t("modal_save")}
                                </button>
                            </div>
                        </form>
                    </div>
                `}
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        console.error("Settings Render Error:", err);
    }
}

function switchSettingsTab(tab) {
    activeSettingsTab = tab;
    renderCurrentPage();
}

function saveGeneralProfile(event) {
    event.preventDefault();
    const config = {
        name: document.getElementById("set-shop-name").value,
        phone: document.getElementById("set-shop-phone").value,
        address: document.getElementById("set-shop-address").value,
        taxRate: parseFloat(document.getElementById("set-shop-tax").value) || 0,
        receiptHeader: document.getElementById("set-receipt-header").value,
        receiptFooter: document.getElementById("set-receipt-footer").value
    };
    
    localStorage.setItem("opticare_shop_profile", JSON.stringify(config));
    alert("บันทึกการตั้งค่าร้านค้าเรียบร้อยแล้ว / Shop settings saved successfully!");
    renderCurrentPage();
}

// ==========================================================================
// MODAL DIALOG POPUPS (CUSTOM BINDINGS)
// ==========================================================================

function closeModal() {
    document.getElementById("modal-container").classList.remove("active");
}

// 1. Modal: Add New Customer
function showAddCustomerModal() {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 650px;">
            <div class="modal-header">
                <h3><i data-lucide="user-plus"></i> ${t("cust_add")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddCustomer(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="input-group">
                            <label>ชื่อ (ไทย) <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-fname-th" class="input-control" required>
                        </div>
                        <div class="input-group">
                            <label>นามสกุล (ไทย) <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-lname-th" class="input-control" required>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="input-group">
                            <label>First Name (EN) <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-fname-en" class="input-control" required>
                        </div>
                        <div class="input-group">
                            <label>Last Name (EN) <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-lname-en" class="input-control" required>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:1rem;">
                        <div class="input-group">
                            <label>${t("cust_phone")} <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-phone" class="input-control" required placeholder="08x-xxx-xxxx">
                        </div>
                        <div class="input-group">
                            <label>${t("cust_gender")} <span class="required-asterisk">*</span></label>
                            <select id="add-gender" class="input-control" required>
                                <option value="ชาย">${t("cust_gender_m")}</option>
                                <option value="หญิง">${t("cust_gender_f")}</option>
                                <option value="อื่นๆ">${t("cust_gender_other")}</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label>วันเกิด (DOB) *</label>
                            <input type="date" id="add-dob" class="input-control" required>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="input-group">
                            <label>${t("cust_email")}</label>
                            <input type="email" id="add-email" class="input-control" placeholder="client@example.com">
                        </div>
                        <div class="input-group">
                            <label>${t("cust_photo_lbl")}</label>
                            <input type="url" id="add-photo" class="input-control" placeholder="https://images.unsplash.com/photo-...">
                        </div>
                    </div>

                    <div class="input-group">
                        <label>${t("cust_address")}</label>
                        <textarea id="add-address" class="input-control" style="height:60px; resize:none;" placeholder="ที่อยู่ปัจจุบันของลูกค้า..."></textarea>
                    </div>

                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAddCustomer(event) {
    event.preventDefault();
    const cData = {
        first_name_th: document.getElementById("add-fname-th").value,
        last_name_th: document.getElementById("add-lname-th").value,
        first_name_en: document.getElementById("add-fname-en").value,
        last_name_en: document.getElementById("add-lname-en").value,
        phone: document.getElementById("add-phone").value,
        email: document.getElementById("add-email").value,
        dob: document.getElementById("add-dob").value,
        gender: document.getElementById("add-gender").value,
        photo: document.getElementById("add-photo").value || null,
        address: document.getElementById("add-address").value || null
    };

    try {
        const res = await fetch(`${API_BASE}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
    }
}

// 2. Modal: Add Eye Prescription Examination
async function showAddPrescriptionModal(custId) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    let staffUsers = [];
    try {
        const usersRes = await fetch(`${API_BASE}/users`);
        staffUsers = await usersRes.json();
    } catch (err) {
        console.error("Error fetching staff users:", err);
    }
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 800px;">
            <div class="modal-header">
                <h3><i data-lucide="glasses"></i> ${t("det_new_exam")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddPrescription(event, ${custId})">
                <div class="modal-body">
                    <div class="input-group" style="margin-bottom:1.5rem;">
                        <label>${t("det_recorded_by")} <span class="required-asterisk">*</span></label>
                        <select id="exam-optom" class="input-control" required>
                            <option value="">-- ${state.lang === 'th' ? 'เลือกเจ้าหน้าที่' : 'Select Staff'} --</option>
                            ${staffUsers.map(u => `
                                <option value="${u.username}" ${u.id === state.user.id ? 'selected' : ''}>
                                    ${u.username} (${state.lang === 'th' ? 
                                        (u.role === 'admin' ? 'ผู้ดูแลระบบ' : u.role === 'optometrist' ? 'นักทัศนมาตร' : 'พนักงานต้อนรับ') : 
                                        u.role.toUpperCase()})
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Right Eye OD -->
                    <h4 style="color:var(--primary); margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                        <i data-lucide="eye"></i> ${t("det_od")} (ตาขวา)
                    </h4>
                    <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:0.5rem; margin-bottom:1.5rem;">
                        <div class="input-group">
                            <label style="font-size:0.65rem;">SPH</label>
                            <input type="number" step="0.25" id="exam-od-sph" class="input-control" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">CYL</label>
                            <input type="number" step="0.25" id="exam-od-cyl" class="input-control" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">AXIS</label>
                            <input type="number" id="exam-od-axis" class="input-control" placeholder="°">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">ADD</label>
                            <input type="number" step="0.25" id="exam-od-add" class="input-control" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">VA</label>
                            <input type="text" id="exam-od-va" class="input-control" placeholder="6/6">
                        </div>
                    </div>

                    <!-- Left Eye OS -->
                    <h4 style="color:var(--secondary); margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                        <i data-lucide="eye"></i> ${t("det_os")} (ตาซ้าย)
                    </h4>
                    <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:0.5rem;">
                        <div class="input-group">
                            <label style="font-size:0.65rem;">SPH</label>
                            <input type="number" step="0.25" id="exam-os-sph" class="input-control" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">CYL</label>
                            <input type="number" step="0.25" id="exam-os-cyl" class="input-control" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">AXIS</label>
                            <input type="number" id="exam-os-axis" class="input-control" placeholder="°">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">ADD</label>
                            <input type="number" step="0.25" id="exam-os-add" class="input-control" placeholder="0.00">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.65rem;">VA</label>
                            <input type="text" id="exam-os-va" class="input-control" placeholder="6/6">
                        </div>
                    </div>

                    <!-- Additional Information (Medical History, Old Glasses & Comments) -->
                    <h4 style="color:var(--primary); margin-top:2rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem; display:flex; align-items:center; gap:0.25rem;">
                        <i data-lucide="clipboard-list"></i> ข้อมูลเพิ่มเติม & ความเห็นแพทย์ (Additional Info)
                    </h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
                        <div class="input-group">
                            <label>${t("det_med_history")}</label>
                            <input type="text" id="exam-med-history" class="input-control" placeholder="เช่น เบาหวาน, ความดัน, หรือโรคภูมิแพ้">
                        </div>
                        <div class="input-group">
                            <label>${t("det_prev_glasses")}</label>
                            <input type="text" id="exam-prev-glasses" class="input-control" placeholder="เช่น แว่นเดิมสั้น -1.25 เอียง -0.50">
                        </div>
                    </div>
                    <div class="input-group">
                        <label>${t("det_notes_lbl")}</label>
                        <textarea id="exam-notes" class="input-control" style="height:80px; resize:none;" placeholder="ความเห็นเพิ่มเติมของนักทัศนมาตร..."></textarea>
                    </div>

                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAddPrescription(event, custId) {
    event.preventDefault();
    const parse = (id) => {
        const val = document.getElementById(id).value;
        return val !== "" ? parseFloat(val) : null;
    };
    
    const pData = {
        recorded_by: document.getElementById("exam-optom").value,
        od_sph: parse("exam-od-sph"),
        od_cyl: parse("exam-od-cyl"),
        od_axis: parse("exam-od-axis"),
        od_add: parse("exam-od-add"),
        od_va: document.getElementById("exam-od-va").value,
        os_sph: parse("exam-os-sph"),
        os_cyl: parse("exam-os-cyl"),
        os_axis: parse("exam-os-axis"),
        os_add: parse("exam-os-add"),
        os_va: document.getElementById("exam-os-va").value,
        notes: document.getElementById("exam-notes").value,
        medical_history: document.getElementById("exam-med-history").value,
        previous_glasses: document.getElementById("exam-prev-glasses").value
    };

    try {
        const res = await fetch(`${API_BASE}/customers/${custId}/prescriptions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
    }
}

// 3. Modal: Adjust Inventory Product Stock
function showAdjustStockModal(prodId, name, currentStock) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 400px;">
            <div class="modal-header">
                <h3><i data-lucide="box"></i> ${t("inv_adjust")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAdjustStock(event, ${prodId})">
                <div class="modal-body">
                    <p style="margin-bottom:1rem; font-weight:600;">${name}</p>
                    <div class="input-group">
                        <label>${t("inv_stock")} <span class="required-asterisk">*</span></label>
                        <input type="number" id="adjust-stock-val" class="input-control" value="${currentStock}" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAdjustStock(event, prodId) {
    event.preventDefault();
    const stockVal = document.getElementById("adjust-stock-val").value;
    
    try {
        const res = await fetch(`${API_BASE}/inventory/${prodId}?stock=${stockVal}`, { method: "PUT" });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
    }
}

// 3.5 Modal: Add Product
function showAddProductModal() {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i data-lucide="plus-circle"></i> ${t("inv_add_prod")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddProduct(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="input-group">
                            <label>ชื่อสินค้า (ภาษาไทย) <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-prod-name-th" class="input-control" placeholder="เช่น แว่นตา Gucci Classic" required>
                        </div>
                        <div class="input-group">
                            <label>Product Name (English) <span class="required-asterisk">*</span></label>
                            <input type="text" id="add-prod-name-en" class="input-control" placeholder="e.g. Gucci Classic Frame" required>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="input-group">
                            <label>${t("inv_barcode")} <span class="required-asterisk">*</span></label>
                            <div style="display:flex; gap:0.5rem;">
                                <input type="text" id="add-prod-barcode" class="input-control" placeholder="เช่น GUC-101" required>
                                <button type="button" class="btn-premium" style="padding:0 0.75rem; font-size:0.75rem; flex-shrink:0; border-radius:8px;" onclick="generateRandomBarcode()">
                                    <i data-lucide="qr-code" style="width:14px; height:14px; margin-right:0.25rem; vertical-align:middle;"></i> Auto
                                </button>
                            </div>
                        </div>
                        <div class="input-group">
                            <label>${t("inv_category")} <span class="required-asterisk">*</span></label>
                            <select id="add-prod-category" class="input-control" required>
                                ${state.categories.map(cat => `
                                    <option value="${cat.key}" ${activeInventoryTab === cat.key ? 'selected' : ''}>
                                        ${state.lang === 'th' ? cat.name_th : cat.name_en}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:1rem;">
                        <div class="input-group">
                            <label>${t("inv_price")} (฿) <span class="required-asterisk">*</span></label>
                            <input type="number" step="0.01" id="add-prod-price" class="input-control" placeholder="0.00" required>
                        </div>
                        <div class="input-group">
                            <label>${t("inv_stock")} <span class="required-asterisk">*</span></label>
                            <input type="number" id="add-prod-stock" class="input-control" placeholder="0" required>
                        </div>
                        <div class="input-group">
                            <label>${t("inv_min")} <span class="required-asterisk">*</span></label>
                            <input type="number" id="add-prod-min-stock" class="input-control" value="5" required>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>${t("inv_img_url")}</label>
                        <input type="url" id="add-prod-image" class="input-control" placeholder="https://images.unsplash.com/photo-...">
                    </div>

                    <div class="input-group">
                        <label>${t("inv_desc_lbl")}</label>
                        <textarea id="add-prod-description" class="input-control" style="height:80px; resize:none;" placeholder="รายละเอียดสินค้าเพิ่มเติม..."></textarea>
                    </div>

                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAddProduct(event) {
    event.preventDefault();
    
    const pData = {
        name_th: document.getElementById("add-prod-name-th").value,
        name_en: document.getElementById("add-prod-name-en").value,
        barcode: document.getElementById("add-prod-barcode").value,
        category: document.getElementById("add-prod-category").value,
        price: parseFloat(document.getElementById("add-prod-price").value),
        stock: parseInt(document.getElementById("add-prod-stock").value),
        min_stock: parseInt(document.getElementById("add-prod-min-stock").value),
        image: document.getElementById("add-prod-image").value || null,
        description: document.getElementById("add-prod-description").value || null
    };

    try {
        const res = await fetch(`${API_BASE}/inventory?branch_id=${state.activeBranchId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        } else {
            alert("Error adding product: " + (data.detail || "Unknown error"));
        }
    } catch (err) {
        console.error("Add product error:", err);
        alert("Failed to add product");
    }
}

function generateRandomBarcode() {
    const category = document.getElementById("add-prod-category").value || "prod";
    const prefix = category.substring(0, 3).toUpperCase();
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    document.getElementById("add-prod-barcode").value = `${prefix}-${randomNum}`;
}

// 4. Modal: Add Appointment
async function showAddAppointmentModal(preselectedCustomerId = null) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");

    // Fetch customers list to select
    const res = await fetch(`${API_BASE}/customers`);
    const customers = await res.json();

    // Fetch staff users list to select
    const usersRes = await fetch(`${API_BASE}/users`);
    const staffUsers = await usersRes.json();
    
    // Find preselected customer name if any
    let preselectedName = "";
    if (preselectedCustomerId) {
        const found = customers.find(c => String(c.id) === String(preselectedCustomerId));
        if (found) {
            preselectedName = state.lang === 'th' 
                ? `${found.first_name_th} ${found.last_name_th}` 
                : `${found.first_name_en} ${found.last_name_en}`;
        }
    }
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i data-lucide="calendar"></i> ${t("apt_add")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddAppointment(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    
                    <div class="input-group">
                        <label>${t("pos_search_cust")} <span class="required-asterisk">*</span></label>
                        <select id="apt-cust-select" class="input-control" required onchange="aptSelectCustomer(this.value)">
                            <option value="">-- Select Customer --</option>
                            ${customers.map(c => `
                                <option value="${c.id}" data-name="${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`}" ${String(c.id) === String(preselectedCustomerId) ? 'selected' : ''}>
                                    ${state.lang === 'th' ? `${c.first_name_th} ${c.last_name_th}` : `${c.first_name_en} ${c.last_name_en}`} (${c.phone})
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <input type="hidden" id="apt-cust-name" value="${preselectedName}">

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        <div class="input-group">
                            <label>${state.lang === 'th' ? 'วันที่นัดหมาย <span class="required-asterisk">*</span>' : 'Appointment Date <span class="required-asterisk">*</span>'}</label>
                            <input type="date" id="apt-date" class="input-control" required style="cursor: pointer;">
                        </div>
                        <div class="input-group">
                            <label>${state.lang === 'th' ? 'เวลานัดหมาย <span class="required-asterisk">*</span>' : 'Appointment Time <span class="required-asterisk">*</span>'}</label>
                            <input type="time" id="apt-time" class="input-control" required style="cursor: pointer;">
                        </div>
                    </div>

                    <div class="input-group">
                        <label>${t("inv_category")} (Type) <span class="required-asterisk">*</span></label>
                        <select id="apt-type" class="input-control" required>
                            <option value="eye_exam">${t("apt_type_exam")}</option>
                            <option value="pickup">${t("apt_type_pickup")}</option>
                            <option value="consultation">${t("apt_type_consult")}</option>
                        </select>
                    </div>

                    <div class="input-group">
                        <label>${t("apt_select_staff_lbl")} <span class="required-asterisk">*</span></label>
                        <select id="apt-staff-select" class="input-control" required>
                            <option value="">-- Select Staff --</option>
                            ${staffUsers.map(u => `
                                <option value="${u.id}" ${state.user && state.user.id === u.id ? 'selected' : ''}>
                                    ${u.username} (${t('user_role_' + u.role) || u.role})
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="input-group">
                        <label>${t("apt_notes")}</label>
                        <textarea id="apt-notes" class="input-control" style="height:100px; resize:none;"></textarea>
                    </div>

                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

function aptSelectCustomer(val) {
    const select = document.getElementById("apt-cust-select");
    const selectedOpt = select.options[select.selectedIndex];
    document.getElementById("apt-cust-name").value = selectedOpt.getAttribute("data-name") || "";
}

async function submitAddAppointment(event) {
    event.preventDefault();
    const custId = document.getElementById("apt-cust-select").value;
    const name = document.getElementById("apt-cust-name").value;
    const dateVal = document.getElementById("apt-date").value;
    const timeVal = document.getElementById("apt-time").value;
    const datetimeStr = `${dateVal} ${timeVal}`;
    const staffId = document.getElementById("apt-staff-select").value;
    
    const aData = {
        customer_id: parseInt(custId) || null,
        customer_name: name,
        date_time: datetimeStr,
        type: document.getElementById("apt-type").value,
        notes: document.getElementById("apt-notes").value,
        branch_id: state.activeBranchId,
        staff_id: parseInt(staffId) || null
    };

    try {
        const res = await fetch(`${API_BASE}/appointments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(aData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
    }
}

// 5. Modal: Edit User Permissions Matrix
function showEditPermissionsModal(userId, username, role, currentPerms, branchId, phone = '', status = 'active') {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    const allMenus = ["dashboard", "customers", "inventory", "pos", "appointments", "users", "reports", "settings"];

    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i data-lucide="shield-alert"></i> ${t("user_edit_perms")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitEditPermissions(event, ${userId})">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <!-- Username Input -->
                    <div class="input-group">
                        <label>${t("user_lbl_username")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="edit-username-input" class="input-control" value="${username}" required>
                    </div>

                    <!-- Role Selector -->
                    <div class="input-group">
                        <label>${t("user_lbl_role")} <span class="required-asterisk">*</span></label>
                        <select id="edit-role-select" class="input-control" required>
                            <option value="admin" ${role === 'admin' ? 'selected' : ''}>${t("user_role_admin")}</option>
                            <option value="optometrist" ${role === 'optometrist' ? 'selected' : ''}>${t("user_role_optom")}</option>
                            <option value="receptionist" ${role === 'receptionist' ? 'selected' : ''}>${t("user_role_recep")}</option>
                        </select>
                    </div>

                    <!-- Branch Selector -->
                    <div class="input-group">
                        <label>${t("user_lbl_branch")} <span class="required-asterisk">*</span></label>
                        <select id="edit-branch-select" class="input-control" required>
                            ${state.branches.map(b => `
                                <option value="${b.id}" ${b.id === branchId ? 'selected' : ''}>
                                    ${state.lang === 'th' ? b.name_th : b.name_en}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Phone Input -->
                    <div class="input-group">
                        <label>${t("user_lbl_phone")}</label>
                        <input type="text" id="edit-phone-input" class="input-control" value="${phone || ''}">
                    </div>

                    <!-- Status Selector -->
                    <div class="input-group">
                        <label>${t("user_lbl_status")} <span class="required-asterisk">*</span></label>
                        <select id="edit-status-select" class="input-control" required>
                            <option value="active" ${status === 'active' ? 'selected' : ''}>${t("user_status_active")}</option>
                            <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>${t("user_status_inactive")}</option>
                        </select>
                    </div>

                    <!-- Permissions Checklist matrix -->
                    <div class="input-group">
                        <label style="margin-bottom:0.5rem; display:block;">${t("user_table_perms")}</label>
                        <div style="display:flex; flex-direction:column; gap:0.75rem; background:var(--bg-card); padding:1rem; border:1px solid var(--border-color); border-radius:12px;">
                            ${allMenus.map(m => `
                                <div style="display:flex; align-items:center; gap:0.75rem;">
                                    <input type="checkbox" id="perm-${m}" style="width:18px; height:18px; cursor:pointer;" ${currentPerms[m] ? 'checked' : ''}>
                                    <label for="perm-${m}" style="cursor:pointer; font-size:0.95rem; font-weight:500; text-transform:none;">${t('menu_' + m)}</label>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("user_save_perms")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitEditPermissions(event, userId) {
    event.preventDefault();
    const allMenus = ["dashboard", "customers", "inventory", "pos", "appointments", "users", "reports", "settings"];
    const perms = {};
    allMenus.forEach(m => {
        const checkbox = document.getElementById(`perm-${m}`);
        if (checkbox) {
            perms[m] = checkbox.checked;
        }
    });

    const pData = {
        username: document.getElementById("edit-username-input").value,
        role: document.getElementById("edit-role-select").value,
        branch_id: parseInt(document.getElementById("edit-branch-select").value),
        phone: document.getElementById("edit-phone-input").value,
        status: document.getElementById("edit-status-select").value,
        permissions: perms
    };

    try {
        const res = await fetch(`${API_BASE}/users/${userId}/permissions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
    }
}

// 5.1 Modal: Add User
function showAddUserModal() {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");

    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i data-lucide="user-plus"></i> ${t("user_add_title")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddUser(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <!-- Username -->
                    <div class="input-group">
                        <label>${t("user_lbl_username")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="add-username-input" class="input-control" placeholder="John Doe" required>
                    </div>

                    <!-- Email -->
                    <div class="input-group">
                        <label>${t("user_lbl_email")} <span class="required-asterisk">*</span></label>
                        <input type="email" id="add-email-input" class="input-control" placeholder="john@example.com" required>
                    </div>

                    <!-- Phone Number -->
                    <div class="input-group">
                        <label>${t("user_lbl_phone")}</label>
                        <input type="text" id="add-phone-input" class="input-control" placeholder="089-1234567">
                    </div>

                    <!-- Password -->
                    <div class="input-group">
                        <label>${t("user_lbl_password")} <span class="required-asterisk">*</span></label>
                        <input type="password" id="add-password-input" class="input-control" value="123456" required>
                    </div>

                    <!-- Role -->
                    <div class="input-group">
                        <label>${t("user_lbl_role")} <span class="required-asterisk">*</span></label>
                        <select id="add-role-select" class="input-control" required>
                            <option value="admin">${t("user_role_admin")}</option>
                            <option value="optometrist" selected>${t("user_role_optom")}</option>
                            <option value="receptionist">${t("user_role_recep")}</option>
                        </select>
                    </div>

                    <!-- Branch -->
                    <div class="input-group">
                        <label>${t("user_lbl_branch")} <span class="required-asterisk">*</span></label>
                        <select id="add-branch-select" class="input-control" required>
                            ${state.branches.map(b => `
                                <option value="${b.id}" ${b.id === state.activeBranchId ? 'selected' : ''}>
                                    ${state.lang === 'th' ? b.name_th : b.name_en}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Status -->
                    <div class="input-group">
                        <label>${t("user_lbl_status")} <span class="required-asterisk">*</span></label>
                        <select id="add-status-select" class="input-control" required>
                            <option value="active" selected>${t("user_status_active")}</option>
                            <option value="inactive">${t("user_status_inactive")}</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAddUser(event) {
    event.preventDefault();
    
    const uData = {
        username: document.getElementById("add-username-input").value,
        email: document.getElementById("add-email-input").value,
        role: document.getElementById("add-role-select").value,
        branch_id: parseInt(document.getElementById("add-branch-select").value),
        phone: document.getElementById("add-phone-input").value,
        password: document.getElementById("add-password-input").value || "123456",
        status: document.getElementById("add-status-select").value
    };

    try {
        const res = await fetch(`${API_BASE}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(uData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            renderCurrentPage();
        } else {
            alert(data.error || data.detail || "Failed to create user");
        }
    } catch (err) {
        console.error(err);
        alert("Failed to create user due to connection error.");
    }
}

async function deleteUser(userId) {
    if (state.user && userId === state.user.id) {
        alert(t("user_self_delete_err"));
        return;
    }

    if (!confirm(t("user_delete_confirm"))) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/users/${userId}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (data.success) {
            renderCurrentPage();
        } else {
            alert(data.error || data.detail || "Failed to delete user");
        }
    } catch (err) {
        console.error(err);
    }
}

async function saveRolePermissionsMatrix() {
    const checkboxes = document.querySelectorAll(".role-matrix-chk");
    const rolesData = {};
    checkboxes.forEach(chk => {
        const role = chk.dataset.role;
        const menu = chk.dataset.menu;
        if (!rolesData[role]) {
            rolesData[role] = {};
        }
        rolesData[role][menu] = chk.checked;
    });

    try {
        const promises = Object.keys(rolesData).map(role => {
            return fetch(`${API_BASE}/roles`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: role, permissions: rolesData[role] })
            });
        });
        
        const responses = await Promise.all(promises);
        const allOk = responses.every(res => res.ok);
        if (allOk) {
            alert(state.lang === 'th' ? "บันทึกสิทธิ์เรียบร้อยแล้ว" : "Role permissions saved successfully!");
            renderCurrentPage();
        } else {
            alert("Failed to save some role permissions.");
        }
    } catch (err) {
        console.error(err);
        alert("Connection error.");
    }
}

function showChangePasswordModal(userId, username) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 400px;">
            <div class="modal-header">
                <h3><i data-lucide="key-round"></i> ${t("change_pw_title")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitChangePassword(event, ${userId})">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div style="font-weight:600; color:var(--primary);">${t("user_lbl_username")}: ${username}</div>
                    <div class="input-group">
                        <label>${t("user_lbl_new_password")} <span class="required-asterisk">*</span></label>
                        <input type="password" id="change-password-input" class="input-control" placeholder="••••••••" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitChangePassword(event, userId) {
    event.preventDefault();
    const newPassword = document.getElementById("change-password-input").value;
    
    try {
        const res = await fetch(`${API_BASE}/users/${userId}/password`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ new_password: newPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert(state.lang === 'th' ? "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" : "Password changed successfully!");
            closeModal();
            renderCurrentPage();
        } else {
            alert(data.error || data.detail || "Failed to change password.");
        }
    } catch (err) {
        console.error(err);
        alert("Connection error.");
    }
}

// 5.5 Modals: Branch Master Management
function showAddBranchModal() {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 400px;">
            <div class="modal-header">
                <h3><i data-lucide="store"></i> ${t("settings_add_branch")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddBranch(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div class="input-group">
                        <label>${t("settings_branch_th")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="branch-name-th" class="input-control" placeholder="เช่น ชลบุรี - บางแสน" required>
                    </div>
                    <div class="input-group">
                        <label>${t("settings_branch_en")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="branch-name-en" class="input-control" placeholder="e.g. Chonburi - Bangsaen" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAddBranch(event) {
    event.preventDefault();
    const nameTh = document.getElementById("branch-name-th").value;
    const nameEn = document.getElementById("branch-name-en").value;
    
    try {
        const res = await fetch(`${API_BASE}/branches`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name_th: nameTh, name_en: nameEn })
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            await fetchBranches();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
        alert("เพิ่มสาขาล้มเหลว");
    }
}

function showEditBranchModal(id, nameTh, nameEn) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 400px;">
            <div class="modal-header">
                <h3><i data-lucide="store"></i> ${t("settings_edit_branch")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitEditBranch(event, ${id})">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div class="input-group">
                        <label>${t("settings_branch_th")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="edit-branch-name-th" class="input-control" value="${nameTh}" required>
                    </div>
                    <div class="input-group">
                        <label>${t("settings_branch_en")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="edit-branch-name-en" class="input-control" value="${nameEn}" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitEditBranch(event, branchId) {
    event.preventDefault();
    const nameTh = document.getElementById("edit-branch-name-th").value;
    const nameEn = document.getElementById("edit-branch-name-en").value;
    
    try {
        const res = await fetch(`${API_BASE}/branches/${branchId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name_th: nameTh, name_en: nameEn })
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            await fetchBranches();
            renderCurrentPage();
        }
    } catch (err) {
        console.error(err);
        alert("แก้ไขสาขาล้มเหลว");
    }
}

// 5.6 Modals: Product Category Management
function showAddCategoryModal() {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i data-lucide="plus-circle"></i> ${t("settings_add_category")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitAddCategory(event)">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div class="input-group">
                        <label>${t("settings_category_key")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="add-cat-key" class="input-control" placeholder="เช่น accessory, solution" required pattern="[a-z0-9_-]+">
                    </div>
                    <div class="input-group">
                        <label>${t("settings_category_th")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="add-cat-name-th" class="input-control" placeholder="เช่น อุปกรณ์เสริม" required>
                    </div>
                    <div class="input-group">
                        <label>${t("settings_category_en")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="add-cat-name-en" class="input-control" placeholder="e.g. Accessories" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitAddCategory(event) {
    event.preventDefault();
    const catData = {
        key: document.getElementById("add-cat-key").value.trim().toLowerCase(),
        name_th: document.getElementById("add-cat-name-th").value.trim(),
        name_en: document.getElementById("add-cat-name-en").value.trim()
    };
    try {
        const res = await fetch(`${API_BASE}/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(catData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            await fetchCategories();
            renderCurrentPage();
        } else {
            alert("Error adding category: " + (data.error || data.detail || "Unknown error"));
        }
    } catch (err) {
        console.error(err);
    }
}

function showEditCategoryModal(id, key, nameTh, nameEn) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");
    modal.innerHTML = `
        <div class="modal-content fade-in" style="max-width: 500px;">
            <div class="modal-header">
                <h3><i data-lucide="edit"></i> ${t("settings_edit_category")}</h3>
                <button onclick="closeModal()" style="background:none; border:none; cursor:pointer; color:var(--text-muted);"><i data-lucide="x"></i></button>
            </div>
            <form onsubmit="submitEditCategory(event, ${id})">
                <div class="modal-body" style="display:flex; flex-direction:column; gap:1.25rem;">
                    <div class="input-group">
                        <label>${t("settings_category_key")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="edit-cat-key" class="input-control" value="${key}" required pattern="[a-z0-9_-]+" ${['frame', 'lens', 'contact'].includes(key) ? 'readonly style="background-color: var(--card-bg-hover);"' : ''}>
                    </div>
                    <div class="input-group">
                        <label>${t("settings_category_th")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="edit-cat-name-th" class="input-control" value="${nameTh}" required>
                    </div>
                    <div class="input-group">
                        <label>${t("settings_category_en")} <span class="required-asterisk">*</span></label>
                        <input type="text" id="edit-cat-name-en" class="input-control" value="${nameEn}" required>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="closeModal()">${t("modal_cancel")}</button>
                    <button type="submit" class="btn-premium">${t("modal_save")}</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitEditCategory(event, catId) {
    event.preventDefault();
    const catData = {
        key: document.getElementById("edit-cat-key").value.trim().toLowerCase(),
        name_th: document.getElementById("edit-cat-name-th").value.trim(),
        name_en: document.getElementById("edit-cat-name-en").value.trim()
    };
    try {
        const res = await fetch(`${API_BASE}/categories/${catId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(catData)
        });
        const data = await res.json();
        if (data.success) {
            closeModal();
            await fetchCategories();
            renderCurrentPage();
        } else {
            alert("Error updating category: " + (data.error || data.detail || "Unknown error"));
        }
    } catch (err) {
        console.error(err);
    }
}

async function deleteCategory(catId) {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
        const res = await fetch(`${API_BASE}/categories/${catId}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (data.success) {
            await fetchCategories();
            renderCurrentPage();
        } else {
            alert("Error deleting category: " + (data.error || data.detail || "Unknown error"));
        }
    } catch (err) {
        console.error(err);
    }
}

// 6. Modal: Print POS Receipt Preview
function showReceiptPreviewModal(orderId, date, orderData) {
    const modal = document.getElementById("modal-container");
    modal.classList.add("active");

    const cartNet = orderData.total_amount;
    const depositPaid = orderData.deposit_amount;
    const balanceDue = Math.max(0, cartNet - depositPaid);

    // Active branch object
    const activeBranch = state.branches.find(b => b.id === state.activeBranchId);
    const branchName = state.lang === 'th' ? activeBranch.name_th : activeBranch.name_en;

    // Load general store settings from localStorage
    const shopProfile = JSON.parse(localStorage.getItem("opticare_shop_profile") || JSON.stringify({
        name: "Eye Focus",
        phone: "02-123-4567",
        address: "123 Siam Square Road, Pathum Wan, Bangkok 10330",
        taxRate: 7.0,
        receiptHeader: t("tagline"),
        receiptFooter: t("pos_receipt_desc")
    }));

    modal.innerHTML = `
        <div class="modal-content print-receipt-modal fade-in" style="max-width: 420px; font-family: 'Inter', sans-serif; color:#000; background:#fff; border:none; padding:2rem; box-shadow:none;">
            <!-- Ticket Styling clinical luxury receipt -->
            <div style="text-align:center; border-bottom:2px dashed #ccc; padding-bottom:1.5rem; margin-bottom:1.5rem;">
                <h3 style="font-family:var(--font-heading); font-weight:800; font-size:1.6rem; color:#0d5c50; margin-bottom:0.25rem;">${shopProfile.name}</h3>
                <p style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:#666;">${shopProfile.receiptHeader}</p>
                <p style="font-size:0.85rem; font-weight:600; margin-top:0.5rem;">${branchName}</p>
                <p style="font-size:0.75rem; color:#666; margin-top:0.25rem;">Tel: ${shopProfile.phone}</p>
                <p style="font-size:0.75rem; color:#666; max-width: 300px; margin: 0.25rem auto 0 auto; line-height: 1.2;">${shopProfile.address}</p>
            </div>

            <!-- Meta details -->
            <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:0.35rem; margin-bottom:1.5rem; border-bottom:1px solid #eee; padding-bottom:1rem;">
                <div style="display:flex; justify-content:between;">
                    <span style="color:#666;">Order ID:</span>
                    <strong style="margin-left:auto;">#${orderId}</strong>
                </div>
                <div style="display:flex; justify-content:between;">
                    <span style="color:#666;">Date:</span>
                    <span style="margin-left:auto;">${date.slice(0, 16)}</span>
                </div>
                <div style="display:flex; justify-content:between;">
                    <span style="color:#666;">Customer:</span>
                    <span style="margin-left:auto; font-weight:600;">${orderData.customer_name}</span>
                </div>
                <div style="display:flex; justify-content:between;">
                    <span style="color:#666;">Staff:</span>
                    <span style="margin-left:auto;">${state.user.username}</span>
                </div>
            </div>

            <!-- Items Purchased list -->
            <div style="margin-bottom:1.5rem; border-bottom:1px solid #eee; padding-bottom:1rem; display:flex; flex-direction:column; gap:0.75rem;">
                ${state.cart.map(item => `
                    <div style="display:flex; justify-content:between; font-size:0.9rem; align-items:flex-start;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:600;">${state.lang === 'th' ? item.name_th : item.name_en}</span>
                            <span style="font-size:0.75rem; color:#666;">${item.quantity} x ${item.price.toLocaleString()} ฿</span>
                        </div>
                        <span style="margin-left:auto; font-weight:700;">${(item.price * item.quantity).toLocaleString()} ฿</span>
                    </div>
                `).join('')}
            </div>

            <!-- Financial breakdown -->
            <div style="display:flex; flex-direction:column; gap:0.5rem; border-bottom:2px dashed #ccc; padding-bottom:1rem; margin-bottom:1.5rem;">
                <div style="display:flex; justify-content:between; font-size:0.9rem;">
                    <span>${t("pos_total")}</span>
                    <span style="margin-left:auto;">${(cartNet + state.cartDiscount).toLocaleString()} ฿</span>
                </div>
                ${state.cartDiscount > 0 ? `
                    <div style="display:flex; justify-content:between; font-size:0.9rem; color:#ef4444;">
                        <span>Discount:</span>
                        <span style="margin-left:auto;">-${state.cartDiscount.toLocaleString()} ฿</span>
                    </div>
                ` : ''}
                <div style="display:flex; justify-content:between; font-size:1.15rem; font-weight:800; border-top:1px solid #eee; padding-top:0.5rem; color:#0d5c50;">
                    <span>${t("pos_net")}</span>
                    <span style="margin-left:auto;">${cartNet.toLocaleString()} ฿</span>
                </div>
                <div style="display:flex; justify-content:between; font-size:0.9rem; font-weight:600; color:#555; margin-top:0.25rem;">
                    <span>${t("pos_receipt_deposit")}</span>
                    <span style="margin-left:auto;">${depositPaid.toLocaleString()} ฿</span>
                </div>
                <div style="display:flex; justify-content:between; font-size:1rem; font-weight:700; color:#f59e0b; border-top:1px dashed #eee; padding-top:0.35rem;">
                    <span>${t("pos_receipt_balance")}</span>
                    <span style="margin-left:auto;">${balanceDue.toLocaleString()} ฿</span>
                </div>
            </div>

            <!-- Footer & Print Actions -->
            <div style="text-align:center;">
                <p style="font-size:0.85rem; font-weight:600; color:#555; margin-bottom:1rem;">${shopProfile.receiptFooter}</p>
                <div style="display:flex; gap:0.5rem; justify-content:center;" class="no-print">
                    <button class="btn-premium" style="padding:0.5rem 1rem; font-size:0.85rem;" onclick="window.print()"><i data-lucide="printer" style="width:14px; height:14px;"></i> Print</button>
                    <button class="btn-secondary" style="padding:0.5rem 1rem; font-size:0.85rem;" onclick="closeModal()">Close</button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// Collapsible Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebarCollapsed', isCollapsed);
    
    // Toggle toggle button icon
    const iconEl = document.getElementById('sidebar-toggle-icon');
    if (iconEl) {
        iconEl.setAttribute('data-lucide', isCollapsed ? 'chevron-right' : 'chevron-left');
        lucide.createIcons();
    }
}

// Collapsible Exam Cards Toggle
function toggleExamCard(id) {
    const body = document.getElementById(`exam-card-body-${id}`);
    const icon = document.getElementById(`exam-toggle-icon-${id}`);
    if (body && icon) {
        if (body.style.display === "none") {
            body.style.display = "block";
            icon.style.transform = "rotate(180deg)";
        } else {
            body.style.display = "none";
            icon.style.transform = "rotate(0deg)";
        }
    }
}

// 8. Global Startup Initializer
window.addEventListener("DOMContentLoaded", () => {
    // Check local storage or set initial state
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.add('collapsed');
        const iconEl = document.getElementById('sidebar-toggle-icon');
        if (iconEl) iconEl.setAttribute('data-lucide', 'chevron-right');
    }
    updateLanguageUI();
    lucide.createIcons();
});
