-- CreateTable
CREATE TABLE `bank_reconciliations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `treasury_id` INTEGER NOT NULL,
    `recon_number` VARCHAR(50) NOT NULL,
    `statement_date` DATETIME(3) NOT NULL,
    `opening_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `statement_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `system_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `difference` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `bank_reconciliations_treasury_id_idx`(`treasury_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_reconciliation_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reconciliation_id` INTEGER NOT NULL,
    `receipt_id` INTEGER NOT NULL,
    `is_matched` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bank_reconciliation_lines_receipt_id_idx`(`receipt_id`),
    UNIQUE INDEX `bank_reconciliation_lines_reconciliation_id_receipt_id_key`(`reconciliation_id`, `receipt_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bank_reconciliations` ADD CONSTRAINT `bank_reconciliations_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliations` ADD CONSTRAINT `bank_reconciliations_treasury_id_fkey` FOREIGN KEY (`treasury_id`) REFERENCES `treasuries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_lines` ADD CONSTRAINT `bank_reconciliation_lines_reconciliation_id_fkey` FOREIGN KEY (`reconciliation_id`) REFERENCES `bank_reconciliations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_lines` ADD CONSTRAINT `bank_reconciliation_lines_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
