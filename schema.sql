-- ==========================================================================
-- OptiCare Cloudflare D1 Database Schema & Seed Script
-- Compatible with Cloudflare serverless D1 SQL engines
-- ==========================================================================

DROP TABLE IF EXISTS lab_jobs;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS product_categories;

-- 1. Branches Table
CREATE TABLE branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL
);

-- 2. Users Table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL DEFAULT '123456',
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    role TEXT NOT NULL,
    permissions TEXT NOT NULL, -- JSON string
    branch_id INTEGER,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- 2B. Role Permissions Table
CREATE TABLE role_permissions (
    role TEXT PRIMARY KEY,
    permissions TEXT NOT NULL
);

-- 3. Customers Table
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name_th TEXT NOT NULL,
    last_name_th TEXT NOT NULL,
    first_name_en TEXT NOT NULL,
    last_name_en TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    dob TEXT,
    last_visit TEXT,
    checkup_due_date TEXT,
    photo TEXT,
    gender TEXT,
    address TEXT
);

-- 4. Eye Prescriptions Table (OD/OS)
CREATE TABLE prescriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    recorded_by TEXT NOT NULL,
    od_sph REAL,
    od_cyl REAL,
    od_axis REAL,
    od_add REAL,
    od_va TEXT,
    os_sph REAL,
    os_cyl REAL,
    os_axis REAL,
    os_add REAL,
    os_va TEXT,
    notes TEXT,
    medical_history TEXT,
    previous_glasses TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- 4B. Product Categories Table
CREATE TABLE product_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL
);

-- 5. Inventory Table (Products)
CREATE TABLE inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL,
    barcode TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL, -- frame, lens, contact
    price REAL NOT NULL,
    stock INTEGER NOT NULL,
    min_stock INTEGER NOT NULL DEFAULT 5,
    branch_id INTEGER NOT NULL,
    image TEXT,
    description TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- 6. Orders Table
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT,
    date TEXT NOT NULL,
    branch_id INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    deposit_amount REAL DEFAULT 0,
    payment_method TEXT NOT NULL,
    payment_details TEXT, -- JSON string
    status TEXT NOT NULL,
    staff_id INTEGER,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (staff_id) REFERENCES users(id)
);

-- 7. Order Items Table
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES inventory(id)
);

-- 8. Appointments Table
CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    date_time TEXT NOT NULL,
    type TEXT NOT NULL, -- eye_exam, pickup, consultation
    notes TEXT,
    branch_id INTEGER NOT NULL,
    staff_id INTEGER,
    call_status TEXT DEFAULT 'pending',
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (staff_id) REFERENCES users(id)
);

-- 9. Lab Jobs Table
CREATE TABLE lab_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL, -- pending, in_progress, completed
    updated_at TEXT NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ==========================================================================
-- SEED DATA FOR CLOUDFLARE D1
-- ==========================================================================

-- 1. Seed Branches
INSERT INTO branches (id, name_th, name_en) VALUES 
(1, 'กรุงเทพฯ - สยาม', 'Bangkok - Siam'),
(2, 'เชียงใหม่ - นิมมาน', 'Chiang Mai - Nimman'),
(3, 'ภูเก็ต - ป่าตอง', 'Phuket - Patong');

-- 2. Seed Users
-- admin_perms = {"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":true,"reports":true}
-- optom_perms = {"dashboard":true,"customers":true,"inventory":false,"pos":false,"appointments":true,"users":false,"reports":false}
-- recep_perms = {"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":false,"reports":false}
INSERT INTO users (id, username, email, role, permissions, branch_id) VALUES
(1, 'Somchai', 'somchai@opticare.com', 'admin', '{"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":true,"reports":true}', 1),
(2, 'Dr. Naphat', 'naphat@opticare.com', 'optometrist', '{"dashboard":true,"customers":true,"inventory":false,"pos":false,"appointments":true,"users":false,"reports":false}', 1),
(3, 'Kanya', 'kanya@opticare.com', 'receptionist', '{"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":false,"reports":false}', 1),
(4, 'Siri', 'siri@opticare.com', 'receptionist', '{"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":false,"reports":false}', 2),
(5, 'Dr. Wittaya', 'wittaya@opticare.com', 'optometrist', '{"dashboard":true,"customers":true,"inventory":false,"pos":false,"appointments":true,"users":false,"reports":false}', 3);

