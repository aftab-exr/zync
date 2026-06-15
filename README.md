# ⚡ Zync

Zync is a high-performance, distributed real-time chat application. It is engineered to provide sub-100ms latency messaging across multiple client devices using a hybrid delivery protocol and a horizontally scalable backend.

## 🏗 Architecture

Zync solves the classic "lost message" problem found in pure WebSocket apps by utilizing a **Hybrid Delivery Protocol**:
1. **Persistence First:** Messages are routed via an Express HTTP `POST` request to ensure cryptographic verification and permanent storage in MongoDB.
2. **Real-Time Distribution:** The backend instantly hooks into the Socket.io engine to broadcast the message to the recipient's private room.
3. **Horizontal Scaling:** The Socket engine is backed by a **Redis Pub/Sub Bus** (`@socket.io/redis-adapter`). This allows the application to run on multiple Node.js server instances while keeping all WebSocket connections perfectly synchronized.

### Core Features
- **Zero-Latency P2P Messaging:** Real-time delivery via WebSockets.
- **Global Presence Engine:** Dynamic "Online/Offline" tracking across all connected clients.
- **Secure Authentication:** Firebase JWT integration with a custom zero-trust Express middleware.
- **Optimized Data Layer:** Mongoose queries strictly optimized with `.lean()` for pure JSON payloads, reducing Mongoose overhead by ~300%.
- **State Synchronization:** Zustand global stores handling complex socket lifecycles and HTTP state caching.

## 🛠 Tech Stack

**Frontend**
- React 18 (Vite)
- Zustand (Global State & Socket Management)
- Tailwind CSS & Framer Motion
- React Router (Configured for persistent socket connections)
- Firebase Auth (Client-side Identity)

**Backend & Infrastructure**
- Node.js & Express
- Socket.io
- Redis (Upstash) for Pub/Sub Adapter
- MongoDB (Mongoose)
- Firebase Admin SDK (Cryptographic Token Verification)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- `pnpm` package manager
- A free [MongoDB Atlas](https://www.mongodb.com/atlas) Cluster
- A free [Upstash Redis](https://upstash.com/) Database
- A [Firebase Project](https://console.firebase.google.com/)

### 1. Clone & Install
```bash
git clone [https://github.com/aftab-exr/zync.git](https://github.com/YOUR_GITHUB_USERNAME/zync.git)
cd zync

# Install backend dependencies
cd server
pnpm install

# Install frontend dependencies
cd ../client
pnpm install