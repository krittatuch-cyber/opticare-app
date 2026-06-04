from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sqlite3
import os
import json
from datetime import datetime, timedelta
from database import get_db, DB_PATH

app = FastAPI(title="OptiCare API", description="Bilingual Optical Shop Management Backend")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to execute query and return list of dicts
def query_db(query: str, args=(), one=False):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query, args)
    rv = cursor.fetchall()
    conn.close()
    return (dict(rv[0]) if rv else None) if one else [dict(r) for r in rv]

# --- AUDIT LOGGING HELPERS ---
def log_audit_manual(user_id: Optional[int], username: str, action: str, details: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
        INSERT INTO audit_logs (user_id, username, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?)
        """, (user_id, username, action, details, timestamp))
        conn.commit()
        conn.close()
    except Exception as e:
        print("Audit Log Error:", e)

def log_audit(request: Request, action: str, details: str):
    user_id = request.headers.get("X-User-Id")
    username = request.headers.get("X-User-Name") or "System/Guest"
    log_audit_manual(int(user_id) if user_id else None, username, action, details)

# Pydantic models for request bodies
class LoginRequest(BaseModel):
    email: str
    password: str

class CustomerCreate(BaseModel):
    first_name_th: str
    last_name_th: str
    first_name_en: str
    last_name_en: str
    phone: str
    email: Optional[str] = ""
    dob: Optional[str] = ""
    last_visit: Optional[str] = ""
    checkup_due_date: Optional[str] = ""
    photo: Optional[str] = ""
    gender: Optional[str] = ""
    address: Optional[str] = ""

class PrescriptionCreate(BaseModel):
    recorded_by: str
    od_sph: Optional[float] = None
    od_cyl: Optional[float] = None
    od_axis: Optional[float] = None
    od_add: Optional[float] = None
    od_va: Optional[str] = ""
    os_sph: Optional[float] = None
    os_cyl: Optional[float] = None
    os_axis: Optional[float] = None
    os_add: Optional[float] = None
    os_va: Optional[str] = ""
    notes: Optional[str] = ""
    medical_history: Optional[str] = ""
    previous_glasses: Optional[str] = ""

class ProductCreate(BaseModel):
    name_th: str
    name_en: str
    barcode: str
    category: str
    price: float
    stock: int
    min_stock: int = 5
    image: Optional[str] = None
    description: Optional[str] = None

class OrderItemInput(BaseModel):
    product_id: int
    quantity: int
    price: float

class OrderCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: str
    branch_id: int
    total_amount: float
    deposit_amount: float
    payment_method: str
    payment_details: Dict[str, float]
    status: str # Paid, Deposit, Pending
    items: List[OrderItemInput]
    staff_id: Optional[int] = None

class AppointmentCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: str
    date_time: str # YYYY-MM-DD HH:MM
    type: str # eye_exam, pickup, consultation
    notes: Optional[str] = ""
    branch_id: int
    staff_id: Optional[int] = None
    call_status: Optional[str] = "pending"

class AppointmentCallStatusUpdate(BaseModel):
    call_status: str

class UserPermissionsUpdate(BaseModel):
    role: str
    permissions: Dict[str, bool]
    username: Optional[str] = None
    branch_id: Optional[int] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    password: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    email: str
    role: str
    branch_id: int
    phone: Optional[str] = ""
    password: Optional[str] = "123456"
    status: Optional[str] = "active"

class RolePermissionsUpdate(BaseModel):
    role: str
    permissions: Dict[str, bool]

class PasswordChange(BaseModel):
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class BranchCreate(BaseModel):
    name_th: str
    name_en: str

class CategoryCreate(BaseModel):
    key: str
    name_th: str
    name_en: str

# --- 1. LOGIN ---
@app.post("/api/login")
def login(req: LoginRequest, request: Request):
    # Retrieve user from DB or create a fallback admin/receptionist/optom based on email
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (req.email,))
    user = cursor.fetchone()
    
    if not user:
        # Fallback dynamic user if not found in db, to allow "any email/password" login
        role = "admin"
        if "optom" in req.email:
            role = "optometrist"
        elif "recep" in req.email:
            role = "receptionist"
            
        perms = {
            "dashboard": True, "customers": True, "inventory": role in ["admin", "receptionist"],
            "pos": role in ["admin", "receptionist"], "appointments": True, 
            "users": role == "admin", "reports": role == "admin", "settings": role == "admin"
        }
        
        # Insert fallback user
        cursor.execute(
            "INSERT INTO users (username, email, password, role, permissions, branch_id) VALUES (?, ?, ?, ?, ?, ?)",
            (req.email.split("@")[0].capitalize(), req.email, req.password or "123456", role, json.dumps(perms), 1)
        )
        conn.commit()
        
        cursor.execute("SELECT * FROM users WHERE email = ?", (req.email,))
        user = cursor.fetchone()
    
    user_dict = dict(user)
    
    # Check status
    if user_dict.get("status") == "inactive":
        conn.close()
        raise HTTPException(status_code=403, detail="Account is suspended. Please contact your administrator.")
        
    # Check password
    if user_dict.get("password") != req.password:
        conn.close()
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")
        
    user_dict["permissions"] = json.loads(user_dict["permissions"])
    conn.close()
    
    log_audit_manual(user_dict["id"], user_dict["username"], "LOGIN", "Logged in from Local FastAPI API")
    return {
        "success": True,
        "user": user_dict
    }

# --- 2. BRANCHES ---
@app.get("/api/branches")
def get_branches():
    return query_db("SELECT * FROM branches")

@app.post("/api/branches")
def create_branch(b: BranchCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO branches (name_th, name_en) VALUES (?, ?)", (b.name_th, b.name_en))
        conn.commit()
        return {"success": True, "branch_id": cursor.lastrowid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/branches/{id}")
def update_branch(id: int, b: BranchCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE branches SET name_th = ?, name_en = ? WHERE id = ?", (b.name_th, b.name_en, id))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# --- 2B. PRODUCT CATEGORIES ---
@app.get("/api/categories")
def get_categories():
    return query_db("SELECT * FROM product_categories")

@app.post("/api/categories")
def create_category(cat: CategoryCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO product_categories (key, name_th, name_en) VALUES (?, ?, ?)", (cat.key, cat.name_th, cat.name_en))
        conn.commit()
        return {"success": True, "category_id": cursor.lastrowid}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/categories/{id}")
def update_category(id: int, cat: CategoryCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE product_categories SET key = ?, name_th = ?, name_en = ? WHERE id = ?", (cat.key, cat.name_th, cat.name_en, id))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/categories/{id}")
def delete_category(id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT key FROM product_categories WHERE id = ?", (id,))
        cat = cursor.fetchone()
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        
        cursor.execute("SELECT COUNT(*) FROM inventory WHERE category = ?", (cat[0],))
        if cursor.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Cannot delete category that is currently in use by inventory products")
            
        cursor.execute("DELETE FROM product_categories WHERE id = ?", (id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# --- 3. CUSTOMERS ---
@app.get("/api/customers")
def get_customers(q: Optional[str] = None):
    sql = "SELECT * FROM customers"
    params = []
    if q:
        sql += " WHERE first_name_th LIKE ? OR last_name_th LIKE ? OR first_name_en LIKE ? OR last_name_en LIKE ? OR phone LIKE ?"
        term = f"%{q}%"
        params = [term, term, term, term, term]
    
    customers = query_db(sql, params)
    
    # Check if due for checkup
    today_str = datetime.now().strftime("%Y-%m-%d")
    for c in customers:
        c["checkup_due"] = False
        if c["checkup_due_date"]:
            c["checkup_due"] = c["checkup_due_date"] <= today_str
            
    return customers

@app.post("/api/customers")
def create_customer(c: CustomerCreate):
    conn = get_db()
    cursor = conn.cursor()
    
    # Calculate checkup due date (1 year from last visit or today)
    last_visit = c.last_visit if c.last_visit else datetime.now().strftime("%Y-%m-%d")
    due_date = c.checkup_due_date
    if not due_date:
        # 1 year later
        dt = datetime.strptime(last_visit, "%Y-%m-%d")
        due_date = (dt + timedelta(days=365)).strftime("%Y-%m-%d")
        
    cursor.execute("""
    INSERT INTO customers (first_name_th, last_name_th, first_name_en, last_name_en, phone, email, dob, last_visit, checkup_due_date, photo, gender, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, c.email, c.dob, last_visit, due_date, c.photo, c.gender, c.address))
    
    customer_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"success": True, "customer_id": customer_id}

