/**
 * Offline-first local cache using IndexedDB via Dexie.
 * Stores messages that have already been decrypted, allowing fast render on boot.
 */
import Dexie from "dexie";

export const db = new Dexie("ZyncLocalDB");

// Schema v1
db.version(1).stores({
  messages: "id, conversationId, senderId, createdAt",
});

// Map a server/socket message to a Dexie record (PK id mirrors _id)
const toRecord = (msg) => ({ ...msg, id: msg._id });

// Bulk-persist decrypted messages
export const cacheMessages = async (messages) => {
  try {
    const records = (messages || []).filter((m) => m?._id).map(toRecord);
    if (records.length) await db.messages.bulkPut(records);
  } catch (err) {
    console.error("Dexie cache write failed:", err);
  }
};

// Persist a single decrypted message
export const cacheMessage = (message) => cacheMessages(message ? [message] : []);

// Read a conversation's cached history, chronologically
export const getCachedMessages = async (conversationId) => {
  try {
    return await db.messages.where({ conversationId }).sortBy("createdAt");
  } catch (err) {
    console.error("Dexie cache read failed:", err);
    return [];
  }
};

// Evict a single cached record by its primary key
export const deleteCachedMessage = async (id) => {
  try {
    if (id != null) await db.messages.delete(id);
  } catch (err) {
    console.error("Dexie cache delete failed:", err);
  }
};

// Retrieve messages still flagged as pending
export const getPendingMessages = async () => {
  try {
    return await db.messages
      .filter((m) => m?.status === "pending")
      .sortBy("createdAt");
  } catch (err) {
    console.error("Dexie pending-read failed:", err);
    return [];
  }
};

// Drop the entire local message cache
export const clearCachedMessages = async () => {
  try {
    await db.messages.clear();
  } catch (err) {
    console.error("Dexie cache wipe failed:", err);
  }
};
