import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, clearTokens, extractError, isAuthenticated, setTokens } from '@/lib/api'
import { resetOfflineStorage } from '@/lib/db'
import { clearActiveScope, setActiveScope } from '@/lib/session'
import type { LoginResponse, User } from '@/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const USER_KEY = 'psale_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    if (!isAuthenticated()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const res = await api.get<{ user: User }>('/auth/me')
      setUser(res.data.user)
      localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
    } catch {
      // لا نخرجه فورياً عند عدم الاتصال — نعتمد النسخة المخزنة
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // بعد تفريغ قاعدة البيانات من منطقة الخطر: نمسح التخزين المحلي كاملاً
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === '1') {
      clearTokens()
      localStorage.removeItem(USER_KEY)
      resetOfflineStorage()
      sessionStorage.clear()
      window.history.replaceState({}, '', '/login')
      setUser(null)
      setLoading(false)
      return
    }
    refreshUser()
  }, [refreshUser])

  // مزامنة النطاق النشط (User + Branch) مع مستخدم الجلسة — عزل كاش محلي دون مسح
  useEffect(() => {
    if (user) {
      void setActiveScope(user.id, user.branchId ?? null)
    } else {
      void clearActiveScope()
    }
  }, [user])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginResponse>('/auth/login', { username, password })
    setTokens(res.data.accessToken, res.data.refreshToken)
    setUser(res.data.user)
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    localStorage.removeItem(USER_KEY)
    setUser(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export { extractError }