-- 3. Seed Customers (Checkup due in 2026-05 and 2026-06)
INSERT INTO customers (id, first_name_th, last_name_th, first_name_en, last_name_en, phone, email, dob, last_visit, checkup_due_date, photo, gender, address) VALUES
(1, 'วิชัย', 'ใจดี', 'Wichai', 'Jaidee', '081-234-5678', 'wichai@gmail.com', '1985-04-12', '2025-05-20', '2026-05-20', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150', 'ชาย', '456 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110'),
(2, 'นารี', 'รักดี', 'Naree', 'Rakdee', '089-876-5432', 'naree@outlook.com', '1992-09-24', '2025-06-01', '2026-06-01', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150', 'หญิง', '789 ถนนนิมมานเหมินท์ ต.สุเทพ อ.เมือง เชียงใหม่ 50200'),
(3, 'จอห์น', 'สมิธ', 'John', 'Smith', '082-111-2222', 'john.smith@yahoo.com', '1978-11-05', '2026-01-15', '2027-01-15', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=150', 'ชาย', '12/3 ถนนหาดป่าตอง อ.กะทู้ ภูเก็ต 83150'),
(4, 'กิตติ', 'ศิริชัย', 'Kitti', 'Sirichai', '086-555-7788', 'kitti@live.com', '1965-03-30', '2025-05-15', '2026-05-15', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=150', 'ชาย', '55/9 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310'),
(5, 'รัตนา', 'อารีย์', 'Rattana', 'Aree', '084-999-0000', 'rattana@gmail.com', '1998-07-18', '2026-04-20', '2027-04-20', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=150', 'หญิง', '88 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900');

-- 4. Seed Prescriptions (OD/OS)
INSERT INTO prescriptions (id, customer_id, date, recorded_by, od_sph, od_cyl, od_axis, od_add, od_va, os_sph, os_cyl, os_axis, os_add, os_va) VALUES
(1, 1, '2024-05-18', 'Dr. Naphat', -1.50, -0.50, 90, 1.00, '6/6', -1.25, -0.75, 85, 1.00, '6/6'),
(2, 1, '2025-05-20', 'Dr. Naphat', -1.75, -0.50, 90, 1.25, '6/5', -1.50, -0.75, 85, 1.25, '6/6'),
(3, 2, '2025-06-01', 'Dr. Naphat', -3.00, NULL, NULL, NULL, '6/6', -2.75, -0.25, 180, NULL, '6/6'),
(4, 3, '2026-01-15', 'Dr. Wittaya', 1.25, -1.00, 45, 2.00, '6/9', 1.50, -1.25, 135, 2.00, '6/9'),
(5, 4, '2024-05-10', 'Dr. Wittaya', -4.25, -1.50, 10, 1.75, '6/6', -4.00, -1.75, 175, 1.75, '6/6'),
(6, 4, '2025-05-15', 'Dr. Wittaya', -4.50, -1.50, 12, 2.00, '6/6', -4.25, -2.00, 170, 2.00, '6/6');

-- 4B. Seed Product Categories
INSERT INTO product_categories (id, key, name_th, name_en) VALUES
(1, 'frame', 'กรอบแว่นตา', 'Frames'),
(2, 'lens', 'เลนส์สายตา', 'Optical Lenses'),
(3, 'contact', 'คอนแทคเลนส์', 'Contact Lenses');

-- 5. Seed Inventory Products
INSERT INTO inventory (id, name_th, name_en, barcode, category, price, stock, min_stock, branch_id) VALUES
-- Branch 1 (Siam)
(1, 'แว่นตา Gucci Classic Rectangular', 'Gucci Classic Rectangular Frame', 'GUC-101', 'frame', 12500, 10, 3, 1),
(2, 'แว่นตา Ray-Ban Aviator Gold', 'Ray-Ban Aviator Gold Frame', 'RAY-202', 'frame', 6800, 3, 5, 1),
(3, 'เลนส์ Hoya 1.60 Single Vision BlueControl', 'Hoya 1.60 Single Vision BlueControl Lens', 'HOY-301', 'lens', 3500, 20, 5, 1),
(4, 'เลนส์ Essilor Crizal Sapphire 1.56', 'Essilor Crizal Sapphire 1.56 Lens', 'ESS-401', 'lens', 2800, 2, 5, 1),
(5, 'คอนแทคเลนส์ Acuvue Oasys 1-Day (30 ชิ้น)', 'Acuvue Oasys 1-Day Contact Lenses (30 Pack)', 'ACU-501', 'contact', 1650, 15, 4, 1),
(6, 'คอนแทคเลนส์ Bausch & Lomb Ultra (6 ชิ้น)', 'Bausch & Lomb Ultra Contact Lenses (6 Pack)', 'BAU-601', 'contact', 950, 8, 3, 1),
(7, 'แว่นตา Oakley Holbrook Sport', 'Oakley Holbrook Sport Frame', 'OAK-701', 'frame', 5400, 12, 3, 1),
(8, 'เลนส์ Zeiss Progressive Classic 1.5', 'Zeiss Progressive Classic 1.5 Lens', 'ZEI-801', 'lens', 9800, 6, 2, 1),
-- Branch 2 (Nimman)
(9, 'แว่นตา Gucci Classic Rectangular', 'Gucci Classic Rectangular Frame', 'GUC-101-B2', 'frame', 12500, 4, 3, 2),
(10, 'แว่นตา Ray-Ban Aviator Gold', 'Ray-Ban Aviator Gold Frame', 'RAY-202-B2', 'frame', 6800, 8, 5, 2),
(11, 'เลนส์ Hoya 1.60 Single Vision BlueControl', 'Hoya 1.60 Single Vision BlueControl Lens', 'HOY-301-B2', 'lens', 3500, 12, 5, 2),
(12, 'เลนส์ Essilor Crizal Sapphire 1.56', 'Essilor Crizal Sapphire 1.56 Lens', 'ESS-401-B2', 'lens', 2800, 1, 5, 2),
(13, 'คอนแทคเลนส์ Acuvue Oasys 1-Day (30 ชิ้น)', 'Acuvue Oasys 1-Day Contact Lenses (30 Pack)', 'ACU-501-B2', 'contact', 1650, 2, 4, 2),
-- Branch 3 (Patong)
(14, 'แว่นตา Gucci Classic Rectangular', 'Gucci Classic Rectangular Frame', 'GUC-101-B3', 'frame', 12500, 5, 3, 3),
(15, 'แว่นตา Ray-Ban Aviator Gold', 'Ray-Ban Aviator Gold Frame', 'RAY-202-B3', 'frame', 6800, 2, 5, 3),
(16, 'เลนส์ Hoya 1.60 Single Vision BlueControl', 'Hoya 1.60 Single Vision BlueControl Lens', 'HOY-301-B3', 'lens', 3500, 15, 5, 3),
(17, 'คอนแทคเลนส์ Acuvue Oasys 1-Day (30 ชิ้น)', 'Acuvue Oasys 1-Day Contact Lenses (30 Pack)', 'ACU-501-B3', 'contact', 1650, 12, 4, 3);

-- 6. Seed Orders
INSERT INTO orders (id, date, branch_id, total_amount, deposit_amount, payment_method, payment_details, status, customer_id, customer_name, staff_id) VALUES
(1, '2026-05-23 11:30:00', 1, 16000.0, 16000.0, 'Bank Transfer', '{"bank": 16000.0}', 'Paid', 1, 'Wichai Jaidee', 3),
(2, '2026-05-24 14:15:00', 1, 6800.0, 3000.0, 'Split (Cash + Credit Card)', '{"cash": 1000.0, "card": 2000.0}', 'Deposit', 2, 'Naree Rakdee', 3),
(3, '2026-05-25 10:00:00', 1, 1650.0, 1650.0, 'Cash', '{"cash": 1650.0}', 'Paid', 3, 'John Smith', 3),
(4, '2026-05-25 16:45:00', 2, 12500.0, 12500.0, 'Credit Card', '{"card": 12500.0}', 'Paid', 4, 'Kitti Sirichai', 4),
(5, '2026-05-26 12:20:00', 1, 9800.0, 9800.0, 'Bank Transfer', '{"bank": 9800.0}', 'Paid', 5, 'Rattana Aree', 1),
(6, '2026-05-27 15:30:00', 3, 21850.0, 21850.0, 'Credit Card', '{"card": 21850.0}', 'Paid', NULL, 'Walk-in Customer', 5),
(7, '2026-05-28 11:00:00', 1, 3500.0, 3500.0, 'Cash', '{"cash": 3500.0}', 'Paid', 1, 'Wichai Jaidee', 3),
(8, '2026-05-28 16:00:00', 2, 9500.0, 5000.0, 'Bank Transfer', '{"bank": 5000.0}', 'Deposit', 2, 'Naree Rakdee', 4),
(9, '2026-05-29 13:00:00', 1, 19300.0, 19300.0, 'Credit Card', '{"card": 19300.0}', 'Paid', 4, 'Kitti Sirichai', 1);

-- 7. Seed Order Items
INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES
(1, 1, 1, 1, 12500.0),
(2, 1, 3, 1, 3500.0),
(3, 2, 2, 1, 6800.0),
(4, 3, 5, 1, 1650.0),
(5, 4, 9, 1, 12500.0),
(6, 5, 8, 1, 9800.0),
(7, 6, 14, 1, 12500.0),
(8, 6, 15, 1, 6800.0),
(9, 6, 17, 1, 1650.0),
(10, 6, 17, 1, 900.0),
(11, 7, 3, 1, 3500.0),
(12, 8, 11, 2, 3500.0),
(13, 8, 13, 2, 1250.0),
(14, 9, 1, 1, 12500.0),
(15, 9, 2, 1, 6800.0);

-- 8. Seed Appointments
INSERT INTO appointments (id, customer_id, customer_name, date_time, type, notes, branch_id, staff_id, call_status) VALUES
(1, 1, 'Wichai Jaidee', '2026-05-25 10:00', 'eye_exam', 'นัดตรวจสายตาประจำปี (Annual Eye Check-up)', 1, 2, 'confirmed'),
(2, 2, 'Naree Rakdee', '2026-05-26 14:00', 'pickup', 'รับแว่นสายตาเลนส์กรองแสงสีฟ้า (Pick up BlueControl Glasses)', 1, 3, 'confirmed'),
(3, 3, 'John Smith', '2026-05-28 11:30', 'consultation', 'ปรึกษาอาการตาแห้งจากการใส่คอนแทคเลนส์ (Dry eye consultation)', 1, 2, 'pending'),
(4, 4, 'Kitti Sirichai', '2026-05-29 15:00', 'eye_exam', 'ตรวจค่าสายตายาวสูงอายุและเลือกเลนส์โปรเกรสซีฟ (Progressive lens exam)', 1, 2, 'no_answer'),
(5, 5, 'Rattana Aree', '2026-05-30 13:00', 'pickup', 'รับคอนแทคเลนส์สั่งพิเศษ (Pick up ordered contacts)', 1, 3, 'pending'),
(6, NULL, 'Somsri Mali', '2026-05-31 16:00', 'consultation', 'ขอลองกรอบแว่นตาแฟชั่นรุ่นใหม่ (Fitting new arrivals)', 1, 1, 'pending'),
(7, 3, 'John Smith', '2026-05-29 10:00', 'eye_exam', 'ตรวจซ้ำเพิ่มเติม (Follow up exam)', 3, 5, 'confirmed');

-- 9. Seed Lab Jobs
INSERT INTO lab_jobs (id, order_id, customer_name, details, status, updated_at) VALUES
(1, 1, 'Wichai Jaidee', 'กรอบ Gucci Classic + เลนส์ Hoya 1.60 BlueControl (ค่าสายตาสั้น OD -1.75 / OS -1.50)', 'completed', '2026-05-24 16:30'),
(2, 2, 'Naree Rakdee', 'กรอบ Ray-Ban Aviator + เลนส์ Essilor 1.56 Sapphire (ค่าสายตา: OD -3.00 / OS -2.75)', 'in_progress', '2026-05-28 09:00'),
(3, 8, 'Naree Rakdee', 'ฝนเลนส์ Hoya 1.60 (Branch 2)', 'pending', '2026-05-28 16:15'),
(4, 9, 'Kitti Sirichai', 'กรอบ Gucci + เลนส์โปรเกรสซีฟสั่งประกอบพิเศษ (ค่าสายตาสั้น/ยาว)', 'pending', '2026-05-29 13:10');

-- 10. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

-- 10B. Seed Role Permissions
INSERT OR REPLACE INTO role_permissions (role, permissions) VALUES
('admin', '{"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":true,"reports":true,"settings":true}'),
('optometrist', '{"dashboard":true,"customers":true,"inventory":false,"pos":false,"appointments":true,"users":false,"reports":false,"settings":false}'),
('receptionist', '{"dashboard":true,"customers":true,"inventory":true,"pos":true,"appointments":true,"users":false,"reports":false,"settings":false}');
