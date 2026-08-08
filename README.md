# Zync

Zync is a fast, end-to-end encrypted real-time chat web app built with a bold Neubrutalist design system. It combines Signal Protocol security standards with instant messaging, WebRTC voice/video calls, and an AI chat assistant.

---

## ⚡ Key Features

- **Signal Protocol End-to-End Encryption (E2EE)**
  - **1:1 Direct Messages:** Double Ratchet engine (`ratchet.js`) using Web Crypto HKDF-SHA256 and advancing per-message keys for forward secrecy.
  - **Group Chats:** Scalable Group Sender Keys (`senderKeys.js`) with ECDH key wrapping per member.
  - **Key Infrastructure:** X3DH pre-key bundles (Identity Key, Signed Pre-Key, and One-Time Pre-Keys).
  - **Safety Numbers:** 30-digit SHA-256 fingerprint calculator & interactive header verification modal.

- **Hybrid Delivery & Real-time Messaging**
  - **Persist-First Delivery:** Messages are authenticated and saved to MongoDB before socket emission, preventing dropped messages during unexpected disconnections.
  - **Horizontal Scaling:** Redis Pub/Sub adapter coordinates WebSockets across distributed server instances.
  - **Cursor Pagination:** Smooth infinite scroll using MongoDB `_id` cursor pagination.

- **Authentication & Multi-Device Security**
  - **Dual-Token Flow:** Short-lived (15m) Access JWT + 7-day HttpOnly refresh cookie with token family rotation and automatic interceptor renewal.
  - **Active Session Tracking:** View active device sessions and remotely revoke unrecognized devices in Settings.

- **Rich Communications & AI Assistance**
  - **WebRTC Calling:** Direct 1:1 voice and video calls with real-time signal exchange.
  - **Encrypted Media:** Client-side AES-256-GCM file encryption for images, video, and recorded voice notes before uploading to Cloudinary.
  - **AI Sidecar:** Integrated Groq LLM assistant for instant AI conversations and summary generation.

- **Neubrutalist UI System & PWA**
  - Custom Vanilla CSS design with high-contrast borders, bold drop shadows (`shadow-brutal`), and dynamic light/dark themes.
  - Progressive Web App (PWA) with service worker caching for offline access.

---

## 🛠️ Tech Stack

### Frontend
- **Framework & Build:** React 19, Vite 8, PWA (`vite-plugin-pwa`)
- **State & Real-time:** Zustand, Socket.io-client
- **Styling & Motion:** Custom Vanilla CSS (Neubrutalism), Framer Motion, Lucide Icons
- **Cryptography & Media:** Web Crypto API (SubtleCrypto HKDF / AES-GCM / ECDH P-256), Simple-Peer (WebRTC)

### Backend
- **Server Runtime:** Node.js (ESM), Express 5
- **Database & Cache:** MongoDB (Mongoose with `.lean()` queries), Redis (`ioredis` + `@socket.io/redis-adapter`)
- **Authentication:** Firebase Admin SDK + Custom JWT (jsonwebtoken) & bcrypt token hashing
- **AI & Storage:** Groq SDK, Cloudinary SDK

---

## 📁 Repository Structure

Zync is structured as a `pnpm` monorepo workspace:

```
zync-workspace/
├── client/                 # React 19 + Vite frontend web application
│   ├── src/
│   │   ├── components/     # UI components (ChatPane, Sidebar, Safety Modal)
│   │   ├── services/       # E2EE services (ratchet.js, senderKeys.js, safetyNumber.js)
│   │   ├── store/          # Zustand state stores (useAuthStore, useMessageStore)
│   │   └── lib/            # Axios interceptors, Web Crypto helpers
├── server/                 # Express 5 + Socket.io backend API
│   ├── src/
│   │   ├── controllers/    # Route controllers (auth, message, conversation, keys)
│   │   ├── models/         # Mongoose models (User, Message, Conversation, Key, Device)
│   │   ├── services/       # Redis sliding window rate limiter, AI gateway
│   │   └── socket/         # Socket.io authentication & event handlers
├── doc/                    # System specifications (PRD, TRD, SCHEMA, UIUX, APPFLOW)
├── pnpm-workspace.yaml     # Monorepo workspace configuration
└── TODO.md                 # Project roadmap and feature status
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x
- Running MongoDB instance & Redis instance

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aftab-exr/zync.git
   cd zync-workspace
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables:**
   Create `.env` in `server/` with the following variables:
   ```env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/zync
   JWT_SECRET=your_jwt_secret_key
   REDIS_URL=redis://localhost:6379
   CLOUDINARY_URL=your_cloudinary_url
   GROQ_API_KEY=your_groq_api_key
   ```

4. **Run Development Server:**
   ```bash
   pnpm dev
   ```

5. **Build for Production:**
   ```bash
   pnpm build
   ```

---

## 🔒 Security & Privacy

Zync adheres to strict cryptographic privacy principles:
- **Zero-Knowledge Encryption:** Message payloads and raw attachments are encrypted on the client before leaving the browser.
- **Forward Secrecy:** Per-message advancing Double Ratchet chain keys prevent past messages from being decrypted even if a key is compromised later.
- **Fail-Closed Verification:** Every HTTP request and socket event is verified at the system boundary before processing.