import dotenv from 'dotenv'
import path from 'path'

// تحميل متغيرات بيئة الاختبار قبل أي استيراد
// dotenv لا يكتب فوق متغير موجود، لكن override يضمن استخدام psale_ultra_test حتى لو أُعطي متغير آخر
dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true })
