export function parentRoomUrl(roomId: string): string {
  return `/tools/family/parent/room?id=${encodeURIComponent(roomId)}`;
}

export function parentMapUrl(roomId: string, memberId?: string): string {
  const base = `/tools/family/parent/map?id=${encodeURIComponent(roomId)}`;
  if (memberId) return `${base}&member=${encodeURIComponent(memberId)}`;
  return base;
}

export function parentMapMemberUrl(roomId: string, memberId: string): string {
  return parentMapUrl(roomId, memberId);
}

export function childMapMemberUrl(memberId: string): string {
  return `/tools/family/child/map?member=${encodeURIComponent(memberId)}`;
}

export function messengerChatUrl(peerPhone: string, returnTo?: string): string {
  const base = `/tools/messenger/chat?peer=${encodeURIComponent(peerPhone)}`;
  if (!returnTo) return base;
  return `${base}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function messengerChatCallUrl(peerPhone: string, callId: string): string {
  const base = messengerChatUrl(peerPhone);
  return `${base}&call=${encodeURIComponent(callId)}`;
}

export function messengerRoomUrl(roomId: string): string {
  return `/tools/messenger/room?id=${encodeURIComponent(roomId.toUpperCase())}`;
}
