import { canActAsOwner, getMember, getRoom, isMemberConnected, verifyMemberToken } from "./store";
import type { SplitMember } from "./types";

export class SplitAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "SplitAuthError";
  }
}

export function jsonSplitError(err: unknown): Response {
  if (err instanceof SplitAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof Error) {
    const map: Record<string, [string, number]> = {
      room_not_found: ["Комната не найдена", 404],
      member_not_found: ["Участник не найден", 404],
      expense_not_found: ["Расход не найден", 404],
      settlement_not_found: ["Погашение не найдено", 404],
      invite_expired: ["Приглашение истекло", 410],
      invite_consumed: ["Приглашение уже использовано", 410],
      room_archived: ["Комната в архиве", 403],
      forbidden: ["Доступ запрещён", 403],
      expense_locked: ["Расход заблокирован после погашения", 409],
      nonzero_balance: ["Нельзя выйти с ненулевым балансом", 409],
      balances_not_settled: ["Сначала закройте все долги", 409],
      cannot_leave_as_owner: ["Владелец не может покинуть комнату", 400],
      unsupported_currency: ["Неподдерживаемая валюта", 400],
      missing_exchange_rate: ["Владелец ещё не задал курс этой валюты", 400],
      rate_for_base_currency: ["Курс для базовой валюты не нужен", 400],
      invalid_rate: ["Некорректный курс", 400],
      fixed_sum_mismatch: ["Сумма долей должна равняться расходу", 400],
      percentage_sum_mismatch: ["Сумма процентов должна быть 100%", 400],
      settlement_exceeds_debt: ["Сумма погашения больше задолженности", 400],
      no_participants: ["Выберите участников", 400],
      invalid_amount: ["Некорректная сумма", 400],
      invalid_exchange_rate: ["Некорректный курс", 400],
      invalid_split_method: ["Неизвестный способ разделения", 400],
      invalid_fixed_share: ["Некорректная фиксированная доля", 400],
      invalid_percentage: ["Некорректный процент", 400],
      invalid_shares: ["Некорректные доли", 400],
      settlement_same_member: ["Нельзя погасить долг самому себе", 400],
      invalid_settlement_amount: ["Некорректная сумма погашения", 400],
      asset_not_found: ["Актив не найден", 404],
      asset_negative_balance: ["Недостаточно средств на активе", 409],
      transfer_currency_mismatch: ["Валюты активов не совпадают", 400],
      ledger_invariant_broken: ["Нарушен инвариант баланса комнаты", 409],
      invalid_display_name: ["Укажите имя участника", 400],
      already_connected: ["Участник уже подключён", 409],
      not_connected: ["Участник ещё не подключён", 409],
      device_not_whitelisted: ["Устройство не в whitelist", 403],
      invalid_device_key: ["Некорректный ключ устройства", 400],
      participant_has_history: ["Нельзя удалить участника с историей", 409],
    };
    const hit = map[err.message] ?? (err.name === "SplitValidationError" ? [err.message, 400] : null);
    if (hit) return Response.json({ error: hit[0] }, { status: hit[1] });
  }
  console.error("[split]", err);
  return Response.json({ error: "Внутренняя ошибка" }, { status: 500 });
}

export async function assertSplitMember(request: Request): Promise<SplitMember> {
  const memberId = request.headers.get("X-Split-Member-Id") ?? "";
  const accessToken = request.headers.get("X-Split-Access-Token") ?? "";
  if (!memberId || !accessToken) throw new SplitAuthError("Требуется авторизация", 401);
  const member = await verifyMemberToken(memberId, accessToken);
  if (!member) throw new SplitAuthError("Неверный токен", 401);
  if (!isMemberConnected(member)) throw new SplitAuthError("Требуется авторизация", 401);
  return member;
}

export async function assertSplitRoomMember(request: Request, roomId: string): Promise<SplitMember> {
  const member = await assertSplitMember(request);
  if (member.roomId.toUpperCase() !== roomId.toUpperCase()) {
    throw new SplitAuthError("Доступ запрещён", 403);
  }
  return member;
}

export async function assertSplitOwner(request: Request, roomId: string): Promise<SplitMember> {
  const member = await assertSplitRoomMember(request, roomId);
  const room = await getRoom(roomId);
  if (!room) throw new SplitAuthError("Комната не найдена", 404);
  if (!(await canActAsOwner(room, member.memberId))) {
    throw new SplitAuthError("Только владелец", 403);
  }
  return member;
}

export async function getSplitMemberOrThrow(memberId: string): Promise<SplitMember> {
  const member = await getMember(memberId);
  if (!member) throw new SplitAuthError("Участник не найден", 404);
  return member;
}
