"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { CodeScannerLocale } from "./types";

type Messages = Record<string, string>;

const ru: Messages = {
  title: "Сканер кодов",
  subtitle: "Распознавание QR и штрих-кодов. Инвентаризация ОС по базе 1С — отчёты по излишкам и недостачам",
  privacy: "Данные не покидают устройство",
  modeSimple: "Простое сканирование",
  modeSimpleDesc: "Считать код и получить результат",
  modeStorage: "Коробка / ячейка",
  modeStorageDesc: "QR коробок QHub-генератора",
  modeInventory: "Инвентаризация",
  modeInventoryDesc: "Инвентаризация ОС по базе 1С — отчёты по излишкам и недостачам",
  back: "Назад",
  scan: "Сканировать",
  manualInput: "Ввести вручную",
  torch: "Фонарик",
  switchCamera: "Камера",
  pauseLabel: "Пауза между сканами",
  pauseHint: "Задержка после каждого кода, чтобы камера не считала один и тот же код повторно.",
  simpleScanHint: "Наведите камеру на код и дождитесь результата. Камера закроется автоматически.",
  scanAgain: "Сканировать снова",
  conveyorMode: "Непрерывное сканирование",
  conveyorModeHint: "Камера остаётся открытой после каждого кода — для обхода склада и инвентаризации.",
  cameraOn: "Использовать камеру",
  cameraOff: "Только ручной ввод",
  cameraOnHint: "Сканирование с камеры. Можно дополнительно вводить коды вручную.",
  cameraOffHint: "Камера выключена — добавляйте коды кнопкой «Ввести вручную».",
  manualOnlyHint: "Камера выключена. Нажмите «Ввести вручную», чтобы добавить код.",
  startScanning: "Начать сканирование",
  stopScanning: "Остановить сканирование",
  inventoryScanHint: "Камера не включается автоматически. Нажмите «Начать сканирование», когда будете готовы.",
  copy: "Копировать",
  share: "Поделиться",
  download: "Скачать",
  save: "Сохранить",
  copied: "Скопировано",
  rawContent: "Содержимое",
  parsedTable: "Таблица",
  cameraDenied: "Доступ к камере запрещён. Разрешите камеру или введите код вручную.",
  cameraError: "Не удалось открыть камеру",
  manualPlaceholder: "Вставьте или введите код",
  manualSubmit: "Применить",
  cancel: "Отмена",
  txt: "TXT",
  csv: "CSV",
  xlsx: "XLSX",
  xlsxLimit: "Для такого объёма рекомендуем CSV",
  storageHistory: "История сессии",
  storageFallback: "Не удалось распознать как коробку — показан сырой текст",
  boxNumber: "Номер",
  boxName: "Название",
  boxLocation: "Расположение",
  boxItems: "Содержимое",
  boxComment: "Комментарий",
  projects: "Проекты инвентаризации",
  createProject: "Создать проект",
  openProject: "Открыть",
  deleteProject: "Удалить",
  deleteForever: "Удалить навсегда",
  deleteProjectWarn:
    "Удалить проект {number}, «{name}»? Будут безвозвратно удалены база ОС, ведомость, журнал дублей и все фотографии. Это действие нельзя отменить.",
  downloadBeforeDelete: "Скачать проект перед удалением",
  projectName: "Название проекта",
  organization: "Организация",
  orgForm: "Форма",
  inventor: "ФИО инвентаризатора",
  startDate: "Дата начала",
  comment: "Комментарий",
  showMore: "Показать ещё",
  photoEveryScan: "Фотографировать каждый объект",
  photoWarn: "При большом количестве объектов фото могут занять значительный объём памяти",
  photoSizeWarn: "Объём фотографий проекта превысил 50 МБ — рекомендуем выгружать данные",
  create: "Создать",
  scenarioA: "Без базы ОС",
  scenarioB: "По базе ОС",
  ledger: "Ведомость сканирования",
  deleteRow: "Удалить строку",
  deleteRowConfirm: "Удалить эту запись из ведомости?",
  search: "Поиск",
  uploadBase: "Загрузить базу",
  xlsHint: "Для надёжного результата пересохраните XLS в XLSX",
  previewBase: "Предпросмотр базы",
  selectIdColumn: "Столбец идентификатора",
  idColumnHint: "Один из столбцов должен содержать уникальный идентификатор объекта",
  qualityCheck: "Контроль качества базы",
  totalRows: "Всего записей",
  emptyIds: "Пустых идентификаторов",
  duplicateIds: "Дублирующихся идентификаторов",
  continue: "Продолжить",
  matchBaseColumn: "Столбец базы для сопоставления",
  matchLedgerColumn: "Столбец ведомости",
  checkMapping: "Проверить сопоставление",
  mappingResult: "Совпадений найдено: {matched} из {total}",
  confirmMapping: "Подтвердить и продолжить",
  lastScan: "Последнее сканирование",
  statusFound: "Найден",
  statusDuplicate: "Дубль",
  statusSurplus: "Излишек",
  duplicateAsk: "Объект {id} уже был отсканирован {when}. Это дубль метки?",
  yes: "Да",
  no: "Нет",
  duplicateFormTitle: "Дублирующая метка",
  surplusFormTitle: "Излишек",
  location: "Место находки",
  description: "Описание",
  matchesBase: "Соответствие описанию в базе",
  photo: "Фото",
  reports: "Отчёты",
  exportAll: "Скачать все (ZIP)",
  completeProject: "Завершить проект",
  importProject: "Импорт .qhub-inventory",
  exportProject: "Экспорт проекта",
  resumeProject: "Продолжить проект?",
  resumeYes: "Продолжить",
  resumeNo: "Начать заново",
  changeLog: "Технический лог (локально в браузере)",
  active: "Активный",
  completed: "Завершён",
  foundSummary: "Найдено {found} / {total}",
  tabScan: "Сканирование",
  tabBase: "База ОС",
  tabReports: "Отчёты",
  backToScan: "К сканированию",
  backToProjects: "К списку проектов",
  readOnlyHint: "Проект завершён — только просмотр. Сканирование и правки недоступны.",
  scanDisabledReadOnly: "Сканирование недоступно в завершённом проекте. Переоткройте проект для продолжения работы.",
  reopenProject: "Переоткрыть проект",
  reopenProjectWarn: "Переоткрыть проект для продолжения инвентаризации? Дата и время переоткрытия будут записаны в журнал.",
  reopenConfirm: "Переоткрыть",
  baseTabHint: "Сверка с загруженной базой ОС. Статус «Не найден» фиксируется при завершении проекта.",
  baseFilterAll: "Все",
  baseFilterFound: "Найденные",
  baseFilterPending: "Не проверенные",
  baseFilterNotFound: "Не найденные",
  baseRowCount: "Показано {shown} из {total}",
  baseNotAvailable: "База ОС доступна только в режиме «По базе ОС» после загрузки файла.",
  fullBaseImportHint:
    "Все позиции базы ОС с результатами инвентаризации: статус, дата и время, количество сканирований, реквизиты проекта.",
  downloadCsv1C: "Скачать CSV для 1С",
  fullBaseImportFormat: "CSV с BOM, разделитель «;», кодировка UTF-8 — совместимо с импортом в 1С:Предприятие и Excel.",
  langRu: "Рус",
  langKk: "Қаз",
  langEn: "Eng",
};

