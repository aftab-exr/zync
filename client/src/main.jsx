import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ⚡ V2 HORIZON: Boot the Service Worker
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    console.log("⚡ Zync Engine Update Available.");
  },
  onOfflineReady() {
    console.log("⚡ Zync is cached and ready for offline execution.");
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)