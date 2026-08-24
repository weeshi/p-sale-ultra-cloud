-- AlterTable
ALTER TABLE `users` 
  ADD COLUMN `is_super_admin` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `super_admin_key` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_super_admin_key_key` ON `users`(`super_admin_key`);
