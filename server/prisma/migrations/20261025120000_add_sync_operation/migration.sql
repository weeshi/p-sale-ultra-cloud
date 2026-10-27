-- CreateSyncOperation
-- منع تكرار عمليات المزامنة (Idempotency): معرّف عميل فريد لكل عملية مدفوعة

CREATE TABLE `sync_operations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `device_id` VARCHAR(255) NOT NULL,
    `client_op_id` VARCHAR(255) NOT NULL,
    `entity` VARCHAR(50) NOT NULL,
    `action` VARCHAR(20) NOT NULL,
    `record_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    UNIQUE INDEX `sync_operations_client_op_id_key`(`client_op_id`),
    INDEX `sync_operations_company_id_device_id_idx`(`company_id`, `device_id`),
    INDEX `sync_operations_created_at_idx`(`created_at`),
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
