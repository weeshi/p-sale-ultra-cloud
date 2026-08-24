import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { BranchFilterProvider } from './contexts/BranchFilterContext'
import { SyncProvider } from './contexts/SyncContext'
import { RealtimeProvider } from './contexts/RealtimeContext'
import './index.css'

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BranchFilterProvider>
          <SyncProvider>
            <RealtimeProvider>
              <App />
            </RealtimeProvider>
          </SyncProvider>
        </BranchFilterProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
