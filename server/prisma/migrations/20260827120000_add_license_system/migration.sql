-- CreateLicenseSystem
-- License System with Ed25519 + Hardware Binding

-- Create licenses table
CREATE TABLE `licenses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `license_key` VARCHAR(255) NOT NULL,
    `tier` VARCHAR(50) NOT NULL,
    `hw_hash` VARCHAR(255) NOT NULL,
    `activated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `max_users` INTEGER NULL,
    `max_branches` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `licenses_license_key_key`(`license_key`),
    INDEX `licenses_company_id_idx`(`company_id`),
    INDEX `licenses_license_key_idx`(`license_key`),
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create license_features table
CREATE TABLE `license_features` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `license_id` INTEGER NOT NULL,
    `feature` VARCHAR(100) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `license_features_license_id_feature_key`(`license_id`, `feature`),
    FOREIGN KEY (`license_id`) REFERENCES `licenses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
