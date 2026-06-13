-- AlterTable
ALTER TABLE `payment_history` ADD COLUMN `paid_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `users` ADD COLUMN `permissions` JSON NOT NULL;
