-- AlterTable
ALTER TABLE `branches` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Backfill: updated_at = created_at للسجلات الموجودة
UPDATE `branches` SET `updated_at` = `created_at`;

-- AlterTable
ALTER TABLE `warehouses` ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Backfill: updated_at = created_at للسجلات الموجودة
UPDATE `warehouses` SET `updated_at` = `created_at`;