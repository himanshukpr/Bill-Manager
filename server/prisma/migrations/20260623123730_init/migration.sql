-- CreateTable
CREATE TABLE `dairies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `address` TEXT NULL,
    `ownerName` VARCHAR(200) NOT NULL DEFAULT '',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dairies_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `uuid` VARCHAR(191) NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'supplier') NOT NULL DEFAULT 'supplier',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `permissions` JSON NOT NULL,
    `dairyId` INTEGER NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_dairyId_idx`(`dairyId`),
    UNIQUE INDEX `users_dairyId_username_key`(`dairyId`, `username`),
    PRIMARY KEY (`uuid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `houses` (
    `house_no` VARCHAR(191) NOT NULL,
    `area` VARCHAR(191) NULL,
    `phone_no` VARCHAR(191) NULL,
    `alternative_phone` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `rate1_type` VARCHAR(191) NULL,
    `rate1` DECIMAL(10, 2) NULL,
    `rate2_type` VARCHAR(191) NULL,
    `rate2` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `location` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dairyId` INTEGER NOT NULL,

    INDEX `houses_dairyId_idx`(`dairyId`),
    UNIQUE INDEX `houses_dairyId_house_no_key`(`dairyId`, `house_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `house_configs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shift` ENUM('morning', 'evening', 'shop') NOT NULL,
    `supplier_id` VARCHAR(191) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `daily_alerts` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `house_id` INTEGER NOT NULL,
    `dairyId` INTEGER NOT NULL,

    UNIQUE INDEX `house_configs_house_id_key`(`house_id`),
    INDEX `house_configs_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `house_balances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `previous_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `current_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,
    `house_id` INTEGER NOT NULL,
    `dairyId` INTEGER NOT NULL,

    UNIQUE INDEX `house_balances_house_id_key`(`house_id`),
    INDEX `house_balances_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `balance_ref` INTEGER NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `note` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paid_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `bill_ids` JSON NULL,
    `dairyId` INTEGER NOT NULL,

    INDEX `payment_history_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bills` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `from_date` DATETIME(3) NULL,
    `to_date` DATETIME(3) NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `items` JSON NOT NULL,
    `previous_balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `generated_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(191) NULL,
    `house_id` INTEGER NOT NULL,
    `outstanding_amount` DECIMAL(10, 2) NULL,
    `dairyId` INTEGER NOT NULL,

    INDEX `bills_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bill_notes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bill_id` INTEGER NOT NULL,
    `note` JSON NOT NULL,
    `house_no` VARCHAR(191) NULL,
    `dairyId` INTEGER NOT NULL,

    INDEX `bill_notes_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'L',
    `rate` DECIMAL(10, 2) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `dairyId` INTEGER NOT NULL,

    INDEX `product_rates_dairyId_idx`(`dairyId`),
    UNIQUE INDEX `product_rates_dairyId_name_key`(`dairyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_id` VARCHAR(191) NULL,
    `shift` ENUM('morning', 'evening', 'shop') NOT NULL,
    `items` JSON NOT NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `opening_balance` DECIMAL(10, 2) NOT NULL,
    `closing_balance` DECIMAL(10, 2) NOT NULL,
    `note` VARCHAR(191) NULL,
    `delivered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `bill_generated` BOOLEAN NOT NULL DEFAULT false,
    `is_closed_log` BOOLEAN NOT NULL DEFAULT false,
    `house_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dairyId` INTEGER NOT NULL,

    INDEX `delivery_logs_house_id_delivered_at_idx`(`house_id`, `delivered_at`),
    INDEX `delivery_logs_supplier_id_delivered_at_idx`(`supplier_id`, `delivered_at`),
    INDEX `delivery_logs_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `supplier_id` VARCHAR(191) NOT NULL,
    `product_name` VARCHAR(191) NOT NULL,
    `quantity_per_go` DECIMAL(10, 2) NOT NULL,
    `number_of_goes` INTEGER NOT NULL,
    `total_quantity` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dairyId` INTEGER NOT NULL,

    INDEX `delivery_plans_supplier_id_created_at_idx`(`supplier_id`, `created_at`),
    INDEX `delivery_plans_dairyId_idx`(`dairyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `houses` ADD CONSTRAINT `houses_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `house_configs` ADD CONSTRAINT `house_configs_house_id_fkey` FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `house_configs` ADD CONSTRAINT `house_configs_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`uuid`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `house_configs` ADD CONSTRAINT `house_configs_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `house_balances` ADD CONSTRAINT `house_balances_house_id_fkey` FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `house_balances` ADD CONSTRAINT `house_balances_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_history` ADD CONSTRAINT `payment_history_balance_ref_fkey` FOREIGN KEY (`balance_ref`) REFERENCES `house_balances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_history` ADD CONSTRAINT `payment_history_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bills` ADD CONSTRAINT `bills_house_id_fkey` FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bills` ADD CONSTRAINT `bills_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_notes` ADD CONSTRAINT `bill_notes_bill_id_fkey` FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bill_notes` ADD CONSTRAINT `bill_notes_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_rates` ADD CONSTRAINT `product_rates_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_logs` ADD CONSTRAINT `delivery_logs_house_id_fkey` FOREIGN KEY (`house_id`) REFERENCES `houses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_logs` ADD CONSTRAINT `delivery_logs_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`uuid`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `delivery_logs` ADD CONSTRAINT `delivery_logs_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_plans` ADD CONSTRAINT `delivery_plans_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `users`(`uuid`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `delivery_plans` ADD CONSTRAINT `delivery_plans_dairyId_fkey` FOREIGN KEY (`dairyId`) REFERENCES `dairies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
