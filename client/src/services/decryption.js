/**
 * Centralized Message Processing Service for Zync Client
 * Handles plain-text messages and fallback formatting cleanly.
 */

export async function getDMDecryptionKey() {
  return null;
}

export async function getGroupDecryptionKey() {
  return null;
}

export async function getDecryptionKey() {
  return null;
}

export async function safeDecryptMessage(message) {
  if (!message || !message.text) return '';
  return message.text;
}

export async function decryptMessages(messages) {
  return messages.map((m) => ({ ...m, isDecrypted: true }));
}

export async function decryptConversationMessages(conversationId, messages) {
  return messages.map((m) => ({ ...m, isDecrypted: true }));
}

export async function encryptForDM(text) {
  return text;
}

export async function encryptForGroup(text) {
  return text;
}

export async function encryptForConversation(text) {
  return text;
}