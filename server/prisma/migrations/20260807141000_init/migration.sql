-- CreateTable
CREATE TABLE `companies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(50) NULL,
    `mobile` VARCHAR(50) NULL,
    `tax_number` VARCHAR(191) NULL,
    `logo` TEXT NULL,
    `fiscal_year_start` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `username` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'user',
    `branch_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_login_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `module` VARCHAR(50) NOT NULL,
    `can_view` BOOLEAN NOT NULL DEFAULT false,
    `can_add` BOOLEAN NOT NULL DEFAULT false,
    `can_edit` BOOLEAN NOT NULL DEFAULT false,
    `can_delete` BOOLEAN NOT NULL DEFAULT false,
    `can_print` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_user_id_module_key`(`user_id`, `module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(50) NULL,
    `is_main` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `branches_company_id_code_key`(`company_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `name` VARCHAR(255) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'regular',
    `address` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `warehouses_company_id_code_key`(`company_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `account_code` VARCHAR(20) NOT NULL,
    `account_name` VARCHAR(255) NOT NULL,
    `account_type` VARCHAR(50) NOT NULL,
    `parent_id` INTEGER NULL,
    `is_terminal` BOOLEAN NOT NULL DEFAULT true,
    `opening_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `current_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `accounts_company_id_account_type_idx`(`company_id`, `account_type`),
    UNIQUE INDEX `accounts_company_id_account_code_key`(`company_id`, `account_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `parent_id` INTEGER NULL,
    `icon` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `logo` TEXT NULL,
    `country` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `short_name` VARCHAR(20) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attributes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `options` TEXT NULL,
    `is_filterable` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `item_code` VARCHAR(50) NOT NULL,
    `barcode` VARCHAR(100) NULL,
    `item_name` VARCHAR(255) NOT NULL,
    `model_number` VARCHAR(100) NULL,
    `category_id` INTEGER NULL,
    `brand_id` INTEGER NULL,
    `unit_id` INTEGER NULL,
    `description` TEXT NULL,
    `image` TEXT NULL,
    `purchase_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `purchase_price_usd` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `sale_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `wholesale_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `cost_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `current_stock` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `opening_stock` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `min_stock` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `reorder_level` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `location` VARCHAR(100) NULL,
    `track_serial` BOOLEAN NOT NULL DEFAULT false,
    `is_bundle` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_service` BOOLEAN NOT NULL DEFAULT false,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `inventory_account_id` INTEGER NULL,
    `cogs_account_id` INTEGER NULL,
    `sales_account_id` INTEGER NULL,
    `purchase_account_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `items_barcode_key`(`barcode`),
    INDEX `items_barcode_idx`(`barcode`),
    INDEX `items_company_id_category_id_idx`(`company_id`, `category_id`),
    INDEX `items_company_id_brand_id_idx`(`company_id`, `brand_id`),
    UNIQUE INDEX `items_company_id_item_code_key`(`company_id`, `item_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_attributes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `item_id` INTEGER NOT NULL,
    `attribute_id` INTEGER NOT NULL,
    `value` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `item_attributes_item_id_attribute_id_key`(`item_id`, `attribute_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bundle_parts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_item_id` INTEGER NOT NULL,
    `child_item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bundle_parts_parent_item_id_child_item_id_key`(`parent_item_id`, `child_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NULL,
    `serial_number` VARCHAR(100) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'in_stock',
    `cost_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `sale_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `warranty_months` INTEGER NULL,
    `warranty_ends_at` DATETIME(3) NULL,
    `sold_at` DATETIME(3) NULL,
    `sale_item_id` INTEGER NULL,
    `purchase_item_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `serials_serial_number_key`(`serial_number`),
    INDEX `serials_company_id_status_idx`(`company_id`, `status`),
    INDEX `serials_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serial_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serial_id` INTEGER NOT NULL,
    `from_warehouse_id` INTEGER NULL,
    `to_warehouse_id` INTEGER NULL,
    `from_status` VARCHAR(191) NOT NULL,
    `to_status` VARCHAR(191) NOT NULL,
    `reference_type` VARCHAR(191) NULL,
    `reference_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parties` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `party_code` VARCHAR(50) NOT NULL,
    `party_name` VARCHAR(255) NOT NULL,
    `party_type` VARCHAR(20) NOT NULL,
    `address` TEXT NULL,
    `phone` VARCHAR(50) NULL,
    `mobile` VARCHAR(50) NULL,
    `email` VARCHAR(255) NULL,
    `whatsapp` VARCHAR(50) NULL,
    `tax_number` VARCHAR(50) NULL,
    `credit_limit` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `opening_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `current_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `account_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `parties_company_id_party_type_idx`(`company_id`, `party_type`),
    UNIQUE INDEX `parties_company_id_party_code_key`(`company_id`, `party_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treasuries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `treasury_name` VARCHAR(255) NOT NULL,
    `treasury_type` VARCHAR(20) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'LYD',
    `current_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `opening_balance` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `account_id` INTEGER NULL,
    `bank_name` VARCHAR(100) NULL,
    `account_number` VARCHAR(100) NULL,
    `iban` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_rates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `from_currency` VARCHAR(3) NOT NULL,
    `to_currency` VARCHAR(3) NOT NULL,
    `rate` DECIMAL(15, 6) NOT NULL,
    `is_auto` BOOLEAN NOT NULL DEFAULT true,
    `rate_date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `exchange_rates_company_id_from_currency_to_currency_rate_dat_key`(`company_id`, `from_currency`, `to_currency`, `rate_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `min_stock` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_item_id_warehouse_id_key`(`item_id`, `warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `movement_date` DATETIME(3) NOT NULL,
    `movement_type` VARCHAR(191) NOT NULL,
    `reference_type` VARCHAR(191) NULL,
    `reference_id` INTEGER NULL,
    `item_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unit_cost` DECIMAL(15, 3) NULL,
    `total_cost` DECIMAL(15, 3) NULL,
    `balance_after` DECIMAL(15, 3) NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_item_id_warehouse_id_idx`(`item_id`, `warehouse_id`),
    INDEX `stock_movements_movement_date_idx`(`movement_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_counts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `count_number` VARCHAR(50) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `count_date` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `completed_at` DATETIME(3) NULL,
    `posted_at` DATETIME(3) NULL,
    `posted_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_count_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `count_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `system_qty` DECIMAL(15, 3) NOT NULL,
    `counted_qty` DECIMAL(15, 3) NOT NULL,
    `difference` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `unit_cost` DECIMAL(15, 3) NULL,
    `variance_value` DECIMAL(15, 3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inventory_count_items_count_id_item_id_key`(`count_id`, `item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `po_number` VARCHAR(50) NOT NULL,
    `po_date` DATETIME(3) NOT NULL,
    `party_id` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `exchange_rate` DECIMAL(15, 6) NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `subtotal` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `shipping_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `customs_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `insurance_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `other_costs` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total_amount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total_amount_usd` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `advance_paid` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `lc_number` VARCHAR(100) NULL,
    `lc_bank` VARCHAR(100) NULL,
    `expected_arrival` DATETIME(3) NULL,
    `actual_arrival` DATETIME(3) NULL,
    `target_warehouse_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `purchase_orders_po_number_idx`(`po_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purchase_order_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unit_price_usd` DECIMAL(15, 3) NOT NULL,
    `unit_price_lyd` DECIMAL(15, 3) NOT NULL,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total_usd` DECIMAL(15, 3) NOT NULL,
    `total_lyd` DECIMAL(15, 3) NOT NULL,
    `received_qty` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `purchase_order_id` INTEGER NULL,
    `shipment_number` VARCHAR(50) NOT NULL,
    `carrier` VARCHAR(100) NULL,
    `tracking_number` VARCHAR(100) NULL,
    `port_of_loading` VARCHAR(100) NULL,
    `port_of_discharge` VARCHAR(100) NULL,
    `shipment_date` DATETIME(3) NULL,
    `arrival_date` DATETIME(3) NULL,
    `shipping_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `customs_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'in_transit',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `invoice_number` VARCHAR(50) NOT NULL,
    `invoice_date` DATETIME(3) NOT NULL,
    `party_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NULL,
    `treasury_id` INTEGER NULL,
    `purchase_order_id` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `exchange_rate` DECIMAL(15, 6) NOT NULL DEFAULT 1,
    `subtotal` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `shipping_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `customs_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'unpaid',
    `journal_entry_id` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `purchase_invoices_invoice_number_idx`(`invoice_number`),
    INDEX `purchase_invoices_invoice_date_idx`(`invoice_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unit_price` DECIMAL(15, 3) NOT NULL,
    `unit_price_usd` DECIMAL(15, 3) NOT NULL,
    `landed_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `unit_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quotes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `quote_number` VARCHAR(50) NOT NULL,
    `quote_date` DATETIME(3) NOT NULL,
    `party_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `valid_until` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `subtotal` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `sale_invoice_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quote_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `quote_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unit_price` DECIMAL(15, 3) NOT NULL,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `warehouse_id` INTEGER NULL,
    `invoice_number` VARCHAR(50) NOT NULL,
    `invoice_date` DATETIME(3) NOT NULL,
    `party_id` INTEGER NULL,
    `treasury_id` INTEGER NULL,
    `quote_id` INTEGER NULL,
    `invoice_type` VARCHAR(191) NOT NULL DEFAULT 'sale',
    `subtotal` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `tax_amount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `paid_amount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `payment_status` VARCHAR(191) NOT NULL DEFAULT 'unpaid',
    `journal_entry_id` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sale_invoices_invoice_number_idx`(`invoice_number`),
    INDEX `sale_invoices_invoice_date_idx`(`invoice_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sale_invoice_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unit_price` DECIMAL(15, 3) NOT NULL,
    `cost_price` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `discount` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total` DECIMAL(15, 3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `receipt_number` VARCHAR(50) NOT NULL,
    `receipt_date` DATETIME(3) NOT NULL,
    `receipt_type` VARCHAR(191) NOT NULL,
    `party_id` INTEGER NULL,
    `treasury_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'LYD',
    `exchange_rate` DECIMAL(15, 6) NOT NULL DEFAULT 1,
    `amount` DECIMAL(15, 3) NOT NULL,
    `amount_usd` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `payment_method` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `check_number` VARCHAR(100) NULL,
    `check_date` DATETIME(3) NULL,
    `bank_name` VARCHAR(100) NULL,
    `reference_no` VARCHAR(100) NULL,
    `sale_invoice_id` INTEGER NULL,
    `purchase_invoice_id` INTEGER NULL,
    `journal_entry_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `entry_number` INTEGER NOT NULL,
    `entry_date` DATETIME(3) NOT NULL,
    `entry_type` VARCHAR(191) NOT NULL,
    `reference_type` VARCHAR(191) NULL,
    `reference_id` INTEGER NULL,
    `branch_id` INTEGER NULL,
    `description` TEXT NULL,
    `total_debit` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `total_credit` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `is_posted` BOOLEAN NOT NULL DEFAULT true,
    `is_reversed` BOOLEAN NOT NULL DEFAULT false,
    `reversed_by_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `journal_entries_entry_date_idx`(`entry_date`),
    INDEX `journal_entries_reference_type_reference_id_idx`(`reference_type`, `reference_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `journal_entry_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `journal_entry_id` INTEGER NOT NULL,
    `line_number` INTEGER NOT NULL,
    `account_id` INTEGER NOT NULL,
    `description` VARCHAR(255) NULL,
    `debit` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `credit` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `party_id` INTEGER NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'LYD',
    `currency_amount` DECIMAL(15, 3) NULL,

    INDEX `journal_entry_lines_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transfers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `transfer_number` VARCHAR(50) NOT NULL,
    `transfer_date` DATETIME(3) NOT NULL,
    `from_warehouse_id` INTEGER NOT NULL,
    `to_warehouse_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `transfer_type` VARCHAR(191) NOT NULL DEFAULT 'transfer',
    `requested_by` INTEGER NULL,
    `approved_by` INTEGER NULL,
    `received_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_transfer_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transfer_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL,
    `unit_cost` DECIMAL(15, 3) NOT NULL,
    `received_qty` DECIMAL(15, 3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warranties` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `warranty_number` VARCHAR(50) NOT NULL,
    `serial_id` INTEGER NOT NULL,
    `sale_invoice_id` INTEGER NULL,
    `party_id` INTEGER NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `warranty_type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rmas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `rma_number` VARCHAR(50) NOT NULL,
    `rma_date` DATETIME(3) NOT NULL,
    `party_id` INTEGER NOT NULL,
    `warranty_id` INTEGER NULL,
    `rma_type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `issue_description` TEXT NULL,
    `diagnosis` TEXT NULL,
    `action_taken` TEXT NULL,
    `technician_id` INTEGER NULL,
    `repair_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `parts_cost` DECIMAL(15, 3) NOT NULL DEFAULT 0,
    `received_at` DATETIME(3) NULL,
    `returned_at` DATETIME(3) NULL,
    `replacement_serial_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rma_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rma_id` INTEGER NOT NULL,
    `serial_id` INTEGER NULL,
    `item_id` INTEGER NOT NULL,
    `quantity` DECIMAL(15, 3) NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `action` VARCHAR(20) NOT NULL,
    `table_name` VARCHAR(100) NOT NULL,
    `record_id` INTEGER NULL,
    `old_values` TEXT NULL,
    `new_values` TEXT NULL,
    `ip_address` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_table_name_record_id_idx`(`table_name`, `record_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `company_id` INTEGER NOT NULL,
    `device_id` VARCHAR(255) NOT NULL,
    `sync_type` VARCHAR(50) NOT NULL,
    `tables_synced` TEXT NULL,
    `records_count` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'success',
    `error_message` TEXT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouses` ADD CONSTRAINT `warehouses_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warehouses` ADD CONSTRAINT `warehouses_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `brands` ADD CONSTRAINT `brands_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `units` ADD CONSTRAINT `units_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attributes` ADD CONSTRAINT `attributes_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_unit_id_fkey` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_inventory_account_id_fkey` FOREIGN KEY (`inventory_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_cogs_account_id_fkey` FOREIGN KEY (`cogs_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_sales_account_id_fkey` FOREIGN KEY (`sales_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_purchase_account_id_fkey` FOREIGN KEY (`purchase_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_attributes` ADD CONSTRAINT `item_attributes_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_attributes` ADD CONSTRAINT `item_attributes_attribute_id_fkey` FOREIGN KEY (`attribute_id`) REFERENCES `attributes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundle_parts` ADD CONSTRAINT `bundle_parts_parent_item_id_fkey` FOREIGN KEY (`parent_item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundle_parts` ADD CONSTRAINT `bundle_parts_child_item_id_fkey` FOREIGN KEY (`child_item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serials` ADD CONSTRAINT `serials_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serials` ADD CONSTRAINT `serials_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serials` ADD CONSTRAINT `serials_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serials` ADD CONSTRAINT `serials_sale_item_id_fkey` FOREIGN KEY (`sale_item_id`) REFERENCES `sale_invoice_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serials` ADD CONSTRAINT `serials_purchase_item_id_fkey` FOREIGN KEY (`purchase_item_id`) REFERENCES `purchase_invoice_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serial_movements` ADD CONSTRAINT `serial_movements_serial_id_fkey` FOREIGN KEY (`serial_id`) REFERENCES `serials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parties` ADD CONSTRAINT `parties_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parties` ADD CONSTRAINT `parties_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasuries` ADD CONSTRAINT `treasuries_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treasuries` ADD CONSTRAINT `treasuries_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exchange_rates` ADD CONSTRAINT `exchange_rates_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock` ADD CONSTRAINT `stock_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock` ADD CONSTRAINT `stock_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock` ADD CONSTRAINT `stock_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_counts` ADD CONSTRAINT `inventory_counts_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_count_items` ADD CONSTRAINT `inventory_count_items_count_id_fkey` FOREIGN KEY (`count_id`) REFERENCES `inventory_counts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_count_items` ADD CONSTRAINT `inventory_count_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_items` ADD CONSTRAINT `purchase_order_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_treasury_id_fkey` FOREIGN KEY (`treasury_id`) REFERENCES `treasuries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoice_items` ADD CONSTRAINT `purchase_invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_invoice_items` ADD CONSTRAINT `purchase_invoice_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoices` ADD CONSTRAINT `sale_invoices_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoices` ADD CONSTRAINT `sale_invoices_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoices` ADD CONSTRAINT `sale_invoices_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoices` ADD CONSTRAINT `sale_invoices_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoices` ADD CONSTRAINT `sale_invoices_treasury_id_fkey` FOREIGN KEY (`treasury_id`) REFERENCES `treasuries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoices` ADD CONSTRAINT `sale_invoices_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoice_items` ADD CONSTRAINT `sale_invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `sale_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sale_invoice_items` ADD CONSTRAINT `sale_invoice_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_treasury_id_fkey` FOREIGN KEY (`treasury_id`) REFERENCES `treasuries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_reversed_by_id_fkey` FOREIGN KEY (`reversed_by_id`) REFERENCES `journal_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entry_lines` ADD CONSTRAINT `journal_entry_lines_journal_entry_id_fkey` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_entry_lines` ADD CONSTRAINT `journal_entry_lines_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_from_warehouse_id_fkey` FOREIGN KEY (`from_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfers` ADD CONSTRAINT `stock_transfers_to_warehouse_id_fkey` FOREIGN KEY (`to_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_transfer_id_fkey` FOREIGN KEY (`transfer_id`) REFERENCES `stock_transfers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_transfer_items` ADD CONSTRAINT `stock_transfer_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranties` ADD CONSTRAINT `warranties_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranties` ADD CONSTRAINT `warranties_serial_id_fkey` FOREIGN KEY (`serial_id`) REFERENCES `serials`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranties` ADD CONSTRAINT `warranties_sale_invoice_id_fkey` FOREIGN KEY (`sale_invoice_id`) REFERENCES `sale_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranties` ADD CONSTRAINT `warranties_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rmas` ADD CONSTRAINT `rmas_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rmas` ADD CONSTRAINT `rmas_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rmas` ADD CONSTRAINT `rmas_warranty_id_fkey` FOREIGN KEY (`warranty_id`) REFERENCES `warranties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rma_items` ADD CONSTRAINT `rma_items_rma_id_fkey` FOREIGN KEY (`rma_id`) REFERENCES `rmas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rma_items` ADD CONSTRAINT `rma_items_serial_id_fkey` FOREIGN KEY (`serial_id`) REFERENCES `serials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rma_items` ADD CONSTRAINT `rma_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_logs` ADD CONSTRAINT `sync_logs_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
