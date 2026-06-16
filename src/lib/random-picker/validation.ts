import type { PickerMode } from "./types";

export function getActionDisabledReason(
  mode: PickerMode,
  participantsCount: number,
  pickCount: number,
  groupCount: number,
  eventValid: boolean,
  legalAccepted: boolean,
  excludePicked = false,
): string | null {
  if (!legalAccepted) return "Подтвердите согласие ниже";
  if (!eventValid) return "Заполните название мероприятия";
  if (participantsCount === 0) return "Добавьте участников в таблицу";

  const needsMinTwo = mode === "pick" || mode === "shuffle" || mode === "groups";
  if (needsMinTwo && pickCount > 1 && participantsCount < 2 && excludePicked) {
    return "Необходимо минимум 2 участника";
  }
  if (mode === "shuffle" && participantsCount < 2) {
    return "Необходимо минимум 2 участника";
  }
  if (mode === "groups" && participantsCount < 2) {
    return "Необходимо минимум 2 участника";
  }

  if (mode === "pick" && excludePicked && pickCount > participantsCount) {
    return "Нельзя выбрать больше уникальных участников, чем есть в списке";
  }

  if (mode === "groups" && groupCount > participantsCount) {
    return "Число групп не может превышать число участников";
  }

  if (mode === "groups" && groupCount < 2) {
    return "Необходимо минимум 2 группы";
  }

  return null;
}

export function isActionEnabled(disabledReason: string | null): boolean {
  return disabledReason === null;
}