@app.get("/api/customers/{id}")
def get_customer_details(id: int):
    customer = query_db("SELECT * FROM customers WHERE id = ?", (id,), one=True)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    prescriptions = query_db("SELECT * FROM prescriptions WHERE customer_id = ? ORDER BY date DESC", (id,))
    orders = query_db("SELECT * FROM orders WHERE customer_id = ? ORDER BY date DESC", (id,))
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    customer["checkup_due"] = False
    if customer["checkup_due_date"]:
        customer["checkup_due"] = customer["checkup_due_date"] <= today_str
        
    return {
        "customer": customer,
        "prescriptions": prescriptions,
        "orders": orders
    }

@app.post("/api/customers/{id}/prescriptions")
def add_prescription(id: int, p: PrescriptionCreate):
    conn = get_db()
    cursor = conn.cursor()
    
    # Verify customer exists
    cursor.execute("SELECT id FROM customers WHERE id = ?", (id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Customer not found")
        
    date_str = datetime.now().strftime("%Y-%m-%d")
    
    cursor.execute("""
    INSERT INTO prescriptions (
        customer_id, date, recorded_by,
        od_sph, od_cyl, od_axis, od_add, od_va,
        os_sph, os_cyl, os_axis, os_add, os_va,
        notes, medical_history, previous_glasses
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        id, date_str, p.recorded_by,
        p.od_sph, p.od_cyl, p.od_axis, p.od_add, p.od_va,
        p.os_sph, p.os_cyl, p.os_axis, p.os_add, p.os_va,
        p.notes, p.medical_history, p.previous_glasses
    ))
    
    # Update last visit and next due date (1 year later)
    due_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
    cursor.execute("""
    UPDATE customers 
    SET last_visit = ?, checkup_due_date = ?
    WHERE id = ?
    """, (date_str, due_date, id))
    
    conn.commit()
    conn.close()
    
    return {"success": True}

# --- 4. INVENTORY ---
@app.get("/api/inventory")
def get_inventory(branch_id: int, category: Optional[str] = None):
    sql = "SELECT * FROM inventory WHERE branch_id = ?"
    params = [branch_id]
    if category:
        sql += " AND category = ?"
        params.append(category)
        
    items = query_db(sql, params)
    for item in items:
        item["low_stock"] = item["stock"] <= item["min_stock"]
        
    return items

@app.put("/api/inventory/{id}")
def update_stock(id: int, request: Request, stock: int = Query(...)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT name_th, stock FROM inventory WHERE id = ?", (id,))
    prod = cursor.fetchone()
    prod_name = prod["name_th"] if prod else f"ID {id}"
    old_stock = prod["stock"] if prod else 0
    
    cursor.execute("UPDATE inventory SET stock = ? WHERE id = ?", (stock, id))
    conn.commit()
    conn.close()
    log_audit(request, "UPDATE_STOCK", f"Adjusted stock for product {prod_name} from {old_stock} to {stock}")
    return {"success": True}

@app.post("/api/inventory")
def add_product(p: ProductCreate, branch_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT INTO inventory (name_th, name_en, barcode, category, price, stock, min_stock, branch_id, image, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (p.name_th, p.name_en, p.barcode, p.category, p.price, p.stock, p.min_stock, branch_id, p.image, p.description))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

# --- 5. POINT OF SALE (POS) ---
@app.post("/api/orders")
def create_order(order: OrderCreate, request: Request):
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # 1. Insert order
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
        INSERT INTO orders (customer_id, customer_name, date, branch_id, total_amount, deposit_amount, payment_method, payment_details, status, staff_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            order.customer_id,
            order.customer_name,
            date_str,
            order.branch_id,
            order.total_amount,
            order.deposit_amount,
            order.payment_method,
            json.dumps(order.payment_details),
            order.status,
            order.staff_id
        ))
        order_id = cursor.lastrowid
        
        # 2. Insert items and decrement inventory stock
        has_frame = False
        has_lens = False
        lens_details = ""
        
        for item in order.items:
            # Check stock
            cursor.execute("SELECT stock, name_en, category FROM inventory WHERE id = ? AND branch_id = ?", (item.product_id, order.branch_id))
            prod = cursor.fetchone()
            if not prod:
                raise HTTPException(status_code=400, detail=f"Product {item.product_id} not found in this branch")
                
            new_stock = prod[0] - item.quantity
            if new_stock < 0:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {prod[1]}. Available: {prod[0]}")
                
            # Update stock
            cursor.execute("UPDATE inventory SET stock = ? WHERE id = ?", (new_stock, item.product_id))
            
            # Insert item record
            cursor.execute("""
            INSERT INTO order_items (order_id, product_id, quantity, price)
            VALUES (?, ?, ?, ?)
            """, (order_id, item.product_id, item.quantity, item.price))
            
            # Check if this order needs a lab job
            if prod[2] == "frame":
                has_frame = True
                lens_details += f"Frame: {prod[1]}\n"
            elif prod[2] == "lens":
                has_lens = True
                lens_details += f"Lens: {prod[1]}\n"
        
        # 3. Create Lab Job if order has lens
        if has_lens:
            job_details = f"Order #{order_id} Lab Request:\n{lens_details}"
            if order.customer_id:
                cursor.execute("SELECT last_name_en, first_name_en FROM customers WHERE id = ?", (order.customer_id,))
                c_info = cursor.fetchone()
                c_name = f"{c_info[1]} {c_info[0]}" if c_info else order.customer_name
            else:
                c_name = order.customer_name
                
            cursor.execute("""
            INSERT INTO lab_jobs (order_id, customer_name, details, status, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """, (order_id, c_name, job_details, "pending", date_str[:16]))
            
        # 4. If this is a registered customer, update their last visit
        if order.customer_id:
            cursor.execute("""
            UPDATE customers 
            SET last_visit = ? 
            WHERE id = ?
            """, (date_str[:10], order.customer_id))
            
        conn.commit()
        return {"success": True, "order_id": order_id, "date": date_str}
        
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# --- 6. APPOINTMENTS ---
@app.get("/api/appointments")
def get_appointments(branch_id: int):
    # Return all appointments for this branch with customer phone number joined
    return query_db("""
        SELECT a.*, c.phone as customer_phone
        FROM appointments a
        LEFT JOIN customers c ON a.customer_id = c.id
        WHERE a.branch_id = ?
        ORDER BY a.date_time ASC
    """, (branch_id,))

@app.post("/api/appointments")
def create_appointment(a: AppointmentCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO appointments (customer_id, customer_name, date_time, type, notes, branch_id, staff_id, call_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (a.customer_id, a.customer_name, a.date_time, a.type, a.notes, a.branch_id, a.staff_id, a.call_status or "pending"))
    conn.commit()
    conn.close()
    return {"success": True}

@app.put("/api/appointments/{id}/call_status")
def update_appointment_call_status(id: int, req: AppointmentCallStatusUpdate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE appointments
    SET call_status = ?
    WHERE id = ?
    """, (req.call_status, id))
    conn.commit()
    conn.close()
    return {"success": True}

# --- 7. USERS & PERMISSIONS ---
@app.get("/api/users")
def get_users():
    users = query_db("SELECT u.*, b.name_en as branch_name FROM users u LEFT JOIN branches b ON u.branch_id = b.id")
    for u in users:
        u["permissions"] = json.loads(u["permissions"])
    return users

@app.post("/api/users")
def create_user(u: UserCreate, request: Request):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if email exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (u.email,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")
        
    # Fetch default permissions from role_permissions
    cursor.execute("SELECT permissions FROM role_permissions WHERE role = ?", (u.role,))
    row = cursor.fetchone()
    if row:
        perms = json.loads(row[0])
    else:
        perms = {
            "dashboard": True,
            "customers": True,
            "inventory": u.role in ["admin", "receptionist"],
            "pos": u.role in ["admin", "receptionist"],
            "appointments": True,
            "users": u.role == "admin",
            "reports": u.role == "admin",
            "settings": u.role == "admin"
        }
    
    cursor.execute("""
    INSERT INTO users (username, email, password, phone, status, role, permissions, branch_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (u.username, u.email, u.password or "123456", u.phone, u.status or "active", u.role, json.dumps(perms), u.branch_id))
    conn.commit()
    conn.close()
    
    log_audit(request, "CREATE_USER", f"Created staff user {u.username} ({u.email}, Role: {u.role})")
    return {"success": True}

@app.delete("/api/users/{id}")
def delete_user(id: int, request: Request):
    conn = get_db()
    cursor = conn.cursor()
    
    # Fetch username before delete
    cursor.execute("SELECT username, email FROM users WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    cursor.execute("DELETE FROM users WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    
    log_audit(request, "DELETE_USER", f"Deleted staff user {row['username']} ({row['email']})")
    return {"success": True}

@app.put("/api/users/{id}/permissions")
def update_user_permissions(id: int, p: UserPermissionsUpdate, request: Request):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT username, role, password, phone, status, branch_id FROM users WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    old_name = row["username"]
    
    role = p.role if p.role is not None else row["role"]
    permissions_str = json.dumps(p.permissions)
    username = p.username if p.username is not None else row["username"]
    branch_id = p.branch_id if p.branch_id is not None else row["branch_id"]
    phone = p.phone if p.phone is not None else row["phone"]
    status = p.status if p.status is not None else row["status"]
    password = p.password if p.password is not None else row["password"]
    
    cursor.execute("""
    UPDATE users
    SET role = ?, permissions = ?, username = ?, branch_id = ?, phone = ?, status = ?, password = ?
    WHERE id = ?
    """, (role, permissions_str, username, branch_id, phone, status, password, id))
    conn.commit()
    conn.close()
    
    log_audit(request, "UPDATE_USER", f"Updated staff user {old_name} -> {username} (Role: {role})")
    return {"success": True}

# --- 7B. ROLES CONFIGURATION ---
@app.get("/api/roles")
def get_roles():
    roles = query_db("SELECT * FROM role_permissions")
    for r in roles:
        r["permissions"] = json.loads(r["permissions"])
    return roles

@app.put("/api/roles")
def update_role_permissions(rp: RolePermissionsUpdate, request: Request):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO role_permissions (role, permissions)
    VALUES (?, ?)
    ON CONFLICT(role) DO UPDATE SET permissions = excluded.permissions
    """, (rp.role, json.dumps(rp.permissions)))
    conn.commit()
    conn.close()
    log_audit(request, "UPDATE_ROLE_DEFAULTS", f"Updated default permissions template for role: {rp.role}")
    return {"success": True}

# --- 7C. PASSWORD CONTROLS ---
@app.put("/api/users/{id}/password")
def change_password(id: int, pc: PasswordChange, request: Request):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT username FROM users WHERE id = ?", (id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    cursor.execute("UPDATE users SET password = ? WHERE id = ?", (pc.new_password, id))
    conn.commit()
    conn.close()
    log_audit(request, "CHANGE_PASSWORD", f"Changed password for user {row['username']}")
    return {"success": True}

@app.post("/api/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username FROM users WHERE email = ?", (req.email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Email not found")
        
    temp_password = "123456"
    cursor.execute("UPDATE users SET password = ? WHERE id = ?", (temp_password, row["id"]))
    conn.commit()
    conn.close()
    
    log_audit_manual(row["id"], row["username"], "FORGOT_PASSWORD", f"Requested password reset. Password reset to temporary password: {temp_password}")
    return {
        "success": True,
        "message": f"Password reset simulated successfully! Temporary password is: {temp_password}"
    }

# --- AUDIT LOGS ENDPOINT ---
@app.get("/api/audit-logs")
def get_audit_logs():
    return query_db("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200")

# --- 8. REPORTS ---
@app.get("/api/reports")
def get_reports(branch_id: int):
    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    month_str = now_dt.strftime("%Y-%m")
    due_cutoff = (now_dt + timedelta(days=30)).strftime("%Y-%m-%d")
    dead_cutoff = (now_dt - timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S")

    # === SECTION 1: ฝ่ายขาย (Sales) ===
    # 1. ยอดขายรายวัน (last 30 days)
    daily_sales = query_db("""
        SELECT SUBSTR(date, 1, 10) as day, COUNT(id) as bills, SUM(total_amount) as sales, SUM(deposit_amount) as deposit 
        FROM orders 
        WHERE branch_id = ? 
        GROUP BY day 
        ORDER BY day DESC 
        LIMIT 30
    """, (branch_id,))

    # 2. ยอดขายรายเดือน (last 12 months)
    monthly_sales = query_db("""
        SELECT SUBSTR(date, 1, 7) as month, COUNT(id) as bills, SUM(total_amount) as sales, SUM(deposit_amount) as deposit 
        FROM orders 
        WHERE branch_id = ? 
        GROUP BY month 
        ORDER BY month DESC 
        LIMIT 12
    """, (branch_id,))

    # 3. ยอดขายตามสินค้า
    sales_by_product = query_db("""
        SELECT i.barcode, i.name_th, i.name_en, i.category, SUM(oi.quantity) as qty_sold, SUM(oi.quantity * oi.price) as total_sales
        FROM order_items oi
        JOIN inventory i ON oi.product_id = i.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.branch_id = ?
        GROUP BY oi.product_id, i.barcode, i.name_th, i.name_en, i.category
        ORDER BY total_sales DESC
    """, (branch_id,))

    # 4. ยอดขายตามพนักงาน
    sales_by_staff = query_db("""
        SELECT u.username, u.role, COUNT(o.id) as bills, SUM(o.total_amount) as total_sales
        FROM orders o
        JOIN users u ON o.staff_id = u.id
        WHERE o.branch_id = ?
        GROUP BY o.staff_id, u.username, u.role
        ORDER BY total_sales DESC
    """, (branch_id,))

    # === SECTION 2: ลูกค้า (Customers) ===
    # 5. ลูกค้าใหม่ (first order this month)
    new_customers = query_db("""
        SELECT c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, MIN(o.date) as first_purchase_date, o.total_amount
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.branch_id = ?
        GROUP BY o.customer_id, c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone
        HAVING first_purchase_date LIKE ?
    """, (branch_id, f"{month_str}%"))

    # 6. ลูกค้าซื้อซ้ำ (buying this month with >= 2 orders in history)
    returning_customers = query_db("""
        SELECT c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone, COUNT(o.id) as total_bills, SUM(o.total_amount) as total_spent
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        WHERE o.branch_id = ?
          AND o.customer_id IN (
              SELECT customer_id FROM orders WHERE date LIKE ?
          )
        GROUP BY o.customer_id, c.id, c.first_name_th, c.last_name_th, c.first_name_en, c.last_name_en, c.phone
        HAVING total_bills >= 2
    """, (branch_id, f"{month_str}%"))

    # 7. ลูกค้าใกล้ครบกำหนด (eye exam checkup due in the past or next 30 days)
    due_checkups = query_db("""
        SELECT id, first_name_th, last_name_th, first_name_en, last_name_en, phone, last_visit, checkup_due_date 
        FROM customers 
        WHERE checkup_due_date <= ? 
        ORDER BY checkup_due_date ASC
    """, (due_cutoff,))

    # === SECTION 3: งานแว่น (Optical Jobs) ===
    # 8. Work Orders (all lab jobs)
    work_orders = query_db("""
        SELECT l.id, l.order_id, l.customer_name, l.details, l.status, l.updated_at
        FROM lab_jobs l
        JOIN orders o ON l.order_id = o.id
        WHERE o.branch_id = ?
        ORDER BY l.id DESC
    """, (branch_id,))

    # 9. งานค้างส่งมอบ (lab jobs not completed)
    pending_jobs = query_db("""
        SELECT l.id, l.order_id, l.customer_name, l.details, l.status, o.date as order_date
        FROM lab_jobs l
        JOIN orders o ON l.order_id = o.id
        WHERE o.branch_id = ? AND l.status != 'completed'
        ORDER BY o.date ASC
    """, (branch_id,))

    # === SECTION 4: สต๊อก (Stock) ===
    # 10. สินค้าคงเหลือ (all products with their stock values)
    remaining_stock = query_db("""
        SELECT barcode, name_th, name_en, category, price, stock, (price * stock) as stock_value 
        FROM inventory 
        WHERE branch_id = ? 
        ORDER BY stock DESC
    """, (branch_id,))

    # 11. สินค้าขายดี (same query as sales_by_product but ordered by quantity sold)
    best_sellers = query_db("""
        SELECT i.barcode, i.name_th, i.name_en, i.category, i.price, SUM(oi.quantity) as qty_sold, SUM(oi.quantity * oi.price) as total_sales
        FROM order_items oi
        JOIN inventory i ON oi.product_id = i.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.branch_id = ?
        GROUP BY oi.product_id, i.barcode, i.name_th, i.name_en, i.category, i.price
        ORDER BY qty_sold DESC
    """, (branch_id,))

    # 12. Dead Stock (stock > 0 and no sales in last 90 days)
    dead_stock = query_db("""
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
    """, (branch_id, branch_id, dead_cutoff))

    # === SECTION 5: การเงิน (Finance) ===
    # 13. รับเงิน (fully paid bills)
    collected = query_db("""
        SELECT id, customer_name, date, total_amount, deposit_amount, payment_method, status 
        FROM orders 
        WHERE branch_id = ? AND status = 'Paid' 
        ORDER BY date DESC
    """, (branch_id,))

    # 14. เงินมัดจำ (partially paid orders with deposit status)
    deposits = query_db("""
        SELECT id, customer_name, date, total_amount, deposit_amount, (total_amount - deposit_amount) as balance, payment_method, status 
        FROM orders 
        WHERE branch_id = ? AND status = 'Deposit' 
        ORDER BY date DESC
    """, (branch_id,))

    # Support compatibility with previous endpoints
    branch_sales = query_db("""
        SELECT b.name_th, b.name_en, SUM(o.total_amount) as total_sales, SUM(o.deposit_amount) as total_deposit 
        FROM branches b 
        LEFT JOIN orders o ON b.id = o.branch_id 
        GROUP BY b.id
    """)

    return {
        "sales": {
            "daily": daily_sales,
            "monthly": monthly_sales,
            "by_product": sales_by_product,
            "by_staff": sales_by_staff
        },
        "customers": {
            "new": new_customers,
            "returning": returning_customers,
            "due_checkups": due_checkups
        },
        "jobs": {
            "work_orders": work_orders,
            "pending": pending_jobs
        },
        "stock": {
            "remaining": remaining_stock,
            "best_sellers": best_sellers,
            "dead_stock": dead_stock
        },
        "finance": {
            "collected": collected,
            "deposits": deposits
        },
        "branch_sales": branch_sales
    }

# --- 9. DASHBOARD STATS ---
# --- 9. DASHBOARD STATS ---
@app.get("/api/dashboard")
def get_dashboard_stats(branch_id: int):
    # Get current date strings
    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    month_str = now_dt.strftime("%Y-%m")
    cutoff_str = (now_dt - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")

    # 1. Total revenue (sum of deposit/payments) for this branch
    sales_res = query_db("SELECT SUM(deposit_amount) as total FROM orders WHERE branch_id = ?", (branch_id,), one=True)
    revenue = sales_res["total"] if sales_res and sales_res["total"] else 0.0

    # 2. Today's Sales (ยอดขายวันนี้)
    today_sales_res = query_db("SELECT SUM(total_amount) as total FROM orders WHERE branch_id = ? AND date LIKE ?", (branch_id, f"{today_str}%"), one=True)
    today_sales = today_sales_res["total"] if today_sales_res and today_sales_res["total"] else 0.0

    # 3. Monthly Sales (ยอดขายเดือนนี้)
    monthly_sales_res = query_db("SELECT SUM(total_amount) as total FROM orders WHERE branch_id = ? AND date LIKE ?", (branch_id, f"{month_str}%"), one=True)
    monthly_sales = monthly_sales_res["total"] if monthly_sales_res and monthly_sales_res["total"] else 0.0

    # 4. Monthly Profit (กำไรเดือนนี้)
    profit_items = query_db("""
        SELECT oi.price, oi.quantity, i.category
        FROM order_items oi
        JOIN inventory i ON oi.product_id = i.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.branch_id = ? AND o.date LIKE ?
    """, (branch_id, f"{month_str}%"))
    
    monthly_profit = 0.0
    for item in profit_items:
        cat = item["category"]
        qty = item["quantity"]
        price = item["price"]
        if cat == "frame":
            margin = 0.65
        elif cat == "lens":
            margin = 0.60
        elif cat == "contact":
            margin = 0.30
        else:
            margin = 0.50
        monthly_profit += qty * price * margin

    # 5. Bill Count (จำนวนบิล)
    today_bills_res = query_db("SELECT COUNT(*) as count FROM orders WHERE branch_id = ? AND date LIKE ?", (branch_id, f"{today_str}%"), one=True)
    today_bills = today_bills_res["count"] if today_bills_res else 0

    monthly_bills_res = query_db("SELECT COUNT(*) as count FROM orders WHERE branch_id = ? AND date LIKE ?", (branch_id, f"{month_str}%"), one=True)
    monthly_bills = monthly_bills_res["count"] if monthly_bills_res else 0

    # 6. New Customers (ลูกค้าใหม่)
    new_cust_res = query_db("""
        SELECT COUNT(*) as count FROM (
            SELECT customer_id, MIN(date) as first_date
            FROM orders
            WHERE customer_id IS NOT NULL AND branch_id = ?
            GROUP BY customer_id
        ) as sub WHERE first_date LIKE ?
    """, (branch_id, f"{month_str}%"), one=True)
    new_customers = new_cust_res["count"] if new_cust_res else 0

    # 7. Returning Customers (ลูกค้าซื้อซ้ำ)
    ret_cust_res = query_db("""
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
    """, (branch_id, f"{month_str}%"), one=True)
    returning_customers = ret_cust_res["count"] if ret_cust_res else 0

    # 8. Pending Lab Jobs (งานรอส่งมอบ)
    pending_labs_res = query_db("""
        SELECT COUNT(*) as count
        FROM lab_jobs l
        JOIN orders o ON l.order_id = o.id
        WHERE o.branch_id = ? AND l.status != 'completed'
    """, (branch_id,), one=True)
    pending_labs = pending_labs_res["count"] if pending_labs_res else 0

    # 9. Overdue Jobs (งานค้างเกินกำหนด)
    overdue_labs_res = query_db("""
        SELECT COUNT(*) as count
        FROM lab_jobs l
        JOIN orders o ON l.order_id = o.id
        WHERE o.branch_id = ? AND l.status != 'completed' AND o.date < ?
    """, (branch_id, cutoff_str), one=True)
    overdue_labs = overdue_labs_res["count"] if overdue_labs_res else 0

    # 10. Low Stock Alert Count (สินค้าใกล้หมด)
    low_stock_res = query_db("SELECT COUNT(*) as count FROM inventory WHERE branch_id = ? AND stock <= min_stock", (branch_id,), one=True)
    low_stock_count = low_stock_res["count"] if low_stock_res else 0

    # 11. Top 5 Best Selling Products (Top 5 สินค้าขายดี)
    top_sellers = query_db("""
        SELECT i.name_th, i.name_en, SUM(oi.quantity) as total_qty, i.category, i.price
        FROM order_items oi
        JOIN inventory i ON oi.product_id = i.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.branch_id = ?
        GROUP BY oi.product_id, i.name_th, i.name_en, i.category, i.price
        ORDER BY total_qty DESC
        LIMIT 5
    """, (branch_id,))

    # Recent lists for lists detail display
    recent_orders = query_db("""
        SELECT * FROM orders 
        WHERE branch_id = ? 
        ORDER BY date DESC LIMIT 5
    """, (branch_id,))

    lab_jobs = query_db("""
        SELECT l.* 
        FROM lab_jobs l 
        JOIN orders o ON l.order_id = o.id 
        WHERE o.branch_id = ?
        ORDER BY l.id DESC LIMIT 5
    """, (branch_id,))

    low_stock_items = query_db("""
        SELECT name_th, name_en, stock, min_stock, category 
        FROM inventory 
        WHERE branch_id = ? AND stock <= min_stock
    """, (branch_id,))

    return {
        "revenue": revenue,
        "today_sales": today_sales,
        "monthly_sales": monthly_sales,
        "monthly_profit": monthly_profit,
        "today_bills": today_bills,
        "monthly_bills": monthly_bills,
        "new_customers": new_customers,
        "returning_customers": returning_customers,
        "pending_labs": pending_labs,
        "overdue_labs": overdue_labs,
        "low_stock_count": low_stock_count,
        "top_sellers": top_sellers,
        "recent_orders": recent_orders,
        "lab_jobs": lab_jobs,
        "low_stock_items": low_stock_items
    }

# Serve static files at the root
from fastapi.staticfiles import StaticFiles
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/", StaticFiles(directory=parent_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
