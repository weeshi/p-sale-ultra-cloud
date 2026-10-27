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

// نقاط القراءة التي يطبّق فيها الخادم نطاق الفرع (resolveBranchScope)
const BRANCH_AWARE_PREFIXES = ['/reports', '/sales', '/purchases', '/warehouses', '/treasury', '/inventory/counts']
// نقاط تحت البادئات أعلاه لكنها لا تعتمد على نطاق الفرع
const BRANCH_AGNOSTIC_PATHS = ['/warehouses/branches']

let allBranchesByDefault = false

/**
 * يفعّل إرسال branchId=all تلقائياً لقراءات الفروع عندما يكون المستخدم صاحب صلاحية عرض الكل
 * ويختار "كل الفروع" (أي لا فرع محدد). الخادم يطبّق الافتراضي الآمن (فرع المستخدم)،
 * لذلك تُرسل الواجهة الاختيار صراحةً حتى لا تعرض فرعاً واحداً تحت عنوان "كل الفروع".
 */
export function setAllBranchesByDefault(enabled: boolean) {
  allBranchesByDefault = enabled
}

function isBranchAwarePath(url: string): boolean {
  const path = url.split('?')[0]
  if (BRANCH_AGNOSTIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return false
  return BRANCH_AWARE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const url = config.url ?? ''
  const hasBranchParam =
    /[?&]branchId=/.test(url) || (config.params != null && 'branchId' in config.params)
  if (
    allBranchesByDefault &&
    (config.method ?? 'get').toLowerCase() === 'get' &&
    isBranchAwarePath(url) &&
    !hasBranchParam
  ) {
    config.params = { ...(config.params ?? {}), branchId: 'all' }
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
