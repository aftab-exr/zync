import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ⚡ V2 HORIZON: Boot the Service Worker
import { registerSW } from 'virtual:pwa-register'
import { Capacitor } from '@capacitor/core';

// 🛡️ THE FIX: Only boot the web Service Worker if we are in a normal browser.
// If we are running natively on the Android APK, skip this so the WebView doesn't crash.
if (!Capacitor.isNativePlatform()) {
  registerSW({
    onNeedRefresh() {},
    onOfflineReady() {},
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)