-- AlterTable
ALTER TABLE `inventory_counts` ADD COLUMN `parent_count_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `inventory_counts_parent_count_id_idx` ON `inventory_counts`(`parent_count_id`);

-- AddForeignKey: الجرد التصحيحي يربط بأصله (self-relation)
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_parent_count_id_fkey` FOREIGN KEY (`parent_count_id`) REFERENCES `inventory_counts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: منشئ الجرد ومنفذه (للعمود «منفذ الجرد»)
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_posted_by_fkey` FOREIGN KEY (`posted_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;