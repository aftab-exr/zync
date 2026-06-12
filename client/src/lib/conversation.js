export const sameId = (a, b) => a?.toString() === b?.toString();

export function getOtherParticipant(participants, currentUserId) {
  if (!participants?.length || !currentUserId) return null;
  return participants.find((p) => {
    const pId = (typeof p === 'object' && p !== null) ? (p._id || p.id) : p;
    return pId && !sameId(pId, currentUserId);
  }) ?? null;
}

export function isUserOnline(userId, onlineUsers, fallbackStatus) {
  if (!userId) return false;
  return onlineUsers.includes(userId.toString()) || Boolean(fallbackStatus?.online);
}

export function getLastMessagePreview(conversation) {
  const last = conversation?.lastMessageId;
  if (!last) return 'Started a new conversation';
  if (typeof last === 'object' && last.text) return last.text;
  return 'Started a new conversation';
}
