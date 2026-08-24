-- AlterTable
ALTER TABLE `inventory_count_items` ADD COLUMN `counted_good_qty` DECIMAL(15, 3) NOT NULL DEFAULT 0;
ALTER TABLE `inventory_count_items` ADD COLUMN `counted_damaged_qty` DECIMAL(15, 3) NOT NULL DEFAULT 0;

-- Backfill: الجردات السابقة قِيسَت كصالح بالكامل (لا تالف كان مفهوماً)
UPDATE `inventory_count_items` SET `counted_good_qty` = `counted_qty` WHERE `counted_qty` > 0;