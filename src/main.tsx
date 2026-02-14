import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/index.css'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { AuthProvider } from './context/AuthContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ToastProvider>
            <ConfirmProvider>
                <AuthProvider>
                    <App />
                </AuthProvider>
            </ConfirmProvider>
        </ToastProvider>
    </React.StrictMode>,
)
