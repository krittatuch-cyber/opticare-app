import json
import sqlite3
from database import get_db, init_db
from datetime import datetime, timedelta

def seed_data():
    import os
    from database import DB_PATH
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print("Old database deleted for clean recreation.")
        except Exception as e:
            print("Could not delete DB file:", e)
            
    # First, make sure tables exist
    init_db()

    conn = get_db()
    cursor = conn.cursor()

    # Clear existing data to allow fresh seeds
    cursor.execute("DELETE FROM lab_jobs;")
    cursor.execute("DELETE FROM appointments;")
    cursor.execute("DELETE FROM order_items;")
    cursor.execute("DELETE FROM orders;")
    cursor.execute("DELETE FROM inventory;")
    cursor.execute("DELETE FROM prescriptions;")
    cursor.execute("DELETE FROM customers;")
    cursor.execute("DELETE FROM users;")
    cursor.execute("DELETE FROM branches;")
    cursor.execute("DELETE FROM product_categories;")

    # Reset auto-increment
    cursor.execute("DELETE FROM sqlite_sequence;")

    # 0. Seed Product Categories
    categories = [
        ("frame", "กรอบแว่นตา", "Frames"),
        ("lens", "เลนส์สายตา", "Optical Lenses"),
        ("contact", "คอนแทคเลนส์", "Contact Lenses")
    ]
    cursor.executemany("INSERT INTO product_categories (key, name_th, name_en) VALUES (?, ?, ?);", categories)

    # 1. Seed Branches
    branches = [
        ("กรุงเทพฯ - สยาม", "Bangkok - Siam"),
        ("เชียงใหม่ - นิมมาน", "Chiang Mai - Nimman"),
        ("ภูเก็ต - ป่าตอง", "Phuket - Patong")
    ]
    cursor.executemany("INSERT INTO branches (name_th, name_en) VALUES (?, ?);", branches)
    conn.commit()

    # 2. Seed Users & Permissions
    admin_perms = json.dumps({
        "dashboard": True, "customers": True, "inventory": True,
        "pos": True, "appointments": True, "users": True, "reports": True
    })
    optom_perms = json.dumps({
        "dashboard": True, "customers": True, "inventory": False,
        "pos": False, "appointments": True, "users": False, "reports": False
    })
    recep_perms = json.dumps({
        "dashboard": True, "customers": True, "inventory": True,
        "pos": True, "appointments": True, "users": False, "reports": False
    })

    users = [
        ("Somchai", "somchai@opticare.com", "admin", admin_perms, 1),
        ("Dr. Naphat", "naphat@opticare.com", "optometrist", optom_perms, 1),
        ("Kanya", "kanya@opticare.com", "receptionist", recep_perms, 1),
        ("Siri", "siri@opticare.com", "receptionist", recep_perms, 2),
        ("Dr. Wittaya", "wittaya@opticare.com", "optometrist", optom_perms, 3)
    ]
    cursor.executemany("INSERT INTO users (username, email, role, permissions, branch_id) VALUES (?, ?, ?, ?, ?);", users)

    # 3. Seed Customers (Checkup due around late May / June 2026 since current date is 2026-05-29)
    customers = [
        ("วิชัย", "ใจดี", "Wichai", "Jaidee", "081-234-5678", "wichai@gmail.com", "1985-04-12", "2025-05-20", "2026-05-20", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150", "ชาย", "456 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"), # overdue checkup
        ("นารี", "รักดี", "Naree", "Rakdee", "089-876-5432", "naree@outlook.com", "1992-09-24", "2025-06-01", "2026-06-01", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150", "หญิง", "789 ถนนนิมมานเหมินท์ ต.สุเทพ อ.เมือง เชียงใหม่ 50200"), # due soon
        ("จอห์น", "สมิธ", "John", "Smith", "082-111-2222", "john.smith@yahoo.com", "1978-11-05", "2026-01-15", "2027-01-15", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=150", "ชาย", "12/3 ถนนหาดป่าตอง อ.กะทู้ ภูเก็ต 83150"), # not due
        ("กิตติ", "ศิริชัย", "Kitti", "Sirichai", "086-555-7788", "kitti@live.com", "1965-03-30", "2025-05-15", "2026-05-15", "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=150", "ชาย", "55/9 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพฯ 10310"), # overdue checkup
        ("รัตนา", "อารีย์", "Rattana", "Aree", "084-999-0000", "rattana@gmail.com", "1998-07-18", "2026-04-20", "2027-04-20", "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=150", "หญิง", "88 ถนนพหลโยธิน แขวงจตุจักร เขตจตุจักร กรุงเทพฯ 10900") # not due
    ]
    cursor.executemany("""
    INSERT INTO customers (first_name_th, last_name_th, first_name_en, last_name_en, phone, email, dob, last_visit, checkup_due_date, photo, gender, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, customers)
    conn.commit()

    # 4. Seed Prescriptions (OD/OS) for some customers
    prescriptions = [
        # Wichai - 2 visits
        (1, "2024-05-18", "Dr. Naphat", -1.50, -0.50, 90, 1.00, "6/6", -1.25, -0.75, 85, 1.00, "6/6", "สายตาคงที่ปกติ", "ความดันโลหิตสูง (Hypertension)", "แว่นเก่าตัดจากร้านเดิมเมื่อปี 2566 สั้น -1.25 / -1.00"),
        (1, "2025-05-20", "Dr. Naphat", -1.75, -0.50, 90, 1.25, "6/5", -1.50, -0.75, 85, 1.25, "6/6", "สั้นเพิ่มขึ้นเล็กน้อย แนะนำเลนส์กรองแสงคอมพิวเตอร์", "ความดันโลหิตสูง (Hypertension)", "แว่นเก่า OD -1.50 / OS -1.25"),
        # Naree - 1 visit
        (2, "2025-06-01", "Dr. Naphat", -3.00, None, None, None, "6/6", -2.75, -0.25, 180, None, "6/6", "คนไข้บ่นว่าปวดหัวเวลามองคอมพิวเตอร์นานๆ", "โรคภูมิแพ้ฝุ่นละออง (Dust Allergy)", "แว่นเก่า OD -2.50 / OS -2.25"),
        # John - 1 visit
        (3, "2026-01-15", "Dr. Wittaya", 1.25, -1.00, 45, 2.00, "6/9", 1.50, -1.25, 135, 2.00, "6/9", "ค่าสายตายาวเริ่มคงที่ มีค่าเอียงเล็กน้อย", "ไม่มีโรคประจำตัว", "ไม่มีแว่นเดิม ใช้แว่นสำเร็จรูปตามท้องตลาด"),
        # Kitti - 2 visits
        (4, "2024-05-10", "Dr. Wittaya", -4.25, -1.50, 10, 1.75, "6/6", -4.00, -1.75, 175, 1.75, "6/6", "มีอาการแพ้แสงเวลาออกแดด แนะนำเลนส์เปลี่ยนสีอัตโนมัติ", "โรคเบาหวาน (Diabetes)", "แว่นเก่า OD -4.00 / OS -3.75"),
        (4, "2025-05-15", "Dr. Wittaya", -4.50, -1.50, 12, 2.00, "6/6", -4.25, -2.00, 170, 2.00, "6/6", "ค่าสายตาสั้นสูง แนะนำเลนส์ย่อบาง 1.60 Crizal", "โรคเบาหวาน (Diabetes)", "แว่นเก่า OD -4.25 / OS -4.00")
    ]
    cursor.executemany("""
    INSERT INTO prescriptions (
        customer_id, date, recorded_by,
        od_sph, od_cyl, od_axis, od_add, od_va,
        os_sph, os_cyl, os_axis, os_add, os_va,
        notes, medical_history, previous_glasses
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, prescriptions)

    # 5. Seed Inventory (Products) - seeded for all 3 branches
    # Branch 1 (Siam): 1 to 10
    # Branch 2 (Nimman): 11 to 20
    # Branch 3 (Patong): 21 to 30
    products = [
        # Branch 1 (Siam)
        ("แว่นตา Gucci Classic Rectangular", "Gucci Classic Rectangular Frame", "GUC-101", "frame", 12500, 10, 3, 1, "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?q=80&w=300", "กรอบแว่นตา Gucci ทรงสี่เหลี่ยมสุดคลาสสิก หรูหรา แข็งแรงและเบาสบายหู"),
        ("แว่นตา Ray-Ban Aviator Gold", "Ray-Ban Aviator Gold Frame", "RAY-202", "frame", 6800, 3, 5, 1, "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=300", "แว่นตากันแดดทรงนักบินสีทองในตำนานสุดคลาสสิก RAY-BAN เหมาะสำหรับทุกสัดส่วนใบหน้า"), # low stock
        ("เลนส์ Hoya 1.60 Single Vision BlueControl", "Hoya 1.60 Single Vision BlueControl Lens", "HOY-301", "lens", 3500, 20, 5, 1, "https://images.unsplash.com/photo-1508296695146-257a814070b4?q=80&w=300", "เลนส์สายตา Hoya สัญชาติญี่ปุ่น กรองแสงสีฟ้าจากหน้าจอมือถือและคอมพิวเตอร์อย่างมีประสิทธิภาพ"),
        ("เลนส์ Essilor Crizal Sapphire 1.56", "Essilor Crizal Sapphire 1.56 Lens", "ESS-401", "lens", 2800, 2, 5, 1, "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=300", "เลนส์ Essilor Crizal สัญชาติฝรั่งเศส ตัดแสงสะท้อนรอบทิศทาง คมชัดและเคลือบสารป้องกันรอยขีดข่วน"), # low stock
        ("คอนแทคเลนส์ Acuvue Oasys 1-Day (30 ชิ้น)", "Acuvue Oasys 1-Day Contact Lenses (30 Pack)", "ACU-501", "contact", 1650, 15, 4, 1, "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?q=80&w=300", "คอนแทคเลนส์รายวัน Acuvue มอบความชุ่มชื้นสูง ป้องกันรังสี UV สบายตารับวันทำงาน"),
        ("คอนแทคเลนส์ Bausch & Lomb Ultra (6 ชิ้น)", "Bausch & Lomb Ultra Contact Lenses (6 Pack)", "BAU-601", "contact", 950, 8, 3, 1, "https://images.unsplash.com/photo-1590156221122-c413d948e513?q=80&w=300", "คอนแทคเลนส์รายเดือน Bausch & Lomb ออกแบบให้กักเก็บความชุ่มชื้นยาวนาน 16 ชั่วโมง เหมาะสำหรับผู้ใช้คอมพิวเตอร์"),
        ("แว่นตา Oakley Holbrook Sport", "Oakley Holbrook Sport Frame", "OAK-701", "frame", 5400, 12, 3, 1, "https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=300", "แว่นตากีฬา Oakley Holbrook ขาแว่นเทคโนโลยีกันลื่น ทนทานและยืดหยุ่นสูง"),
        ("เลนส์ Zeiss Progressive Classic 1.5", "Zeiss Progressive Classic 1.5 Lens", "ZEI-801", "lens", 9800, 6, 2, 1, "https://images.unsplash.com/photo-1473968512647-3e447244af8f?q=80&w=300", "เลนส์โปรเกรสซีฟพรีเมียมจากเยอรมนี Zeiss มองชัดทุกระยะแบบไร้รอยต่อ ปรับตัวง่าย"),
        
        # Branch 2 (Nimman)
        ("แว่นตา Gucci Classic Rectangular", "Gucci Classic Rectangular Frame", "GUC-101-B2", "frame", 12500, 4, 3, 2, "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?q=80&w=300", "กรอบแว่นตา Gucci ทรงสี่เหลี่ยมสุดคลาสสิก"),
        ("แว่นตา Ray-Ban Aviator Gold", "Ray-Ban Aviator Gold Frame", "RAY-202-B2", "frame", 6800, 8, 5, 2, "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=300", "แว่นตากันแดดทรงนักบินสีทองในตำนานสุดคลาสสิก RAY-BAN"),
        ("เลนส์ Hoya 1.60 Single Vision BlueControl", "Hoya 1.60 Single Vision BlueControl Lens", "HOY-301-B2", "lens", 3500, 12, 5, 2, "https://images.unsplash.com/photo-1508296695146-257a814070b4?q=80&w=300", "เลนส์สายตา Hoya สัญชาติญี่ปุ่น กรองแสงสีฟ้า"),
        ("เลนส์ Essilor Crizal Sapphire 1.56", "Essilor Crizal Sapphire 1.56 Lens", "ESS-401-B2", "lens", 2800, 1, 5, 2, "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=300", "เลนส์ Essilor Crizal สัญชาติฝรั่งเศส ตัดแสงสะท้อน"), # low stock
        ("คอนแทคเลนส์ Acuvue Oasys 1-Day (30 ชิ้น)", "Acuvue Oasys 1-Day Contact Lenses (30 Pack)", "ACU-501-B2", "contact", 1650, 2, 4, 2, "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?q=80&w=300", "คอนแทคเลนส์รายวัน Acuvue มอบความชุ่มชื้นสูง"), # low stock
        
        # Branch 3 (Patong)
        ("แว่นตา Gucci Classic Rectangular", "Gucci Classic Rectangular Frame", "GUC-101-B3", "frame", 12500, 5, 3, 3, "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?q=80&w=300", "กรอบแว่นตา Gucci ทรงสี่เหลี่ยมสุดคลาสสิก"),
        ("แว่นตา Ray-Ban Aviator Gold", "Ray-Ban Aviator Gold Frame", "RAY-202-B3", "frame", 6800, 2, 5, 3, "https://images.unsplash.com/photo-1511499767150-a48a237f0083?q=80&w=300", "แว่นตากันแดดทรงนักบินสีทองในตำนานสุดคลาสสิก RAY-BAN"), # low stock
        ("เลนส์ Hoya 1.60 Single Vision BlueControl", "Hoya 1.60 Single Vision BlueControl Lens", "HOY-301-B3", "lens", 3500, 15, 5, 3, "https://images.unsplash.com/photo-1508296695146-257a814070b4?q=80&w=300", "เลนส์สายตา Hoya สัญชาติญี่ปุ่น กรองแสงสีฟ้า"),
        ("คอนแทคเลนส์ Acuvue Oasys 1-Day (30 ชิ้น)", "Acuvue Oasys 1-Day Contact Lenses (30 Pack)", "ACU-501-B3", "contact", 1650, 12, 4, 3, "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?q=80&w=300", "คอนแทคเลนส์รายวัน Acuvue มอบความชุ่มชื้นสูง")
    ]
    cursor.executemany("""
    INSERT INTO inventory (name_th, name_en, barcode, category, price, stock, min_stock, branch_id, image, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, products)
    conn.commit()

    # 6. Seed Orders & Order Items
    # We want a 7-day revenue trend up to today (May 29, 2026)
    # 2026-05-23 to 2026-05-29
    orders = [
        # Date, Branch_id, Total, Deposit, Payment Method, Payment Details JSON, Status, Customer ID, Customer Name
        ("2026-05-23 11:30:00", 1, 16000.0, 16000.0, "Bank Transfer", json.dumps({"bank": 16000.0}), "Paid", 1, "Wichai Jaidee"),
        ("2026-05-24 14:15:00", 1, 6800.0, 3000.0, "Split (Cash + Credit Card)", json.dumps({"cash": 1000.0, "card": 2000.0}), "Deposit", 2, "Naree Rakdee"), # deposit order
        ("2026-05-25 10:00:00", 1, 1650.0, 1650.0, "Cash", json.dumps({"cash": 1650.0}), "Paid", 3, "John Smith"),
        ("2026-05-25 16:45:00", 2, 12500.0, 12500.0, "Credit Card", json.dumps({"card": 12500.0}), "Paid", 4, "Kitti Sirichai"),
        ("2026-05-26 12:20:00", 1, 9800.0, 9800.0, "Bank Transfer", json.dumps({"bank": 9800.0}), "Paid", 5, "Rattana Aree"),
        ("2026-05-27 15:30:00", 3, 21850.0, 21850.0, "Credit Card", json.dumps({"card": 21850.0}), "Paid", None, "Walk-in Customer"),
        ("2026-05-28 11:00:00", 1, 3500.0, 3500.0, "Cash", json.dumps({"cash": 3500.0}), "Paid", 1, "Wichai Jaidee"),
        ("2026-05-28 16:00:00", 2, 9500.0, 5000.0, "Bank Transfer", json.dumps({"bank": 5000.0}), "Deposit", 2, "Naree Rakdee"), # deposit order
        ("2026-05-29 13:00:00", 1, 19300.0, 19300.0, "Credit Card", json.dumps({"card": 19300.0}), "Paid", 4, "Kitti Sirichai") # Today's sale
    ]
    
    for o in orders:
        cursor.execute("""
        INSERT INTO orders (date, branch_id, total_amount, deposit_amount, payment_method, payment_details, status, customer_id, customer_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, o)
    conn.commit()

    # Order Items (matching order IDs: 1 to 9)
    order_items = [
        (1, 1, 1, 12500.0), # Gucci Frame
        (1, 3, 1, 3500.0),  # Hoya Lens
        (2, 2, 1, 6800.0),  # Ray-Ban
        (3, 5, 1, 1650.0),  # Acuvue Contact
        (4, 9, 1, 12500.0), # Gucci (Branch 2)
        (5, 8, 1, 9800.0),  # Zeiss Lens
        (6, 14, 1, 12500.0),# Gucci (Branch 3)
        (6, 15, 1, 6800.0), # Ray-Ban (Branch 3)
        (6, 17, 1, 1650.0), # Acuvue (Branch 3)
        (6, 17, 1, 900.0),  # extra
        (7, 3, 1, 3500.0),  # Hoya Lens
        (8, 11, 2, 3500.0), # Hoya Lens (Branch 2)
        (8, 13, 2, 1250.0), # Contact (Branch 2)
        (9, 1, 1, 12500.0), # Gucci
        (9, 2, 1, 6800.0)   # Ray-Ban
    ]
    cursor.executemany("""
    INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES (?, ?, ?, ?);
    """, order_items)
    conn.commit()

    # 7. Seed Appointments (Weekly: late May 2026)
    # Mon 25th to Sun 31st May 2026 (relative to Fri May 29, 2026)
    appointments = [
        # Customer ID, Customer Name, DateTime, Type, Notes, Branch ID, Staff ID, Call Status
        (1, "Wichai Jaidee", "2026-05-25 10:00", "eye_exam", "นัดตรวจสายตาประจำปี (Annual Eye Check-up)", 1, 2, "confirmed"),
        (2, "Naree Rakdee", "2026-05-26 14:00", "pickup", "รับแว่นสายตาเลนส์กรองแสงสีฟ้า (Pick up BlueControl Glasses)", 1, 3, "confirmed"),
        (3, "John Smith", "2026-05-28 11:30", "consultation", "ปรึกษาอาการตาแห้งจากการใส่คอนแทคเลนส์ (Dry eye consultation)", 1, 2, "pending"),
        (4, "Kitti Sirichai", "2026-05-29 15:00", "eye_exam", "ตรวจค่าสายตายาวสูงอายุและเลือกเลนส์โปรเกรสซีฟ (Progressive lens exam)", 1, 2, "no_answer"), # Today
        (5, "Rattana Aree", "2026-05-30 13:00", "pickup", "รับคอนแทคเลนส์สั่งพิเศษ (Pick up ordered contacts)", 1, 3, "pending"), # Tomorrow
        (None, "Somsri Mali", "2026-05-31 16:00", "consultation", "ขอลองกรอบแว่นตาแฟชั่นรุ่นใหม่ (Fitting new arrivals)", 1, 1, "pending"), # Sunday
        (3, "John Smith", "2026-05-29 10:00", "eye_exam", "ตรวจซ้ำเพิ่มเติม (Follow up exam)", 3, 5, "confirmed") # Today at Patong branch
    ]
    cursor.executemany("""
    INSERT INTO appointments (customer_id, customer_name, date_time, type, notes, branch_id, staff_id, call_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, appointments)
    conn.commit()

    # 8. Seed Lab Jobs
    # Order ID 1, 2, 8, 9
    lab_jobs = [
        # Order ID, Customer Name, Details, Status, Updated At
        (1, "Wichai Jaidee", "กรอบ Gucci Classic + เลนส์ Hoya 1.60 BlueControl (ค่าสายตาสั้น OD -1.75 / OS -1.50)", "completed", "2026-05-24 16:30"),
        (2, "Naree Rakdee", "กรอบ Ray-Ban Aviator + เลนส์ Essilor 1.56 Sapphire (ค่าสายตา: OD -3.00 / OS -2.75)", "in_progress", "2026-05-28 09:00"),
        (8, "Naree Rakdee", "ฝนเลนส์ Hoya 1.60 (Branch 2)", "pending", "2026-05-28 16:15"),
        (9, "Kitti Sirichai", "กรอบ Gucci + เลนส์โปรเกรสซีฟสั่งประกอบพิเศษ (ค่าสายตาสั้น/ยาว)", "pending", "2026-05-29 13:10")
    ]
    cursor.executemany("""
    INSERT INTO lab_jobs (order_id, customer_name, details, status, updated_at)
    VALUES (?, ?, ?, ?, ?);
    """, lab_jobs)
    conn.commit()

    conn.close()
    print("Database seeded with high-quality bilingual mock data successfully!")

if __name__ == "__main__":
    seed_data()
