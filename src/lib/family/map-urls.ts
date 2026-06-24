export function parentMapMemberUrl(roomId: string, memberId: string): string {
  return `/tools/family/parent/map/${roomId}?member=${encodeURIComponent(memberId)}`;
}

export function childMapMemberUrl(memberId: string): string {
  return `/tools/family/child/map?member=${encodeURIComponent(memberId)}`;
}
