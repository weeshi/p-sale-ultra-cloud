-- AlterTable
ALTER TABLE `items` ADD COLUMN `damaged_stock` DECIMAL(15, 3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `stock` ADD COLUMN `damaged_stock` DECIMAL(15, 3) NOT NULL DEFAULT 0;