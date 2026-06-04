import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "opticare.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # 1. Branches Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_th TEXT NOT NULL,
        name_en TEXT NOT NULL
    );
    """)

    # 2. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL DEFAULT '123456',
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        role TEXT NOT NULL, -- admin, optometrist, receptionist
        permissions TEXT NOT NULL, -- JSON string of permissions
        branch_id INTEGER,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    """)

    # Alter users to add new columns for existing local databases
    for col, definition in [("password", "TEXT NOT NULL DEFAULT '123456'"), 
                            ("phone", "TEXT"), 
                            ("status", "TEXT NOT NULL DEFAULT 'active'")]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {definition};")
            conn.commit()
        except sqlite3.OperationalError:
            pass # Column already exists

    # 2B. Role Permissions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS role_permissions (
        role TEXT PRIMARY KEY,
        permissions TEXT NOT NULL
    );
    """)

    # Seed default permissions for roles if empty
    cursor.execute("SELECT COUNT(*) FROM role_permissions")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO role_permissions (role, permissions) VALUES (?, ?)
        """, [
            ("admin", json.dumps({
                "dashboard": True, "customers": True, "inventory": True, "pos": True,
                "appointments": True, "users": True, "reports": True, "settings": True
            })),
            ("optometrist", json.dumps({
                "dashboard": True, "customers": True, "inventory": False, "pos": False,
                "appointments": True, "users": False, "reports": False, "settings": False
            })),
            ("receptionist", json.dumps({
                "dashboard": True, "customers": True, "inventory": True, "pos": True,
                "appointments": True, "users": False, "reports": False, "settings": False
            }))
        ])
        conn.commit()

    # 3. Customers Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name_th TEXT NOT NULL,
        last_name_th TEXT NOT NULL,
        first_name_en TEXT NOT NULL,
        last_name_en TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        dob TEXT, -- YYYY-MM-DD
        last_visit TEXT, -- YYYY-MM-DD
        checkup_due_date TEXT, -- YYYY-MM-DD
        photo TEXT,
        gender TEXT,
        address TEXT
    );
    """)

    # 4. Eye Prescriptions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS prescriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        recorded_by TEXT NOT NULL, -- Optometrist's name
        od_sph REAL, -- Right Eye Sphere
        od_cyl REAL, -- Right Eye Cylinder
        od_axis REAL, -- Right Eye Axis
        od_add REAL, -- Right Eye Add
        od_va TEXT, -- Right Eye Visual Acuity
        os_sph REAL, -- Left Eye Sphere
        os_cyl REAL, -- Left Eye Cylinder
        os_axis REAL, -- Left Eye Axis
        os_add REAL, -- Left Eye Add
        os_va TEXT, -- Left Eye Visual Acuity
        notes TEXT, -- Comments/Opinion
        medical_history TEXT, -- Underlying medical conditions
        previous_glasses TEXT, -- Old/Existing glasses details
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );
    """)

    # Product Categories Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name_th TEXT NOT NULL,
        name_en TEXT NOT NULL
    );
    """)

    # Seed default categories if empty
    cursor.execute("SELECT COUNT(*) FROM product_categories")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO product_categories (key, name_th, name_en) VALUES (?, ?, ?)
        """, [
            ("frame", "กรอบแว่นตา", "Frames"),
            ("lens", "เลนส์สายตา", "Optical Lenses"),
            ("contact", "คอนแทคเลนส์", "Contact Lenses")
        ])

    # 5. Inventory Table (Products)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name_th TEXT NOT NULL,
        name_en TEXT NOT NULL,
        barcode TEXT UNIQUE NOT NULL,
        category TEXT NOT NULL, -- frame, lens, contact
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        min_stock INTEGER NOT NULL DEFAULT 5,
        branch_id INTEGER NOT NULL,
        image TEXT, -- Product Image (URL/base64)
        description TEXT, -- Product details
        FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
    """)

    # 6. Orders Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER, -- NULL for general customers
        customer_name TEXT,
        date TEXT NOT NULL, -- YYYY-MM-DD HH:MM:SS
        branch_id INTEGER NOT NULL,
        total_amount REAL NOT NULL,
        deposit_amount REAL DEFAULT 0,
        payment_method TEXT NOT NULL, -- e.g. Cash, Card, Bank Transfer, Split
        payment_details TEXT, -- JSON details (e.g. cash: 500, bank: 1000)
        status TEXT NOT NULL, -- Paid, Deposit, Pending
        staff_id INTEGER,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (staff_id) REFERENCES users(id)
    );
    """)

    # Alter orders to add staff_id for existing local databases
    try:
        cursor.execute("ALTER TABLE orders ADD COLUMN staff_id INTEGER REFERENCES users(id);")
        conn.commit()
    except sqlite3.OperationalError:
        # Column already exists
        pass

    # 7. Order Items Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES inventory(id)
    );
    """)

    # 8. Appointments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        customer_name TEXT NOT NULL,
        date_time TEXT NOT NULL, -- YYYY-MM-DD HH:MM
        type TEXT NOT NULL, -- eye_exam, pickup, consultation
        notes TEXT,
        branch_id INTEGER NOT NULL,
        staff_id INTEGER,
        call_status TEXT DEFAULT 'pending',
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (staff_id) REFERENCES users(id)
    );
    """)

    # 9. Lab Jobs Table (linked to orders)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS lab_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        details TEXT NOT NULL, -- Details of lens fabrication
        status TEXT NOT NULL, -- pending, in_progress, completed
        updated_at TEXT NOT NULL, -- YYYY-MM-DD HH:MM
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    """)

    # 10. Audit Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        timestamp TEXT NOT NULL
    );
    """)

    conn.commit()
    conn.close()
    print("Database tables initialized successfully!")

if __name__ == "__main__":
    init_db()
