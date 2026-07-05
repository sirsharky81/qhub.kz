export type PickerMode =
  | "number"
  | "pick"
  | "shuffle"
  | "wheel"
  | "groups"
  | "dice"
  | "coin";

export type ProtocolTitle =
  | "ПРОТОКОЛ СЛУЧАЙНОГО ВЫБОРА"
  | "ПРОТОКОЛ ЖЕРЕБЬЁВКИ"
  | "ПРОТОКОЛ ПЕРЕМЕШИВАНИЯ СПИСКА"
  | "ПРОТОКОЛ РАСПРЕДЕЛЕНИЯ ПО ГРУППАМ";

export interface EventInfo {
  eventName: string;
  description: string;
  contact: string;
}

export interface ColumnDef {
  id: string;
  name: string;
}

export interface ParticipantTable {
  columns: ColumnDef[];
  rows: string[][];
  keyColumnId: string;
}

export interface ResultTable {
  headers: string[];
  rows: string[][];
}

export interface VerificationRecord {
  id: string;
  timestamp: string;
  date: string;
  time: string;
  eventName: string;
  description: string;
  contact: string;
  participantCount: number;
  participants: string[];
  result: string;
  resultTable?: ResultTable;
  seed: string;
  verificationHash: string;
  mode: PickerMode | "number";
  keyColumn?: string;
}

export interface NumberHistoryEntry {
  id: string;
  value: number;
  min: number;
  max: number;
  timestamp: string;
  date: string;
  time: string;
  seed: string;
  verificationHash: string;
}

export interface DiceRollEntry {
  id: string;
  diceCount: 1 | 2;
  values: number[];
  total: number;
  timestamp: string;
}

export type PickNumbering = "asc" | "desc";

export type ThemeId = "default" | "midnight" | "ocean" | "sunset" | "forest";

export type CardFormat = "1080x1080" | "1080x1350";

export interface ModeConfig {
  id: PickerMode;
  emoji: string;
  title: string;
  description: string;
  comingSoon?: boolean;
  href?: string;
}

export const PICKER_MODES: ModeConfig[] = [
  {
    id: "pick",
    emoji: "👤",
    title: "Выбор участников",
    description: "Случайный выбор одного или нескольких — по выбранному полю",
  },
  {
    id: "dice",
    emoji: "🎲",
    title: "Бросок кубиков",
    description: "Один или два кубика для настольных игр на телефоне",
  },
  {
    id: "coin",
    emoji: "🪙",
    title: "Бросить монетку",
    description: "Выпадение орла или решки",
  },
  {
    id: "number",
    emoji: "🔢",
    title: "Случайное число",
    description: "Генератор чисел в заданном диапазоне",
  },
  {
    id: "shuffle",
    emoji: "🔄",
    title: "Перемешать список",
    description: "Случайная перестановка порядка участников",
  },
  {
    id: "groups",
    emoji: "👨‍👩‍👧‍👦",
    title: "Разделить на группы",
    description: "Случайное распределение участников по группам",
  },
];

export const LEGAL_CONSENT_TEXT =
  "Я подтверждаю, что самостоятельно несу ответственность за использование сервиса, соблюдение применимого законодательства и проведение мероприятия, для которого используется данный инструмент случайного выбора.";

export const LEGAL_DISCLAIMER =
  "QHub.kz предоставляет исключительно технический инструмент для генерации случайных результатов, случайного выбора участников, жеребьёвок и распределения по группам. QHub.kz не является организатором мероприятий, конкурсов, акций, рекламных кампаний, лотерей, розыгрышей, соревнований либо иных событий, для которых используется данный сервис. Все данные об участниках и условиях мероприятия вводятся пользователем и не проверяются платформой QHub.kz. Ответственность за соблюдение законодательства, корректность данных, проведение мероприятия, исполнение обязательств перед участниками и любые последствия использования сервиса полностью несёт пользователь. QHub.kz не гарантирует законность конкретного мероприятия и не несёт ответственности за любые споры, претензии, убытки или последствия, связанные с использованием сервиса. Использование сервиса означает согласие пользователя с указанными условиями.";

export const SERVICE_URL = "https://qhub.kz/tools/random-picker";

export const CYRILLIC_GROUP_LABELS = [
  "А", "Б", "В", "Г", "Д", "Е", "Ё", "Ж", "З", "И", "Й", "К", "Л", "М",
  "Н", "О", "П", "Р", "С", "Т", "У", "Ф", "Х", "Ц", "Ч", "Ш", "Щ", "Ъ",
  "Ы", "Ь", "Э", "Ю", "Я",
];

export const CSV_FORMAT_HINT = `Формат CSV / Excel:

Excel (.xlsx, .xls):
• Каждый столбец — отдельное поле в таблице
• Разделители (; ,) не нужны — ячейки уже в своих столбцах
• Первая строка — названия столбцов, далее участники

CSV / TXT:
• Первая строка — названия столбцов (ФИО;Должность;Телефон)
• Далее — участники, каждый с новой строки
• Разделитель: точка с запятой (;) или запятая (,)

Пример CSV:
ФИО;Должность;Телефон
Иван Петров;Менеджер;+7700123****
Алия Касымова;Директор;+7700765****`;

export const DEFAULT_COLUMNS: ColumnDef[] = [{ id: "col-1", name: "Участник" }];

export function isEventInfoValid(event: EventInfo): boolean {
  return event.eventName.trim().length > 0;
}
