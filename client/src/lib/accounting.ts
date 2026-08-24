// تسميات عربية موحدة للمحاسبة — تُستخدم في صفحات المحاسبة (Journal/Reports/Accounts)

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  asset: 'أصل',
  liability: 'خصم',
  equity: 'حقوق ملكية',
  revenue: 'إيراد',
  expense: 'مصروف',
}

export const JOURNAL_TYPE_LABEL: Record<string, string> = {
  purchase: 'شراء',
  sale: 'بيع',
  receipt: 'قبض',
  payment: 'صرف',
  adjusting: 'تسوية',
  opening: 'افتتاحي',
  transfer: 'تحويل',
  return: 'مرتجع',
  cogs: 'تكلفة البضاعة',
  expense: 'مصروف',
}
