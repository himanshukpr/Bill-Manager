#!/usr/bin/env python3
import openpyxl
import pymysql
import bcrypt
import uuid
from datetime import datetime

DB_CONFIG = {
    'host': 'localhost',
    'user': 'admin_gndairy2',
    'password': 'CDygKvqpgd8mS6taTCgH',
    'database': 'admin_gndairy2',
}

def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def gen_uuid():
    return str(uuid.uuid4())

def read_excel(filepath):
    wb = openpyxl.load_workbook(filepath)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    header = rows[0]
    data = []
    current_supplier = None
    current_shift = None

    for row in rows[1:]:
        if row[0] is None and row[1] is None and row[2] is None and row[3] is None:
            continue
        sr = row[0]
        house = str(row[1]).strip() if row[1] else ''
        shift = str(row[2]).strip() if row[2] else ''
        supplier = str(row[3]).strip() if row[3] else ''

        if supplier in ('Deliver by',):
            continue
        if shift in ('Shift',):
            continue

        if supplier and supplier not in ('Deliver by', 'None', ''):
            current_supplier = supplier
        if shift and shift not in ('Shift',):
            current_shift = shift

        sr_str = str(int(sr)) if isinstance(sr, (int, float)) and sr == int(sr) else str(sr).strip()
        if sr_str.isdigit() and house and not house.startswith('H no'):
            data.append({
                'sr': int(sr_str),
                'house': house,
                'shift': current_shift,
                'supplier': current_supplier,
            })

    return data

def main():
    data = read_excel('/tmp/GNK_H_NO.xlsx')
    print(f'Total houses to import: {len(data)}')

    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor()

    now = datetime.now()

    # 1. Insert standard product rates
    print('Inserting product rates...')
    products = [
        ('Cow Milk', 'L', 70.00),
        ('Buffalo Milk', 'L', 80.00),
        ('Dahi', 'Kg', 100.00),
        ('Paneer', 'Kg', 400.00),
        ('Makhan', 'Kg', 600.00),
        ('Cream', 'Kg', 440.00),
        ('Khoya', 'Kg', 500.00),
        ('Lassi', 'L', 30.00),
        ('Desi Ghee', 'Kg', 680.00),
        ('Cow Desi Ghee', 'Kg', 800.00),
        ('Rusk', 'Pcs.', 55.00),
        ('Fan', 'Pcs.', 50.00),
        ('Other', 'Rs.', 1.00),
        ('Bread', 'Rs.', 1.00),
    ]
    for name, unit, rate in products:
        try:
            cur.execute(
                "INSERT INTO product_rates (name, unit, rate, is_active, created_at, updated_at) VALUES (%s, %s, %s, 1, %s, %s)",
                (name, unit, rate, now, now)
            )
        except Exception as e:
            print(f'  Skipping product {name}: {e}')
    print(f'  Inserted {len(products)} products')

    # 2. Create supplier users
    suppliers = {}
    supplier_list = [
        ('RAHUL', 'rahul@gn.dairy'),
        ('HARI', 'hari@gn.dairy'),
        ('PAPPU', 'pappu@gn.dairy'),
    ]

    password_hash = hash_password('123123')
    default_permissions = '{"canEditItems":true,"canEditHouses":true,"canViewAllHouses":true}'

    for name, email in supplier_list:
        uid = gen_uuid()
        try:
            cur.execute(
                "INSERT INTO users (uuid, username, email, password, role, created_at, isVerified, permissions) VALUES (%s, %s, %s, %s, 'supplier', %s, 1, %s)",
                (uid, name, email, password_hash, now, default_permissions)
            )
            suppliers[name] = uid
            print(f'  Created user: {name} ({uid})')
        except Exception as e:
            print(f'  User {name} may already exist: {e}')
            # Fetch existing uuid
            cur.execute("SELECT uuid FROM users WHERE username = %s", (name,))
            row = cur.fetchone()
            if row:
                suppliers[name] = row[0]

    # 3. Import houses and create house_configs
    print('Importing houses...')
    for idx, item in enumerate(data, start=1):
        house_no = item['house']
        shift = item['shift'].lower()
        supplier_name = item['supplier']

        if supplier_name not in suppliers:
            print(f'  Warning: Supplier {supplier_name} not found, skipping house {house_no}')
            continue

        supplier_id = suppliers[supplier_name]

        # Insert house
        try:
            cur.execute(
                "INSERT INTO houses (house_no, active, created_at, updated_at) VALUES (%s, 1, %s, %s)",
                (house_no, now, now)
            )
            house_id = cur.lastrowid
        except Exception as e:
            print(f'  Error inserting house {house_no}: {e}')
            continue

        # Insert house_config
        try:
            cur.execute(
                "INSERT INTO house_configs (shift, supplier_id, position, house_id, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (shift, supplier_id, idx, house_id, now, now)
            )
        except Exception as e:
            print(f'  Error inserting house_config for {house_no}: {e}')

        if idx % 20 == 0:
            print(f'  Progress: {idx}/{len(data)}')

    conn.commit()
    print(f'Imported {len(data)} houses successfully')

    # Verify
    cur.execute("SELECT COUNT(*) FROM houses")
    h_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM users")
    u_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM house_configs")
    hc_count = cur.fetchone()[0]

    print(f'\nSummary:')
    print(f'  Users: {u_count}')
    print(f'  Houses: {h_count}')
    print(f'  House Configs: {hc_count}')

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