const kk: Messages = {
  ...ru,
  title: "Код сканері",
  subtitle: "QR және штрих-код тану. 1С базасымен НҚ инвентаризациясы — артықтық пен тапшылық есептері",
  modeInventory: "Инвентаризация",
  modeInventoryDesc: "1С базасымен НҚ инвентаризациясы — артықтық пен тапшылық",
  back: "Артқа",
  copy: "Көшіру",
  save: "Сақтау",
  create: "Жасау",
  continue: "Жалғастыру",
  yes: "Иә",
  no: "Жоқ",
};

const en: Messages = {
  ...ru,
  title: "Code Scanner",
  subtitle: "QR and barcode recognition. Fixed asset inventory against 1C base — surplus and shortage reports",
  modeSimple: "Simple scan",
  modeSimpleDesc: "Read a code and get the result",
  modeStorage: "Storage box",
  modeStorageDesc: "QHub storage box QR codes",
  modeInventory: "Inventory",
  modeInventoryDesc: "Fixed asset inventory vs 1C base — surplus and shortage reports",
  back: "Back",
  scan: "Scan",
  scanAgain: "Scan again",
  copy: "Copy",
  share: "Share",
  save: "Save",
  create: "Create",
  continue: "Continue",
  yes: "Yes",
  no: "No",
  manualInput: "Enter manually",
  simpleScanHint: "Point the camera at a code. The camera closes automatically after a successful read.",
  conveyorMode: "Continuous scanning",
  conveyorModeHint: "Camera stays open after each code — for warehouse walks and inventory.",
  pauseHint: "Delay after each code so the same label is not read twice.",
  cameraOn: "Use camera",
  cameraOff: "Manual input only",
  cameraOnHint: "Scan with the camera. You can also enter codes manually.",
  cameraOffHint: "Camera is off — add codes with «Enter manually».",
  manualOnlyHint: "Camera is off. Tap «Enter manually» to add a code.",
  startScanning: "Start scanning",
  stopScanning: "Stop scanning",
  inventoryScanHint: "The camera does not start automatically. Tap «Start scanning» when ready.",
};

const ALL: Record<CodeScannerLocale, Messages> = { ru, kk, en };

export const LOCALE_OPTIONS: { id: CodeScannerLocale; labelKey: string }[] = [
  { id: "ru", labelKey: "langRu" },
  { id: "kk", labelKey: "langKk" },
  { id: "en", labelKey: "langEn" },
];

const Ctx = createContext<{ locale: CodeScannerLocale; t: (key: string, vars?: Record<string, string | number>) => string; setLocale: (l: CodeScannerLocale) => void } | null>(null);

export function CodeScannerI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<CodeScannerLocale>("ru");
  const value = useMemo(() => {
    const messages = ALL[locale];
    return {
      locale,
      setLocale,
      t: (key: string, vars?: Record<string, string | number>) => {
        let text = messages[key] ?? ru[key] ?? key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            text = text.replace(`{${k}}`, String(v));
          }
        }
        return text;
      },
    };
  }, [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCodeScannerT() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("CodeScannerI18nProvider required");
  return ctx;
}
