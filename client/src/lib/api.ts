import axios, { AxiosError } from 'axios'
import type { ApiError } from '@/types'

const TOKEN_KEY = 'psale_access_token'
const REFRESH_KEY = 'psale_refresh_token'

// استخدام متغير بيئة أو القيمة الافتراضية للإنتاج
// Vite يستبدل import.meta.env.VITE_API_BASE_URL عند البناء
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3005/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiError>) => {
    const status = error.response?.status
    // انتهاء صلاحية التوكن — تسجيل خروج
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      clearTokens()
      // إن كنا أصلاً في صفحة الدخول لا نعيد التحميل (يمنع حلقة تحديث لا نهائية)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken())
}

export function extractError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.error || error.response?.data?.message
    if (msg) return msg
    if (error.code === 'ECONNABORTED') return 'انتهت مهلة الطلب'
    if (!error.response) return 'تعذر الاتصال بالخادم — تحقق من الاتصال بالإنترنت'
  }
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع'
}
