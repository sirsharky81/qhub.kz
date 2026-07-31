import { verifyParticipantToken } from "./store";

export class ShareAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function assertShareParticipant(request: Request): Promise<{
  participantId: string;
  accessToken: string;
}> {
  const participantId = request.headers.get("X-Share-Participant-Id")?.trim() ?? "";
  const accessToken = request.headers.get("X-Share-Access-Token")?.trim() ?? "";
  if (!participantId || !accessToken) {
    throw new ShareAuthError("Требуется авторизация");
  }
  const participant = await verifyParticipantToken(participantId, accessToken);
  if (!participant) {
    throw new ShareAuthError("Сессия истекла");
  }
  return { participantId, accessToken };
}

export function jsonShareAuthError(err: unknown): Response {
  if (err instanceof ShareAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[share/auth]", err);
  return Response.json({ error: "Ошибка сервера" }, { status: 500 });
}
