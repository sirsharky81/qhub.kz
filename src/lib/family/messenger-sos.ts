import { encryptMessage } from "@/lib/messenger/crypto";
import { sendEncryptedMessage } from "@/lib/messenger/client";
import { getRoomKey } from "./messenger-room-keys";

export interface FamilySosMessengerPayload {
  type: "family-sos";
  memberName: string;
  lat: number;
  lng: number;
  ts: number;
  roomId: string;
}

export async function sendSosToMessengerRoom(input: {
  messengerRoomId: string;
  memberName: string;
  lat: number;
  lng: number;
  familyRoomId: string;
}): Promise<boolean> {
  const roomKey = await getRoomKey(input.messengerRoomId);
  if (!roomKey) return false;

  const payload: FamilySosMessengerPayload = {
    type: "family-sos",
    memberName: input.memberName,
    lat: input.lat,
    lng: input.lng,
    ts: Date.now(),
    roomId: input.familyRoomId,
  };

  const text = `🆘 SOS: ${input.memberName}\nКоординаты: ${input.lat.toFixed(5)}, ${input.lng.toFixed(5)}\n${typeof window !== "undefined" ? window.location.origin : "https://qhub.kz"}/tools/family/room/${input.familyRoomId}`;
  const { ciphertext, iv } = await encryptMessage(roomKey, {
    text,
    data: JSON.stringify(payload),
  });

  const result = await sendEncryptedMessage({
    channel: `room:${input.messengerRoomId.toUpperCase()}`,
    type: "text",
    ciphertext,
    iv,
  });

  return result != null;
}
