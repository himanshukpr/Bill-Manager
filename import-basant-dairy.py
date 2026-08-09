import mysql.connector
import pandas as pd
import uuid
from datetime import datetime

conn = mysql.connector.connect(
    host='localhost',
    port=3306,
    user='admin_dairy_vyapar',
    password='QN3ZFcsjCtEKxB7UdRh9',
    database='admin_dairy_vyapar'
)
cursor = conn.cursor()

xls = pd.ExcelFile('/tmp/basant-dairy.xlsx')
df = pd.read_excel(xls, sheet_name='Sheet1')

data_rows = df.iloc[1:]

houses = []
products = []
for _, row in data_rows.iterrows():
    h_no = row.get('Unnamed: 1')
    if pd.notna(h_no) and str(h_no).strip():
        shift = row.get('Unnamed: 3')
        if pd.notna(shift) and str(shift).strip():
            houses.append({
                'house_no': str(h_no).strip(),
                'phone': str(row.get('Unnamed: 2') or '').strip(),
                'shift': str(shift).strip().upper(),
                'deliver_by': str(row.get('Unnamed: 4') or '').strip().upper(),
            })

    prod_name = row.get('Unnamed: 9')
    if pd.notna(prod_name) and str(prod_name).strip():
        products.append({
            'name': str(prod_name).strip(),
            'unit': str(row.get('Unnamed: 10') or '').strip(),
            'rate': float(row.get('Unnamed: 11') or 0),
        })

print(f"Found {len(houses)} houses, {len(products)} products")

cursor.execute("SELECT id FROM dairies WHERE name = %s", ('Bansant Dairy',))
existing = cursor.fetchone()
if existing:
    dairy_id = existing[0]
    print(f"Bansant Dairy already exists with id={dairy_id}")
else:
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
    cursor.execute("INSERT INTO dairies (name, email, phone, address, ownerName, isActive, plan_expiry, max_houses, created_at, updated_at, settings) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        ('Bansant Dairy', 'bansant@dairyvyapar.com', None, None, 'Parvesh Singh', 1, None, None, now, now, '{}'))
    dairy_id = cursor.lastrowid
    print(f"Created dairy Bansant Dairy with id={dairy_id}")

now = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]

cursor.execute("SELECT uuid FROM users WHERE username = 'parvesh.singh' AND dairyId = %s", (dairy_id,))
if not cursor.fetchone():
    cursor.execute("INSERT INTO users (uuid, username, email, password, role, dairyId, created_at, isVerified, permissions) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (str(uuid.uuid4()), 'parvesh.singh', 'parvesh@dairyvyapar.com', '$2a$10$dummyhashforadminuser1234567890', 'admin', dairy_id, now, 0, '{}'))
    print(f"Created admin user PARVESH SINGH")
else:
    print(f"Admin user PARVESH SINGH already exists")

cursor.execute("SELECT uuid FROM users WHERE username = 'supply' AND dairyId = %s", (dairy_id,))
if not cursor.fetchone():
    cursor.execute("INSERT INTO users (uuid, username, email, password, role, dairyId, created_at, isVerified, permissions) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (str(uuid.uuid4()), 'supply', 'supply@dairyvyapar.com', '$2a$10$dummyhashforsupplyuser1234567890', 'supplier', dairy_id, now, 0, '{}'))
    print(f"Created supply user SUPPLY")
else:
    print(f"Supply user SUPPLY already exists")

product_rate_ids = {}
for prod in products:
    cursor.execute("SELECT id FROM product_rates WHERE name = %s AND dairyId = %s", (prod['name'], dairy_id))
    existing_prod = cursor.fetchone()
    if existing_prod:
        product_rate_ids[prod['name']] = existing_prod[0]
    else:
        cursor.execute("INSERT INTO product_rates (name, unit, rate, dairyId, is_active, sort_order, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (prod['name'], prod['unit'], prod['rate'], dairy_id, 1, 0, now, now))
        product_rate_ids[prod['name']] = cursor.lastrowid
        print(f"  Product rate: {prod['name']} -> id={cursor.lastrowid}")

conn.commit()
print(f"\nProducts done. Creating houses, configs, and balances...")

cursor.execute("SELECT uuid FROM users WHERE username = 'supply' AND dairyId = %s", (dairy_id,))
supply_row = cursor.fetchone()
supply_uuid = supply_row[0] if supply_row else None

for i, h in enumerate(houses):
    house_no = h['house_no']
    phone = h['phone'] if h['phone'] else None
    shift = h['shift'].lower()
    deliver_by = h['deliver_by']

    supplier_id = supply_uuid if supply_uuid else deliver_by

    cursor.execute("INSERT INTO houses (house_no, phone_no, dairyId, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
        (house_no, phone, dairy_id, now, now))
    house_id = cursor.lastrowid

    cursor.execute("INSERT INTO house_configs (house_id, dairyId, shift, supplier_id, created_at, updated_at) VALUES (%s, %s, %s, %s, %s, %s)",
        (house_id, dairy_id, shift, supplier_id, now, now))

    cursor.execute("INSERT INTO house_balances (house_id, dairyId, previous_balance, current_balance, updated_at) VALUES (%s, %s, %s, %s, %s)",
        (house_id, dairy_id, 0.00, 0.00, now))

    if (i + 1) % 20 == 0:
        print(f"  Created {i + 1} houses...")

conn.commit()
print(f"\nAll done! Created {len(houses)} houses with configs and balances.")

cursor.close()
conn.close()