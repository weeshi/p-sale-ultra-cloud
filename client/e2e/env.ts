// ====================== إعداد بيئة اختبارات E2E ======================
// بيانات الدخول والمنافذ قابلة للتعديل عبر متغيرات البيئة (تناسب CI/أجهزة مختلفة).

export const env = {
  // عنوان الواجهة (الـ Frontend يعمل على 5175)
  baseURL: process.env.E2E_BASE_URL || 'http://localhost:5175',
  // عنوان الـ API (الـ Backend يعمل على 3005)
  apiURL: process.env.E2E_API_URL || 'http://localhost:3005/api',
  // مستخدم المدير (أُنشئ عبر /api/auth/setup — كلمة المرور الحالية في قاعدة التطوير)
  adminUsername: process.env.E2E_ADMIN_USERNAME || 'admin',
  adminPassword: process.env.E2E_ADMIN_PASSWORD || 'SuperAdmin123!',
  // مخزن يحتوي رصيداً للأصناف الاختبارية (المخزن المركزي id=1)
  warehouseName: process.env.E2E_WAREHOUSE_NAME || 'المخزن المركزي',
  // خزينة الدفع النقدي
  treasuryName: process.env.E2E_TREASURY_NAME || 'الصندوق الرئيسي',
} as const
