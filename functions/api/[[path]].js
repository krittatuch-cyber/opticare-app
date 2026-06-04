// ==========================================================================
// OptiCare Cloudflare Pages Functions API Router
// Handles all /api/* endpoints and integrates with Cloudflare D1 Database
// ==========================================================================

export async function onRequest(context) {
    const { request, env, params } = context;
    const url = new URL(request.url);
    const pathSegments = params.path || [];
    const route = pathSegments.join("/");
    const method = request.method;

    // Helper to return JSON responses
    const jsonResponse = (data, status = 200) => {
        return new Response(JSON.stringify(data), {
            status: status,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    };

    // Audit Logging Helpers
    const logAuditManual = async (userId, username, action, details) => {
        try {
            const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
            await env.DB.prepare(`
                INSERT INTO audit_logs (user_id, username, action, details, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `).bind(userId, username, action, details, timestamp).run();
        } catch (err) {
            console.error("Audit log manual error:", err);
        }
    };

    const logAudit = async (action, details) => {
        try {
            const userIdVal = request.headers.get("X-User-Id");
            const userId = userIdVal ? parseInt(userIdVal) : null;
            const username = request.headers.get("X-User-Name") || "System/Guest";
            await logAuditManual(userId, username, action, details);
        } catch (err) {
            console.error("Audit log error:", err);
        }
    };

    // Handle preflight OPTIONS requests
    if (method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        });
    }

    try {
        // Verify D1 Database Binding is present
        if (!env.DB) {
            return jsonResponse({ error: "Cloudflare D1 Database binding 'DB' is missing. Please bind your D1 database in your Pages dashboard." }, 500);
        }

        // ------------------------------------------------------------------
        // ROUTER 1: LOGIN (POST /api/login)
        // ------------------------------------------------------------------
        if (route === "login" && method === "POST") {
            const body = await request.json();
            const { email, password } = body;

            // Search user in database
            let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

            if (!user) {
                // Dynamic fallback user
                let role = "admin";
                if (email.includes("optom")) {
                    role = "optometrist";
                } else if (email.includes("recep")) {
                    role = "receptionist";
                }

                const perms = {
                    dashboard: true, customers: true, inventory: role === "admin" || role === "receptionist",
                    pos: role === "admin" || role === "receptionist", appointments: true,
                    users: role === "admin", reports: role === "admin", settings: role === "admin"
                };

                const username = email.split("@")[0];
                const displayName = username.charAt(0).toUpperCase() + username.slice(1);

                // Insert dynamic user with default password from request or 123456
                await env.DB.prepare("INSERT INTO users (username, email, password, role, permissions, branch_id) VALUES (?, ?, ?, ?, ?, 1)")
                    .bind(displayName, email, password || "123456", role, JSON.stringify(perms))
                    .run();

                user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
            }

            if (user.status === "inactive") {
                return jsonResponse({ error: "Account is suspended. Please contact your administrator." }, 403);
            }

            if (user.password !== password) {
                return jsonResponse({ error: "Incorrect password. Please try again." }, 401);
            }

            const userObj = { ...user };
            userObj.permissions = JSON.parse(userObj.permissions);
            await logAuditManual(userObj.id, userObj.username, "LOGIN", "Logged in from Pages Cloud API");

            return jsonResponse({ success: true, user: userObj });
        }

        // ------------------------------------------------------------------
        // ROUTER 2: BRANCHES (GET/POST /api/branches, PUT /api/branches/:id)
        // ------------------------------------------------------------------
        if (route === "branches") {
            if (method === "GET") {
                const { results } = await env.DB.prepare("SELECT * FROM branches").all();
                return jsonResponse(results);
            }
            if (method === "POST") {
                const b = await request.json();
                const info = await env.DB.prepare("INSERT INTO branches (name_th, name_en) VALUES (?, ?)")
                    .bind(b.name_th, b.name_en)
                    .run();
                await logAudit("CREATE_BRANCH", "Added branch " + b.name_th);
                return jsonResponse({ success: true, branch_id: info.meta.last_row_id });
            }
        }
        if (pathSegments[0] === "branches" && pathSegments.length === 2 && method === "PUT") {
            const branchId = parseInt(pathSegments[1]);
            const b = await request.json();
            await env.DB.prepare("UPDATE branches SET name_th = ?, name_en = ? WHERE id = ?")
                .bind(b.name_th, b.name_en, branchId)
                .run();
            await logAudit("UPDATE_BRANCH", "Updated branch ID " + branchId + " to " + b.name_th);
            return jsonResponse({ success: true });
        }

        // ------------------------------------------------------------------
        // ROUTER 2B: PRODUCT CATEGORIES (GET/POST /api/categories, PUT/DELETE /api/categories/:id)
        // ------------------------------------------------------------------
        if (route === "categories") {
            if (method === "GET") {
                const { results } = await env.DB.prepare("SELECT * FROM product_categories").all();
                return jsonResponse(results);
            }
            if (method === "POST") {
                const cat = await request.json();
                const info = await env.DB.prepare("INSERT INTO product_categories (key, name_th, name_en) VALUES (?, ?, ?)")
                    .bind(cat.key, cat.name_th, cat.name_en)
                    .run();
                await logAudit("CREATE_CATEGORY", "Created category " + cat.name_th + " (" + cat.key + ")");
                return jsonResponse({ success: true, category_id: info.meta.last_row_id });
            }
        }
        if (pathSegments[0] === "categories" && pathSegments.length === 2) {
            const catId = parseInt(pathSegments[1]);
            if (method === "PUT") {
                const cat = await request.json();
                await env.DB.prepare("UPDATE product_categories SET key = ?, name_th = ?, name_en = ? WHERE id = ?")
                    .bind(cat.key, cat.name_th, cat.name_en, catId)
                    .run();
                await logAudit("UPDATE_CATEGORY", "Updated category ID " + catId + " to " + cat.name_th);
                return jsonResponse({ success: true });
            }
            if (method === "DELETE") {
                // Check if any inventory item uses this category
                const cat = await env.DB.prepare("SELECT key FROM product_categories WHERE id = ?").bind(catId).first();
                if (!cat) {
                    return jsonResponse({ error: "Category not found" }, 404);
                }
                const checkUse = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE category = ?").bind(cat.key).first();
                if (checkUse && checkUse.count > 0) {
                    return jsonResponse({ error: "Cannot delete category that is currently in use by inventory products" }, 400);
                }
                await env.DB.prepare("DELETE FROM product_categories WHERE id = ?").bind(catId).run();
                await logAudit("DELETE_CATEGORY", "Deleted category key " + cat.key);
                return jsonResponse({ success: true });
            }
        }

        // ------------------------------------------------------------------
        // ROUTER 3: CUSTOMERS (GET/POST /api/customers)
        // ------------------------------------------------------------------
        if (route === "customers") {
            if (method === "GET") {
                const search = url.searchParams.get("q") || "";
                let query = "SELECT * FROM customers";
                let bindings = [];

                if (search) {
                    query += " WHERE first_name_th LIKE ? OR last_name_th LIKE ? OR first_name_en LIKE ? OR last_name_en LIKE ? OR phone LIKE ?";
                    const term = `%${search}%`;
                    bindings = [term, term, term, term, term];
                }

                const { results } = await env.DB.prepare(query).bind(...bindings).all();

                // Inject checkup_due status
                const todayStr = new Date().toISOString().slice(0, 10);
                const customers = results.map(c => ({
                    ...c,
                    checkup_due: c.checkup_due_date ? c.checkup_due_date <= todayStr : false
                }));

                return jsonResponse(customers);
            }

            if (method === "POST") {
                const c = await request.json();
                const todayStr = new Date().toISOString().slice(0, 10);
                
                // Calculate next checkup due date (1 year later)
                const lastVisit = c.last_visit || todayStr;
                let dueDate = c.checkup_due_date;
                if (!dueDate) {
                    const dt = new Date(lastVisit);
                    dt.setFullYear(dt.getFullYear() + 1);
                    dueDate = dt.toISOString().slice(0, 10);
                }

                const info = await env.DB.prepare(`
                    INSERT INTO customers (first_name_th, last_name_th, first_name_en, last_name_en, phone, email, dob, last_visit, checkup_due_date, photo, gender, address)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, 
                    c.email || "", c.dob || "", lastVisit, dueDate, 
                    c.photo || "", c.gender || "", c.address || ""
                ).run();

                await logAudit("CREATE_CUSTOMER", "Created customer " + c.first_name_th + " " + c.last_name_th + " (" + c.phone + ")");
                return jsonResponse({ success: true, customer_id: info.meta.last_row_id });
            }
        }

        // ------------------------------------------------------------------
        // ROUTER 4: CUSTOMER DETAILS (GET /api/customers/:id)
        // ------------------------------------------------------------------
        if (pathSegments[0] === "customers" && pathSegments.length === 2 && method === "GET") {
            const customerId = parseInt(pathSegments[1]);
            const customer = await env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(customerId).first();

            if (!customer) {
                return jsonResponse({ error: "Customer not found" }, 404);
            }

            const todayStr = new Date().toISOString().slice(0, 10);
            customer.checkup_due = customer.checkup_due_date ? customer.checkup_due_date <= todayStr : false;

            const rx = await env.DB.prepare("SELECT * FROM prescriptions WHERE customer_id = ? ORDER BY date DESC").bind(customerId).all();
            const orders = await env.DB.prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC").bind(customerId).all();

            return jsonResponse({
                customer: customer,
                prescriptions: rx.results,
                orders: orders.results
            });
        }

        // ------------------------------------------------------------------
        // ROUTER 5: ADD PRESCRIPTION (POST /api/customers/:id/prescriptions)
        // ------------------------------------------------------------------
        if (pathSegments[0] === "customers" && pathSegments[2] === "prescriptions" && method === "POST") {
            const customerId = parseInt(pathSegments[1]);
            const p = await request.json();
            const todayStr = new Date().toISOString().slice(0, 10);

            // Verify customer exists
            const customer = await env.DB.prepare("SELECT id FROM customers WHERE id = ?").bind(customerId).first();
            if (!customer) {
                return jsonResponse({ error: "Customer not found" }, 404);
            }

            // Insert prescription
            await env.DB.prepare(`
                INSERT INTO prescriptions (
                    customer_id, date, recorded_by,
                    od_sph, od_cyl, od_axis, od_add, od_va,
                    os_sph, os_cyl, os_axis, os_add, os_va,
                    notes, medical_history, previous_glasses
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                customerId, todayStr, p.recorded_by,
                p.od_sph, p.od_cyl, p.od_axis, p.od_add, p.od_va || "",
                p.os_sph, p.os_cyl, p.os_axis, p.os_add, p.os_va || "",
                p.notes || "", p.medical_history || "", p.previous_glasses || ""
            ).run();

            // Calculate next due date
            const dt = new Date();
            dt.setFullYear(dt.getFullYear() + 1);
            const dueDate = dt.toISOString().slice(0, 10);

            // Update customer
            await env.DB.prepare("UPDATE customers SET last_visit = ?, checkup_due_date = ? WHERE id = ?")
                .bind(todayStr, dueDate, customerId)
                .run();

            await logAudit("CREATE_PRESCRIPTION", "Added eye prescription for customer ID " + customerId + " by " + p.recorded_by);
            return jsonResponse({ success: true });
        }

        // ------------------------------------------------------------------
        // ROUTER 6: INVENTORY (GET/POST /api/inventory)
        // ------------------------------------------------------------------
        if (route === "inventory") {
            if (method === "GET") {
                const branchId = parseInt(url.searchParams.get("branch_id"));
                const category = url.searchParams.get("category");

                let query = "SELECT * FROM inventory WHERE branch_id = ?";
                let bindings = [branchId];

                if (category) {
                    query += " AND category = ?";
                    bindings.push(category);
                }

                const { results } = await env.DB.prepare(query).bind(...bindings).all();
                const items = results.map(item => ({
                    ...item,
                    low_stock: item.stock <= item.min_stock
                }));

                return jsonResponse(items);
            }

            if (method === "POST") {
                const p = await request.json();
                const branchId = parseInt(url.searchParams.get("branch_id"));
                await env.DB.prepare(`
                    INSERT INTO inventory (name_th, name_en, barcode, category, price, stock, min_stock, branch_id, image, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(
                    p.name_th, p.name_en, p.barcode, p.category, p.price, p.stock, p.min_stock || 5, branchId, p.image || "", p.description || ""
                ).run();
                await logAudit("CREATE_PRODUCT", "Added product " + p.name_th + " (Barcode: " + p.barcode + ")");
                return jsonResponse({ success: true });
            }
        }

        // ------------------------------------------------------------------
        // ROUTER 7: ADJUST STOCK (PUT /api/inventory/:id)
        // ------------------------------------------------------------------
        if (pathSegments[0] === "inventory" && pathSegments.length === 2 && method === "PUT") {
            const prodId = parseInt(pathSegments[1]);
            const stock = parseInt(url.searchParams.get("stock"));

            const prod = await env.DB.prepare("SELECT name_th, stock FROM inventory WHERE id = ?").bind(prodId).first();
            const prodName = prod ? prod.name_th : `ID ${prodId}`;
            const oldStock = prod ? prod.stock : 0;

            await env.DB.prepare("UPDATE inventory SET stock = ? WHERE id = ?").bind(stock, prodId).run();
            await logAudit("UPDATE_STOCK", "Adjusted stock for product " + prodName + " from " + oldStock + " to " + stock);
            return jsonResponse({ success: true });
        }

        // ------------------------------------------------------------------
        // ROUTER 8: POS ORDER SUBMISSION (POST /api/orders)
        // ------------------------------------------------------------------
        if (route === "orders" && method === "POST") {
            const order = await request.json();
            const now = new Date();
            // Formatted date: YYYY-MM-DD HH:MM:SS
            const dateStr = now.toISOString().replace("T", " ").slice(0, 19);
            const todayStr = dateStr.slice(0, 10);

            // Prepare atomic statements batch transaction
            const statements = [];

            // 1. Insert order statement
            statements.push(env.DB.prepare(`
                INSERT INTO orders (customer_id, customer_name, date, branch_id, total_amount, deposit_amount, payment_method, payment_details, status, staff_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                order.customer_id, order.customer_name, dateStr, order.branch_id,
                order.total_amount, order.deposit_amount, order.payment_method,
                JSON.stringify(order.payment_details), order.status, order.staff_id || null
            ));

            // Wait, we need the order ID for order items and lab jobs.
            // On serverless D1, running transactions is done by env.DB.batch([statements]).
            // Since we need the generated order ID, we can do it via a sequential flow but wrapped in a try/catch, or batch it.
            // Actually, D1 allows executing queries in batch, and returns meta.last_row_id for insertions!
            // Let's perform standard database calls sequentially to easily capture row IDs.
            // A transaction block can also be simulated, but D1 executes in a single request, so individual sequential calls are safe.
            
            // Start sequential execution
            const orderInsert = await env.DB.prepare(`
                INSERT INTO orders (customer_id, customer_name, date, branch_id, total_amount, deposit_amount, payment_method, payment_details, status, staff_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                order.customer_id, order.customer_name, dateStr, order.branch_id,
                order.total_amount, order.deposit_amount, order.payment_method,
                JSON.stringify(order.payment_details), order.status, order.staff_id || null
            ).run();

            const orderId = orderInsert.meta.last_row_id;
            let hasFrame = false;
            let hasLens = false;
            let lensDetails = "";

            // Process order items
            for (const item of order.items) {
                // Check stock
                const prod = await env.DB.prepare("SELECT stock, name_en, category FROM inventory WHERE id = ? AND branch_id = ?")
                    .bind(item.product_id, order.branch_id)
                    .first();

                if (!prod) {
                    return jsonResponse({ error: `Product #${item.product_id} not found at this branch` }, 400);
                }

                const newStock = prod.stock - item.quantity;
                if (newStock < 0) {
                    return jsonResponse({ error: `Insufficient stock for ${prod.name_en}. Available: ${prod.stock}` }, 400);
                }

                // Decrement stock in DB
                await env.DB.prepare("UPDATE inventory SET stock = ? WHERE id = ?").bind(newStock, item.product_id).run();

                // Insert order item
                await env.DB.prepare("INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)")
                    .bind(orderId, item.product_id, item.quantity, item.price)
                    .run();

                if (prod.category === "frame") {
                    hasFrame = true;
                    lensDetails += `Frame: ${prod.name_en}\n`;
                } else if (prod.category === "lens") {
                    hasLens = true;
                    lensDetails += `Lens: ${prod.name_en}\n`;
                }
            }

            // Create Lab Job if order has a lens
            if (hasLens) {
                const jobDetails = `Order #${orderId} Lab Request:\n${lensDetails}`;
                let cName = order.customer_name;
                if (order.customer_id) {
                    const cInfo = await env.DB.prepare("SELECT first_name_en, last_name_en FROM customers WHERE id = ?").bind(order.customer_id).first();
                    if (cInfo) {
                        cName = `${cInfo.first_name_en} ${cInfo.last_name_en}`;
                    }
                }

                await env.DB.prepare("INSERT INTO lab_jobs (order_id, customer_name, details, status, updated_at) VALUES (?, ?, ?, ?, ?)")
                    .bind(orderId, cName, jobDetails, "pending", dateStr.slice(0, 16))
                    .run();
            }

            // Update registered customer's last visit
            if (order.customer_id) {
                await env.DB.prepare("UPDATE customers SET last_visit = ? WHERE id = ?").bind(todayStr, order.customer_id).run();
            }

            await logAudit("CREATE_ORDER", "Completed POS checkout for Order ID " + orderId + " (Total: " + order.total_amount + ", Customer: " + order.customer_name + ")");
            return jsonResponse({ success: true, order_id: orderId, date: dateStr });
        }

        // ------------------------------------------------------------------
        // ROUTER 9: APPOINTMENTS (GET/POST /api/appointments)
        // ------------------------------------------------------------------
        if (route === "appointments") {
            if (method === "GET") {
                const branchId = parseInt(url.searchParams.get("branch_id"));
                const { results } = await env.DB.prepare(`
                    SELECT a.*, c.phone as customer_phone
                    FROM appointments a
                    LEFT JOIN customers c ON a.customer_id = c.id
                    WHERE a.branch_id = ?
                    ORDER BY a.date_time ASC
                `).bind(branchId).all();
                return jsonResponse(results);
            }

            if (method === "POST") {
                const a = await request.json();
                await env.DB.prepare(`
                    INSERT INTO appointments (customer_id, customer_name, date_time, type, notes, branch_id, staff_id, call_status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(a.customer_id, a.customer_name, a.date_time, a.type, a.notes || "", a.branch_id, a.staff_id || null, a.call_status || "pending").run();

                await logAudit("CREATE_APPOINTMENT", "Scheduled appointment for " + a.customer_name + " on " + a.date_time);
                return jsonResponse({ success: true });
            }
        }

        if (pathSegments[0] === "appointments" && pathSegments[2] === "call_status" && method === "PUT") {
            const appointmentId = parseInt(pathSegments[1]);
            const body = await request.json();
            const { call_status } = body;

            await env.DB.prepare("UPDATE appointments SET call_status = ? WHERE id = ?")
                .bind(call_status, appointmentId)
                .run();

            await logAudit("UPDATE_APPOINTMENT_CALL_STATUS", "Updated appointment ID " + appointmentId + " call status to " + call_status);
            return jsonResponse({ success: true });
        }

        // ------------------------------------------------------------------
        // ROUTER 10: STAFF USERS (GET/POST/DELETE/PUT /api/users)
        // ------------------------------------------------------------------
        if (route === "users") {
            if (method === "GET") {
                const { results } = await env.DB.prepare(`
                    SELECT u.*, b.name_en as branch_name 
                    FROM users u 
                    LEFT JOIN branches b ON u.branch_id = b.id
                `).all();

                const users = results.map(u => ({
                    ...u,
                    permissions: JSON.parse(u.permissions)
                }));

                return jsonResponse(users);
            }

            if (method === "POST") {
                const u = await request.json();
                
                // Check if email exists
                const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(u.email).first();
                if (existing) {
                    return jsonResponse({ error: "Email already registered" }, 400);
                }

                // Fetch default permissions from role_permissions
                let perms = {
                    dashboard: true, customers: true,
                    inventory: u.role === "admin" || u.role === "receptionist",
                    pos: u.role === "admin" || u.role === "receptionist",
                    appointments: true, users: u.role === "admin",
                    reports: u.role === "admin", settings: u.role === "admin"
                };

                const rp = await env.DB.prepare("SELECT permissions FROM role_permissions WHERE role = ?").bind(u.role).first();
                if (rp) {
                    perms = JSON.parse(rp.permissions);
                }

                await env.DB.prepare(`
                    INSERT INTO users (username, email, password, phone, status, role, permissions, branch_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).bind(u.username, u.email, u.password || "123456", u.phone || "", u.status || "active", u.role, JSON.stringify(perms), u.branch_id).run();

                await logAudit("CREATE_USER", `Created staff user ${u.username} (${u.email}, Role: ${u.role})`);
                return jsonResponse({ success: true });
            }
        }

        if (pathSegments[0] === "users" && pathSegments.length === 2 && method === "DELETE") {
            const userId = parseInt(pathSegments[1]);

            const row = await env.DB.prepare("SELECT username, email FROM users WHERE id = ?").bind(userId).first();
            if (!row) {
                return jsonResponse({ error: "User not found" }, 404);
            }

            await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
            await logAudit("DELETE_USER", `Deleted staff user ${row.username} (${row.email})`);
            return jsonResponse({ success: true });
        }

        if (pathSegments[0] === "users" && pathSegments[2] === "permissions" && method === "PUT") {
            const userId = parseInt(pathSegments[1]);
            const p = await request.json();

            const row = await env.DB.prepare("SELECT username, role, password, phone, status, branch_id FROM users WHERE id = ?").bind(userId).first();
            if (!row) {
                return jsonResponse({ error: "User not found" }, 404);
            }

            const username = p.username !== undefined ? p.username : row.username;
            const role = p.role !== undefined ? p.role : row.role;
            const branchId = p.branch_id !== undefined ? p.branch_id : row.branch_id;
            const phone = p.phone !== undefined ? p.phone : row.phone;
            const status = p.status !== undefined ? p.status : row.status;
            const password = p.password !== undefined ? p.password : row.password;

            await env.DB.prepare(`
                UPDATE users
                SET role = ?, permissions = ?, username = ?, branch_id = ?, phone = ?, status = ?, password = ?
                WHERE id = ?
            `).bind(role, JSON.stringify(p.permissions), username, branchId, phone, status, password, userId).run();

            await logAudit("UPDATE_USER", `Updated staff user ${row.username} -> ${username} (Role: ${role})`);
            return jsonResponse({ success: true });
        }

        // --- ROUTER 10B: ROLES CONFIGURATION ---
        if (route === "roles") {
            if (method === "GET") {
                const { results } = await env.DB.prepare("SELECT * FROM role_permissions").all();
                const roles = results.map(r => ({
                    ...r,
                    permissions: JSON.parse(r.permissions)
                }));
                return jsonResponse(roles);
            }
            if (method === "PUT") {
                const rp = await request.json();
                await env.DB.prepare(`
                    INSERT INTO role_permissions (role, permissions)
                    VALUES (?, ?)
                    ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions
                `).bind(rp.role, JSON.stringify(rp.permissions)).run();

                await logAudit("UPDATE_ROLE_DEFAULTS", `Updated default permissions template for role: ${rp.role}`);
                return jsonResponse({ success: true });
            }
        }

        // --- ROUTER 10C: PASSWORD CONTROLS ---
        if (pathSegments[0] === "users" && pathSegments[2] === "password" && method === "PUT") {
            const userId = parseInt(pathSegments[1]);
            const pc = await request.json();

            const row = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(userId).first();
            if (!row) {
                return jsonResponse({ error: "User not found" }, 404);
            }

            await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(pc.new_password, userId).run();
            await logAudit("CHANGE_PASSWORD", `Changed password for user ${row.username}`);
            return jsonResponse({ success: true });
        }

        if (route === "forgot-password" && method === "POST") {
            const reqBody = await request.json();
            const { email } = reqBody;

            const row = await env.DB.prepare("SELECT id, username FROM users WHERE email = ?").bind(email).first();
            if (!row) {
                return jsonResponse({ error: "Email not found" }, 404);
            }

            const tempPassword = "123456";
            await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(tempPassword, row.id).run();

            await logAuditManual(row.id, row.username, "FORGOT_PASSWORD", `Requested password reset. Password reset to temporary password: ${tempPassword}`);
            return jsonResponse({
                success: true,
                message: `Password reset simulated successfully! Temporary password is: ${tempPassword}`
            });
        }

        // ------------------------------------------------------------------
        // ROUTER 10D: AUDIT LOGS (GET /api/audit-logs)
        // ------------------------------------------------------------------
        if (route === "audit-logs" && method === "GET") {
            const { results } = await env.DB.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200").all();
            return jsonResponse(results || []);
        }

        // ------------------------------------------------------------------
        // ROUTER 11: REPORTS (GET /api/reports)
        // ------------------------------------------------------------------
        if (route === "reports" && method === "GET") {
            const branchId = parseInt(url.searchParams.get("branch_id"));

            // Get current date strings (matching UTC D1 format)
            const todayStr = new Date().toISOString().slice(0, 10);
            const monthStr = new Date().toISOString().slice(0, 7);
            const dueCutoff = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const deadCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

            // === SECTION 1: ฝ่ายขาย (Sales) ===
            // 1. ยอดขายรายวัน (last 30 days)
            const dailySales = await env.DB.prepare(`
                SELECT SUBSTR(date, 1, 10) as day, COUNT(id) as bills, SUM(total_amount) as sales, SUM(deposit_amount) as deposit 
                FROM orders 
                WHERE branch_id = ? 
                GROUP BY day 
                ORDER BY day DESC 
                LIMIT 30
            `).bind(branchId).all();

            // 2. ยอดขายรายเดือน (last 12 months)
            const monthlySales = await env.DB.prepare(`
                SELECT SUBSTR(date, 1, 7) as month, COUNT(id) as bills, SUM(total_amount) as sales, SUM(deposit_amount) as deposit 
                FROM orders 
                WHERE branch_id = ? 
                GROUP BY month 
                ORDER BY month DESC 
                LIMIT 12
            `).bind(branchId).all();

            // 3. ยอดขายตามสินค้า
            const salesByProduct = await env.DB.prepare(`
                SELECT i.barcode, i.name_th, i.name_en, i.category, SUM(oi.quantity) as qty_sold, SUM(oi.quantity * oi.price) as total_sales
                FROM order_items oi
                JOIN inventory i ON oi.product_id = i.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.branch_id = ?
                GROUP BY oi.product_id, i.barcode, i.name_th, i.name_en, i.category
                ORDER BY total_sales DESC
            `).bind(branchId).all();

            // 4. ยอดขายตามพนักงาน
            const salesByStaff = await env.DB.prepare(`
                SELECT u.username, u.role, COUNT(o.id) as bills, SUM(o.total_amount) as total_sales
                FROM orders o
                JOIN users u ON o.staff_id = u.id
                WHERE o.branch_id = ?
                GROUP BY o.staff_id, u.username, u.role
                ORDER BY total_sales DESC
            `).bind(branchId).all();

            // === SECTION 2: ลูกค้า (Customers) ===
            // 5. ลูกค้าใหม่
            const newCustomers = await env.DB.prepare(`
                SELECT c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, MIN(o.date) as first_purchase_date, o.total_amount
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                WHERE o.branch_id = ?
                GROUP BY o.customer_id, c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, o.total_amount
                HAVING first_purchase_date LIKE ?
            `).bind(branchId, `${monthStr}%`).all();

            // 6. ลูกค้าซื้อซ้ำ
            const returningCustomers = await env.DB.prepare(`
                SELECT c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, COUNT(o.id) as total_bills, SUM(o.total_amount) as total_spent
                FROM orders o
                JOIN customers c ON o.customer_id = c.id
                WHERE o.branch_id = ?
                  AND o.customer_id IN (
                      SELECT customer_id FROM orders WHERE date LIKE ?
                  )
                GROUP BY o.customer_id, c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone
                HAVING total_bills >= 2
            `).bind(branchId, `${monthStr}%`).all();

            // 7. ลูกค้าใกล้ครบกำหนด
            const dueCheckups = await env.DB.prepare(`
                SELECT id, first_name_th, last_name_th, first_name_en, last_name_en, phone, last_visit, checkup_due_date 
                FROM customers 
                WHERE checkup_due_date <= ? 
                ORDER BY checkup_due_date ASC
            `).bind(dueCutoff).all();

            // === SECTION 3: งานแว่น (Optical Jobs) ===
            // 8. Work Orders
            const workOrders = await env.DB.prepare(`
                SELECT l.id, l.order_id, l.customer_name, l.details, l.status, l.updated_at
                FROM lab_jobs l
                JOIN orders o ON l.order_id = o.id
                WHERE o.branch_id = ?
                ORDER BY l.id DESC
            `).bind(branchId).all();

            // 9. งานค้างส่งมอบ
            const pendingJobs = await env.DB.prepare(`
                SELECT l.id, l.order_id, l.customer_name, l.details, l.status, o.date as order_date
                FROM lab_jobs l
                JOIN orders o ON l.order_id = o.id
                WHERE o.branch_id = ? AND l.status != 'completed'
                ORDER BY o.date ASC
            `).bind(branchId).all();

            // === SECTION 4: สต๊อก (Stock) ===
            // 10. สินค้าคงเหลือ
            const remainingStock = await env.DB.prepare(`
                SELECT barcode, name_th, name_en, category, price, stock, (price * stock) as stock_value 
                FROM inventory 
                WHERE branch_id = ? 
                ORDER BY stock DESC
            `).bind(branchId).all();

            // 11. สินค้าขายดี
            const bestSellers = await env.DB.prepare(`
                SELECT i.barcode, i.name_th, i.name_en, i.category, i.price, SUM(oi.quantity) as qty_sold, SUM(oi.quantity * oi.price) as total_sales
                FROM order_items oi
                JOIN inventory i ON oi.product_id = i.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.branch_id = ?
                GROUP BY oi.product_id, i.barcode, i.name_th, i.name_en, i.category, i.price
                ORDER BY qty_sold DESC
            `).bind(branchId).all();

            // 12. Dead Stock
            const deadStock = await env.DB.prepare(`
                SELECT id, barcode, name_th, name_en, category, price, stock 
                FROM inventory 
                WHERE branch_id = ? 
                  AND stock > 0
                  AND id NOT IN (
                      SELECT oi.product_id 
                      FROM order_items oi
                      JOIN orders o ON oi.order_id = o.id
                      WHERE o.branch_id = ? AND o.date >= ?
                  )
                ORDER BY stock DESC
            `).bind(branchId, branchId, deadCutoff).all();

            // === SECTION 5: การเงิน (Finance) ===
            // 13. รับเงิน
            const collected = await env.DB.prepare(`
                SELECT id, customer_name, date, total_amount, deposit_amount, payment_method, status 
                FROM orders 
                WHERE branch_id = ? AND status = 'Paid' 
                ORDER BY date DESC
            `).bind(branchId).all();

            // 14. เงินมัดจำ
            const deposits = await env.DB.prepare(`
                SELECT id, customer_name, date, total_amount, deposit_amount, (total_amount - deposit_amount) as balance, payment_method, status 
                FROM orders 
                WHERE branch_id = ? AND status = 'Deposit' 
                ORDER BY date DESC
            `).bind(branchId).all();

            // Backward compatibility
            const salesQ = await env.DB.prepare(`
                SELECT b.name_th, b.name_en, SUM(o.total_amount) as total_sales, SUM(o.deposit_amount) as total_deposit 
                FROM branches b 
                LEFT JOIN orders o ON b.id = o.branch_id 
                GROUP BY b.id
            `).all();

            return jsonResponse({
                sales: {
                    daily: dailySales.results || [],
                    monthly: monthlySales.results || [],
                    by_product: salesByProduct.results || [],
                    by_staff: salesByStaff.results || []
                },
                customers: {
                    new: newCustomers.results || [],
                    returning: returningCustomers.results || [],
                    due_checkups: dueCheckups.results || []
                },
                jobs: {
                    work_orders: workOrders.results || [],
                    pending: pendingJobs.results || []
                },
                stock: {
                    remaining: remainingStock.results || [],
                    best_sellers: bestSellers.results || [],
                    dead_stock: deadStock.results || []
                },
                finance: {
                    collected: collected.results || [],
                    deposits: deposits.results || []
                },
                branch_sales: salesQ.results || []
            });
        }

        // ------------------------------------------------------------------
        // ROUTER 12: DASHBOARD (GET /api/dashboard)
        // ------------------------------------------------------------------
        if (route === "dashboard" && method === "GET") {
            const branchId = parseInt(url.searchParams.get("branch_id"));

            // Get current date strings (UTC format matching D1 generated dates)
            const todayStr = new Date().toISOString().slice(0, 10);
            const monthStr = new Date().toISOString().slice(0, 7);
            const cutoffStr = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

            // 1. Total revenue (sum of deposits)
            const salesRes = await env.DB.prepare("SELECT SUM(deposit_amount) as total FROM orders WHERE branch_id = ?")
                .bind(branchId)
                .first();
            const revenue = salesRes ? (salesRes.total || 0) : 0;

            // 2. Today's Sales
            const todaySalesRes = await env.DB.prepare("SELECT SUM(total_amount) as total FROM orders WHERE branch_id = ? AND date LIKE ?")
                .bind(branchId, `${todayStr}%`)
                .first();
            const todaySales = todaySalesRes ? (todaySalesRes.total || 0) : 0;

            // 3. Monthly Sales
            const monthlySalesRes = await env.DB.prepare("SELECT SUM(total_amount) as total FROM orders WHERE branch_id = ? AND date LIKE ?")
                .bind(branchId, `${monthStr}%`)
                .first();
            const monthlySales = monthlySalesRes ? (monthlySalesRes.total || 0) : 0;

            // 4. Monthly Profit
            const profitItemsRes = await env.DB.prepare(`
                SELECT oi.price, oi.quantity, i.category
                FROM order_items oi
                JOIN inventory i ON oi.product_id = i.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.branch_id = ? AND o.date LIKE ?
            `).bind(branchId, `${monthStr}%`).all();
            
            const profitItems = profitItemsRes.results || [];
            let monthlyProfit = 0;
            for (const item of profitItems) {
                const cat = item.category;
                const qty = item.quantity;
                const price = item.price;
                let margin = 0.50;
                if (cat === "frame") margin = 0.65;
                else if (cat === "lens") margin = 0.60;
                else if (cat === "contact") margin = 0.30;
                monthlyProfit += qty * price * margin;
            }

            // 5. Bill Counts
            const todayBillsRes = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE branch_id = ? AND date LIKE ?")
                .bind(branchId, `${todayStr}%`)
                .first();
            const todayBills = todayBillsRes ? todayBillsRes.count : 0;

            const monthlyBillsRes = await env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE branch_id = ? AND date LIKE ?")
                .bind(branchId, `${monthStr}%`)
                .first();
            const monthlyBills = monthlyBillsRes ? monthlyBillsRes.count : 0;

            // 6. New Customers
            const newCustRes = await env.DB.prepare(`
                SELECT COUNT(*) as count FROM (
                    SELECT customer_id, MIN(date) as first_date
                    FROM orders
                    WHERE customer_id IS NOT NULL AND branch_id = ?
                    GROUP BY customer_id
                ) as sub WHERE first_date LIKE ?
            `).bind(branchId, `${monthStr}%`).first();
            const newCustomers = newCustRes ? newCustRes.count : 0;

            // 7. Returning Customers
            const retCustRes = await env.DB.prepare(`
                SELECT COUNT(DISTINCT customer_id) as count
                FROM orders
                WHERE branch_id = ?
                  AND customer_id IS NOT NULL
                  AND date LIKE ?
                  AND customer_id IN (
                      SELECT customer_id 
                      FROM orders 
                      GROUP BY customer_id 
                      HAVING COUNT(id) >= 2
                  )
            `).bind(branchId, `${monthStr}%`).first();
            const returningCustomers = retCustRes ? retCustRes.count : 0;

            // 8. Pending lab count
            const labsRes = await env.DB.prepare(`
                SELECT COUNT(*) as count 
                FROM lab_jobs l 
                JOIN orders o ON l.order_id = o.id 
                WHERE o.branch_id = ? AND l.status != 'completed'
            `).bind(branchId).first();
            const pendingLabs = labsRes ? labsRes.count : 0;

            // 9. Overdue lab count
            const overdueRes = await env.DB.prepare(`
                SELECT COUNT(*) as count 
                FROM lab_jobs l 
                JOIN orders o ON l.order_id = o.id 
                WHERE o.branch_id = ? AND l.status != 'completed' AND o.date < ?
            `).bind(branchId, cutoffStr).first();
            const overdueLabs = overdueRes ? overdueRes.count : 0;

            // 10. Low stock count
            const lowStockRes = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE branch_id = ? AND stock <= min_stock")
                .bind(branchId)
                .first();
            const lowStockCount = lowStockRes ? lowStockRes.count : 0;

            // 11. Top 5 Best Sellers
            const topSellersRes = await env.DB.prepare(`
                SELECT i.name_th, i.name_en, SUM(oi.quantity) as total_qty, i.category, i.price
                FROM order_items oi
                JOIN inventory i ON oi.product_id = i.id
                JOIN orders o ON oi.order_id = o.id
                WHERE o.branch_id = ?
                GROUP BY oi.product_id, i.name_th, i.name_en, i.category, i.price
                ORDER BY total_qty DESC
                LIMIT 5
            `).bind(branchId).all();

            // Recent lists queries (for details/feed)
            const recentOrders = await env.DB.prepare("SELECT * FROM orders WHERE branch_id = ? ORDER BY date DESC LIMIT 5")
                .bind(branchId)
                .all();

            const labJobs = await env.DB.prepare(`
                SELECT l.* 
                FROM lab_jobs l 
                JOIN orders o ON l.order_id = o.id 
                WHERE o.branch_id = ? 
                ORDER BY l.id DESC LIMIT 5
            `).bind(branchId).all();

            const lowStockItems = await env.DB.prepare("SELECT name_th, name_en, stock, min_stock, category FROM inventory WHERE branch_id = ? AND stock <= min_stock")
                .bind(branchId)
                .all();

            return jsonResponse({
                revenue: revenue,
                today_sales: todaySales,
                monthly_sales: monthlySales,
                monthly_profit: monthlyProfit,
                today_bills: todayBills,
                monthly_bills: monthlyBills,
                new_customers: newCustomers,
                returning_customers: returningCustomers,
                pending_labs: pendingLabs,
                overdue_labs: overdueLabs,
                low_stock_count: lowStockCount,
                top_sellers: topSellersRes.results || [],
                recent_orders: recentOrders.results,
                lab_jobs: labJobs.results,
                low_stock_items: lowStockItems.results
            });
        }

        // Endpoint not matched
        return jsonResponse({ error: `API route '${route}' with method '${method}' not found.` }, 404);

    } catch (err) {
        console.error("Cloudflare Worker Execution Error:", err);
        return jsonResponse({ error: "Internal Server Error", message: err.message }, 500);
    }
}
