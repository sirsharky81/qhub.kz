import { createSubaruAssistRoomEngine } from "@/lib/room-core/engine";
import type { RoomCoreEngine } from "@/lib/room-core/engine";
import type { RoomCoreMember } from "@/lib/room-core/types";

export class AssistAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function assertAssistMember(request: Request): Promise<{
  engine: RoomCoreEngine;
  member: RoomCoreMember;
}> {
  const memberId = request.headers.get("x-subaru-assist-member-id")?.trim() ?? "";
  const accessToken = request.headers.get("x-subaru-assist-access-token")?.trim() ?? "";
  if (!memberId || !accessToken) {
    throw new AssistAuthError("Требуется комната");
  }
  const engine = createSubaruAssistRoomEngine();
  const member = await engine.verifyMember(memberId, accessToken);
  if (!member) throw new AssistAuthError("Сессия комнаты истекла");
  return { engine, member };
}

export function jsonAssistError(err: unknown): Response {
  if (err instanceof AssistAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "";
  if (message === "bad_status" || message === "bad_signal") {
    return Response.json({ error: "Неверные данные" }, { status: 400 });
  }
  console.error("[subaru-assist]", err);
  return Response.json({ error: "Ошибка сервера" }, { status: 500 });
}
