-- Drop the existing foreign key constraint
ALTER TABLE delivery_logs DROP CONSTRAINT IF EXISTS delivery_logs_supplier_id_fkey;

-- Recreate the foreign key to allow NULL values
ALTER TABLE delivery_logs 
ADD CONSTRAINT delivery_logs_supplier_id_fkey 
FOREIGN KEY (supplier_id) REFERENCES users(uuid) ON DELETE CASCADE;