/**
 * ⚡ ZYNC PHASE 3 — OFFLINE-FIRST LOCAL CACHE (IndexedDB via Dexie)
 *
 * This is a pure PERSISTENCE layer. It stores messages that have ALREADY been
 * decrypted by the existing E2E pipeline, so old conversations paint instantly
 * on boot with zero network fetch and zero re-decryption.
 *
 * 🔒 SECURITY NOTE: records here are plaintext (post-decryption) by design —
 * the whole point is an instant offline read. The Wipe Protocol
 * (clearCachedMessages) nukes this store. The user's `zync_private_key` and the
 * E2E crypto are never touched by this module.
 *
 * Primary key is `id`, mirrored from MongoDB's `_id` (Dexie can't index `_id`
 * directly as a PK alias, so we copy it on write and keep `_id` intact for the
 * UI, which references `_id`/sameId everywhere).
 */
import Dexie from "dexie";

export const db = new Dexie("ZyncLocalDB");

// Schema v1: `id` PK (= _id) + indexes the store queries by.
db.version(1).stores({
  messages: "id, conversationId, senderId, createdAt",
});

// Map a server/socket message → a Dexie record (PK `id` mirrors `_id`).
const toRecord = (msg) => ({ ...msg, id: msg._id });

// Bulk-persist decrypted messages. Never rejects — a cache miss must not break
// the live send/receive flow.
export const cacheMessages = async (messages) => {
  try {
    const records = (messages || []).filter((m) => m?._id).map(toRecord);
    if (records.length) await db.messages.bulkPut(records);
  } catch (err) {
    console.error("🔴 Dexie cache write failed:", err);
  }
};

// Persist a single decrypted message (idempotent — overwrites by `id`).
export const cacheMessage = (message) => cacheMessages(message ? [message] : []);

// Read a conversation's cached history, chronologically. Returns [] on failure
// so the caller can fall back to a network fetch.
export const getCachedMessages = async (conversationId) => {
  try {
    return await db.messages.where({ conversationId }).sortBy("createdAt");
  } catch (err) {
    console.error("🔴 Dexie cache read failed:", err);
    return [];
  }
};

// ⚡ PHASE 3.5 — OPTIMISTIC UI: remove a single cached record by its PK (`id`,
// which mirrors `_id`). Used to evict an optimistic `temp_*` message once the
// server confirms it and returns the real MongoDB `_id`. Never rejects.
export const deleteCachedMessage = async (id) => {
  try {
    if (id != null) await db.messages.delete(id);
  } catch (err) {
    console.error("🔴 Dexie cache delete failed:", err);
  }
};

// ⚡ PHASE 3.5 — OFFLINE OUTBOX: every message still flagged `status: 'pending'`
// (sent while offline and never confirmed by the server), oldest-first so the
// re-sync hook replays them in the order they were composed. Returns [] on
// failure so a cache miss can't break reconnection.
export const getPendingMessages = async () => {
  try {
    return await db.messages
      .filter((m) => m?.status === "pending")
      .sortBy("createdAt");
  } catch (err) {
    console.error("🔴 Dexie pending-read failed:", err);
    return [];
  }
};

// Wipe Protocol: drop the entire local message cache.
export const clearCachedMessages = async () => {
  try {
    await db.messages.clear();
  } catch (err) {
    console.error("🔴 Dexie cache wipe failed:", err);
  }
};
