-- AlterTable
ALTER TABLE `sale_invoices` ADD COLUMN `pay_type` VARCHAR(20) NULL,
    ADD COLUMN `banking_service` VARCHAR(100) NULL;
