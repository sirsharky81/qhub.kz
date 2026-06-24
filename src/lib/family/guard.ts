import { getMember, verifyMemberToken } from "./store";
import type { FamilyMember } from "./types";

export class FamilyAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function jsonFamilyAuthError(err: unknown): Response {
  if (err instanceof FamilyAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error) {
    if (err.message === "room_not_found") return Response.json({ error: "Комната не найдена" }, { status: 404 });
    if (err.message === "member_not_found") return Response.json({ error: "Участник не найден" }, { status: 404 });
    if (err.message === "forbidden") return Response.json({ error: "Доступ запрещён" }, { status: 403 });
    if (err.message === "not_tracked") return Response.json({ error: "Только отслеживаемые участники" }, { status: 403 });
    if (err.message === "not_sharing") {
      return Response.json({ error: "Геопозиция отключена" }, { status: 403 });
    }
    if (err.message === "bind_expired") return Response.json({ error: "Ссылка привязки истекла" }, { status: 410 });
    if (err.message === "pair_expired") return Response.json({ error: "QR участника истёк или уже использован" }, { status: 410 });
    if (err.message === "observer_slot_taken") {
      return Response.json({ error: "В семье уже есть второй родитель" }, { status: 409 });
    }
    if (err.message === "cannot_remove_owner") return Response.json({ error: "Нельзя удалить владельца" }, { status: 400 });
    if (err.message === "cannot_leave_as_owner") {
      return Response.json({ error: "Создатель не может покинуть семью — удалите семью или передайте права" }, { status: 400 });
    }
  }
  return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
}

export async function assertFamilyMember(request: Request): Promise<FamilyMember> {
  const memberId = request.headers.get("X-Family-Member-Id") ?? "";
  const accessToken = request.headers.get("X-Family-Access-Token") ?? "";
  if (!memberId || !accessToken) {
    throw new FamilyAuthError("Требуется авторизация", 401);
  }
  const member = await verifyMemberToken(memberId, accessToken);
  if (!member) {
    throw new FamilyAuthError("Неверный токен", 401);
  }
  return member;
}

export async function assertRoomMember(request: Request, roomId: string): Promise<FamilyMember> {
  const member = await assertFamilyMember(request);
  if (member.roomId.toUpperCase() !== roomId.toUpperCase()) {
    throw new FamilyAuthError("Доступ запрещён", 403);
  }
  return member;
}

export async function assertOwner(request: Request, roomId: string): Promise<FamilyMember> {
  const member = await assertRoomMember(request, roomId);
  if (member.role !== "owner") {
    throw new FamilyAuthError("Только владелец", 403);
  }
  return member;
}

export async function getMemberOrThrow(memberId: string): Promise<FamilyMember> {
  const member = await getMember(memberId);
  if (!member) throw new FamilyAuthError("Участник не найден", 404);
  return member;
}
