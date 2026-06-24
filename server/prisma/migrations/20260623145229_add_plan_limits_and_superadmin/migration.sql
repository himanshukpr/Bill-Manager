-- AlterTable
ALTER TABLE `dairies` ADD COLUMN `max_houses` INTEGER NULL,
    ADD COLUMN `plan_expiry` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `is_super_admin` BOOLEAN NOT NULL DEFAULT false;
