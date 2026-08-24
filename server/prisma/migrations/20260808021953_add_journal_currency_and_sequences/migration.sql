-- AlterTable
ALTER TABLE `journal_entries` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'LYD',
    ADD COLUMN `exchange_rate` DECIMAL(15, 6) NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `sequences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `prefix` VARCHAR(20) NOT NULL,
    `current_value` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sequences_company_id_prefix_key`(`company_id`, `prefix`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sequences` ADD CONSTRAINT `sequences_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
