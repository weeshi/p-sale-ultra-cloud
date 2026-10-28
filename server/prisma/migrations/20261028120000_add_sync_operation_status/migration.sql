-- AlterSyncOperationStatus
-- إغلاق نافذة الانقطاع: حالة الحجز PENDING حتى نجاح التنفيذ ثم COMPLETED
-- الحجوزات القديمة (قبل إضافة الحقل) تُعتبر منفَّذة لأنها سُجّلت بعد نجاح العملية

ALTER TABLE `sync_operations`
    ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'COMPLETED';

-- بعد التعبئة الأولية للحجوزات التاريخية، تصبح الحالة الافتراضية للأعمدة الجديدة PENDING
ALTER TABLE `sync_operations`
    ALTER COLUMN `status` SET DEFAULT 'PENDING';

CREATE INDEX `sync_operations_status_created_at_idx` ON `sync_operations`(`status`, `created_at`);
