import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import './index.css'

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  return user ? <App /> : <LoginScreen />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>,
)
