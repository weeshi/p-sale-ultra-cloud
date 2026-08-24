-- AlterTable: Add branchId to PurchaseInvoice and PurchaseOrder
ALTER TABLE `purchase_invoices` ADD COLUMN `branch_id` INT NULL;
ALTER TABLE `purchase_orders` ADD COLUMN `branch_id` INT NULL;

-- Add foreign keys
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill branchId from warehouse for existing records
UPDATE `purchase_invoices` pi
  INNER JOIN `warehouses` w ON pi.warehouse_id = w.id
  SET pi.branch_id = w.branch_id
  WHERE pi.branch_id IS NULL AND w.branch_id IS NOT NULL;

UPDATE `purchase_orders` po
  INNER JOIN `warehouses` w ON po.target_warehouse_id = w.id
  SET po.branch_id = w.branch_id
  WHERE po.branch_id IS NULL AND w.branch_id IS NOT NULL;

-- Add indexes
CREATE INDEX `purchase_invoices_branch_id_idx` ON `purchase_invoices`(`branch_id`);
CREATE INDEX `purchase_orders_branch_id_idx` ON `purchase_orders`(`branch_id`);
