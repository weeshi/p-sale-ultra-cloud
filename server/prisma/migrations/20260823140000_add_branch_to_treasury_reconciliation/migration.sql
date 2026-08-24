-- Migration: add_branch_to_treasury_reconciliation
-- Date: 2026-08-23
-- Adds branch_id to treasuries and bank_reconciliations for branch-level isolation

-- 1. Add branch_id to treasuries
ALTER TABLE `treasuries` ADD COLUMN `branch_id` INT NULL;
ALTER TABLE `treasuries` ADD COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE `treasuries` ADD INDEX `idx_treasury_branch` (`branch_id`);

-- Backfill: existing treasury (id=1, الصندوق الرئيسي) → Company Main branch (id=3)
UPDATE `treasuries` SET `branch_id` = 3 WHERE `id` = 1;

-- 2. Add branch_id to bank_reconciliations
ALTER TABLE `bank_reconciliations` ADD COLUMN `branch_id` INT NULL;
ALTER TABLE `bank_reconciliations` ADD INDEX `idx_recon_branch` (`branch_id`);
