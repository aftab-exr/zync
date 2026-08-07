/**
 * Centralized Decryption Service for Zync Client
 * Uses shared @zync/crypto package for all cryptographic operations
 */
import {
  importPrivateKey,
  importPublicKey,
  deriveSharedSecret,
  decryptText,
  importSymmetricKey,
  encryptText
} from '@zync/crypto';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { sameId } from '../lib/conversation';

/**
 * Derive decryption key for a 1:1 conversation
 */
export async function getDMDecryptionKey(conversation) {
  const authStore = useAuthStore.getState();
  const currentUser = authStore.user;
  
  const otherParticipant = conversation.participants?.find(
    (p) => !sameId(p._id, currentUser?._id)
  );
  
  if (!otherParticipant?.publicKey) return null;
  
  const privateKeyJwk = localStorage.getItem('zync_private_key');
  if (!privateKeyJwk) return null;
  
  try {
    const myPrivKey = await importPrivateKey(privateKeyJwk);
    const theirPubKey = await importPublicKey(otherParticipant.publicKey);
    return await deriveSharedSecret(myPrivKey, theirPubKey);
  } catch (error) {
    console.error('DM key derivation failed:', error);
    return null;
  }
}

/**
 * Derive decryption key for a group conversation
 */
export async function getGroupDecryptionKey(conversation) {
  if (!conversation.isGroup) return null;
  
  // Group key is stored in the conversation's encryptedGroupKeys
  // For now, we'll use a simplified approach - in production this would
  // unwrap the sender's wrapped group key using their private key
  const groupKeyB64 = conversation.groupKey; // This would come from the conversation data
  if (!groupKeyB64) return null;
  
  try {
    return await importSymmetricKey(groupKeyB64);
  } catch (error) {
    console.error('Group key import failed:', error);
    return null;
  }
}

/**
 * Get the appropriate decryption key for any conversation
 */
export async function getDecryptionKey(conversation) {
  if (conversation.isGroup) {
    return getGroupDecryptionKey(conversation);
  }
  return getDMDecryptionKey(conversation);
}

/**
 * Safely decrypt a single message
 * Handles: plain text, encrypted payloads, call logs, system messages
 */
export async function safeDecryptMessage(message, decryptionKey) {
  if (!message || !message.text) return '';
  
  // Already decrypted (from cache)
  if (message.isDecrypted === true) return message.text;
  
  // Call logs and system messages are never encrypted
  if (message.messageType === 'call_log' || message.messageType === 'system') {
    return message.text;
  }
  
  try {
    const parsed = JSON.parse(message.text);
    
    // Not an encrypted payload (no iv/ciphertext)
    if (!parsed.iv || !parsed.ciphertext) {
      return message.text;
    }
    
    // No key available
    if (!decryptionKey) {
      return '🔒 [Encrypted Message - Awaiting Key Sync]';
    }
    
    const decryptedText = await decryptText(parsed, decryptionKey);
    
    if (!decryptedText || decryptedText === '[Encrypted Message - Unreadable]') {
      return '🔒 [Encrypted Message - Mathematical Mismatch]';
    }
    
    return decryptedText;
  } catch (error) {
    // Not JSON = plain text
    if (error instanceof SyntaxError) return message.text;
    console.error('Decryption error:', error);
    return '🔒 [Encrypted Message - Mathematical Mismatch]';
  }
}

/**
 * Decrypt multiple messages with the same key (batch operation)
 */
export async function decryptMessages(messages, decryptionKey) {
  if (!decryptionKey) return messages;
  
  return Promise.all(
    messages.map(async (message) => {
      if (message.isDecrypted === true) return message;
      const text = await safeDecryptMessage(message, decryptionKey);
      return { ...message, text, isDecrypted: true };
    })
  );
}

/**
 * Get decryption key and decrypt messages for a conversation
 * Main entry point used by useMessageStore
 */
export async function decryptConversationMessages(conversationId, messages) {
  const chatStore = useChatStore.getState();
  const authStore = useAuthStore.getState();
  
  const conversation = chatStore.conversations.find(
    (c) => sameId(c._id, conversationId)
  );
  const currentUser = authStore.user;
  
  if (!conversation || !currentUser) return messages;
  
  const key = await getDecryptionKey(conversation, currentUser);
  return decryptMessages(messages, key);
}

/**
 * Encrypt text for a 1:1 conversation
 */
export async function encryptForDM(text, conversation) {
  const key = await getDMDecryptionKey(conversation);
  if (!key) return text;

  try {
    const encrypted = await encryptText(text, key);
    return JSON.stringify(encrypted);
  } catch (error) {
    console.error('DM encryption failed:', error);
    return text;
  }
}

/**
 * Encrypt text for a group conversation
 */
export async function encryptForGroup(text, conversation) {
  const key = await getGroupDecryptionKey(conversation);
  if (!key) return text;

  try {
    const encrypted = await encryptText(text, key);
    return JSON.stringify(encrypted);
  } catch (error) {
    console.error('Group encryption failed:', error);
    return text;
  }
}

/**
 * Encrypt text for any conversation
 */
export async function encryptForConversation(text, conversation) {
  if (conversation.isGroup) {
    return encryptForGroup(text, conversation);
  }
  return encryptForDM(text, conversation);
}