# ⚡ Zync

A high-performance, distributed real-time chat application engineered for
sub-100ms message delivery across multiple clients.

---

## The Problem I Solved

Most WebSocket-only chat apps suffer from the "lost message" problem — if a
socket drops at the wrong moment, the message is gone. Zync eliminates this
with a Hybrid Delivery Protocol that separates persistence from delivery.

---

## How It Works

### Hybrid Delivery Protocol
1. **Persist First** — Every message hits an Express HTTP endpoint first,
   ensuring it's cryptographically verified and written to MongoDB before
   anything else happens.
2. **Deliver Second** — The server immediately emits the stored message over
   Socket.io to the recipient's private room.
3. **Scale Horizontally** — A Redis Pub/Sub bus via `@socket.io/redis-adapter`
   keeps all WebSocket connections in sync across multiple Node.js instances.

### Presence Engine
Online/Offline status is tracked globally across all connected clients in
real time using socket lifecycle events tied to Zustand state.

### Zero-Trust Auth
Every HTTP request and socket connection is verified against a Firebase JWT
before any data is touched. The middleware is stateless and fails closed.

---

## Case Studies

**Solving the Strict Mode Double-Connect Bug**
React 18 Strict Mode mounts components twice in development, which was
causing two simultaneous socket connections per user. Fixed by adding a
synchronous `isConnecting` flag in the Zustand socket store that
short-circuits any concurrent `connect()` call.

**Cursor-Based Pagination on Messages**
Offset pagination breaks under real-time inserts. Replaced it with
`_id`-based cursor pagination — queries use `{ _id: { $lt: cursor } }`
sorted descending, capped at 30 messages, returning a `nextCursor` for
the next page. Scroll-to-top in the chat pane triggers the next fetch
without scroll jumping.

**Redis Health Check on Startup**
If Redis is misconfigured, Socket.io silently falls back to in-memory
mode — meaning horizontal scaling breaks with no visible error. Added an
async `pubClient.ping()` with a 5-second timeout during server init that
aborts startup if Redis is unreachable.

---

## Tech Stack

**Frontend**
- React 18 + Vite
- Zustand — global state and socket lifecycle management
- Tailwind CSS + Framer Motion
- Firebase Auth — client-side identity

**Backend**
- Node.js + Express
- Socket.io + `@socket.io/redis-adapter`
- MongoDB + Mongoose (all reads use `.lean()`)
- Redis via Upstash — Pub/Sub bus
- Firebase Admin SDK — JWT verification middleware

---

## Architecture Decisions Worth Noting

- **HTTP + WebSocket hybrid** over pure WebSocket — guarantees persistence
  even if the socket drops mid-delivery
- **Zustand over Context** for socket state — avoids re-render cascades on
  connection events
- **`.lean()` on all Mongoose reads** — returns plain JS objects instead of
  full Mongoose documents, cutting overhead significantly
- **Zod validation on all routes** — input is rejected at the boundary
  before touching any controller logic