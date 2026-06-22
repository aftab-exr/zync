import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ⚡ V2 HORIZON: Boot the Service Worker
import { registerSW } from 'virtual:pwa-register'
// 🛡️ THE FIX: Boot the web Service Worker.
registerSW({
  onNeedRefresh() {},
  onOfflineReady() {},
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)