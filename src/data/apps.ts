import {
  SPLIT_PRODUCT_DESCRIPTION,
  SPLIT_PRODUCT_NAME,
} from "@/lib/split/constants";

export type AppTag =
  | "finance"
  | "productivity"
  | "tools"
  | "lifestyle"
  | "business"
  | "photo"
  | "food"
  | "music"
  | "games"
  | "editor"
  | "taxes"
  | "documents"
  | "inventoryOs"
  | "qrBarcodeScan"
  | "osLabels"
  | "vcard"
  | "qrBarcode";

export interface App {
  id: string;
  title: string;
  description: string;
  longDescription: string;
  href: string;
  tags: AppTag[];
  icon: string;
  color: string;
  author: string;
  authorType: "qhub" | "community";
  featured?: boolean;
  comingSoon?: boolean;
  /** Сервис доступен, но расчёты ещё проверяются */
  beta?: boolean;
  /** Доступен только на localhost (скрыт на production для обычных пользователей) */
  devOnly?: boolean;
  /** Порядок на главной: меньше = раньше запущен. «Скоро» — в конце */
  sortOrder: number;
}

export const TAG_LABELS: Record<AppTag, string> = {
  finance: "Финансы",
  productivity: "Продуктивность",
  tools: "Инструменты",
  lifestyle: "Быт",
  business: "Бизнес",
  photo: "Фото",
  food: "Кулинария",
  music: "Музыка",
  games: "Игры",
  editor: "Редактор",
  taxes: "Налоги",
  documents: "Документы",
  inventoryOs: "Инвентаризация ОС",
  qrBarcodeScan: "Распознавание QR, Штрихкоды",
  osLabels: "Метки ОС",
  vcard: "Визитки",
  qrBarcode: "QR и штрихкод",
};

export const apps: App[] = [
  {
    id: "credit-calculator",
    title: "Кредитный калькулятор",
    description: "Рассчитайте ежемесячный платёж, переплату и полную стоимость кредита.",
    longDescription:
      "Умный кредитный калькулятор с аннуитетными и дифференцированными платежами, графиком погашения и сравнением предложений банков.",
    href: "/apps/credit-calculator",
    tags: ["finance"],
    icon: "💳",
    color: "from-blue-500/10 to-blue-600/5",
    author: "QHub",
    authorType: "qhub",
    featured: true,
    sortOrder: 1,
  },
  {
    id: "passport-photo",
    title: "Паспортное фото",
    description: "Сделайте паспортное фото с нужной обрезкой и белым или голубым фоном. Печать 1/4/6 фото на листе.",
    longDescription:
      "Загрузите портретное фото, выберите формат (3×4, 3.5×4.5, 4×5 см), уберите фон с помощью ИИ прямо в браузере и скачайте раскладку для печати на фотопринтере.",
    href: "/apps/passport-photo",
    tags: ["tools", "photo"],
    icon: "📷",
    color: "from-violet-500/10 to-violet-600/5",
    author: "QHub",
    authorType: "qhub",
    featured: false,
    sortOrder: 2,
  },
  {
    id: "recipe-finder",
    title: "Что приготовить?",
    description: "Введите продукты из холодильника или сфотографируйте его — ИИ предложит 5 блюд с рецептами.",
    longDescription:
      "Загрузите список ингредиентов или сделайте фото холодильника. ИИ подберёт 5 блюд с учётом типа кухни и категории (завтрак, обед, ужин). Каждый рецепт содержит время приготовления, сложность, калорийность и пошаговые инструкции. Экспорт в Word или печать.",
    href: "/apps/recipe-finder",
    tags: ["food", "lifestyle"],
    icon: "/apps/meal-match-logo.png",
    color: "from-green-500/10 to-green-600/5",
    author: "QHub",
    authorType: "qhub",
    featured: false,
    sortOrder: 3,
  },
  {
    id: "music",
    title: "QHub Music",
    description: "Локальный музыкальный плеер. Импорт папок и файлов, медиатека, фоновое воспроизведение.",
    longDescription:
      "Полноценный музыкальный плеер в браузере: MP3, FLAC, WAV и другие форматы. Вся музыка хранится локально на устройстве. Эквалайзер, очередь, избранное, Media Session для экрана блокировки.",
    href: "/tools/music",
    tags: ["tools", "music"],
    icon: "🎧",
    color: "from-gray-200/50 to-gray-50",
    author: "QHub",
    authorType: "qhub",
    featured: true,
    sortOrder: 0,
  },
  {
    id: "music-editor",
    title: "Music Editor",
    description:
      "Подготовка музыки для фигурного катания, танцев и выступлений.",
    longDescription:
      "Браузерный редактор музыки: обрезка и склейка треков, fade in/out, crossfade, автоматическое сокращение до нужной длины и подготовка программ для фигурного катания. Экспорт MP3 и WAV. Вся обработка в браузере.",
    href: "/tools/music-editor",
    tags: ["tools", "music", "editor"],
    icon: "🎵",
    color: "from-indigo-500/10 to-indigo-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 6,
  },
  {
    id: "audio-extractor",
    title: "Audio Extractor",
    description:
      "Извлечение аудиодорожки из YouTube — waveform и MP3/WAV.",
    longDescription:
      "Вставьте ссылку на видео: сервис эфемерно извлекает аудио, показывает waveform, позволяет прослушать и сохранить в MP3 (320 kbps) или WAV. Аудио не хранится на сервере.",
    href: "/tools/audio-extractor",
    tags: ["tools", "music"],
    icon: "🎙️",
    color: "from-fuchsia-500/10 to-fuchsia-600/5",
    author: "QHub",
    authorType: "qhub",
    beta: true,
    devOnly: true,
    sortOrder: 7,
  },
  {
    id: "guitar-tuner",
    title: "Guitar Tuner",
    description: "Тюнер для гитары, баса и укулеле — точная настройка в браузере.",
    longDescription:
      "Профессиональный браузерный тюнер с AudioWorklet pitch detection (MPM/YIN). Гитара, бас, укулеле, хроматик. Аудио обрабатывается локально, без отправки на сервер.",
    href: "/tools/guitar-tuner",
    tags: ["tools", "music"],
    icon: "🎸",
    color: "from-emerald-500/10 to-emerald-600/5",
    author: "QHub",
    authorType: "qhub",
    beta: true,
    sortOrder: 8,
  },
  {
    id: "qhub-games",
    title: "QHub Games",
    description:
      "Игровой раздел с карточными и настольными играми QHub.",
    longDescription:
      "Игровой раздел QHub с карточными и настольными играми. Включает Cards Game и Русское лото с офлайн и онлайн режимами.",
    href: "/tools/games",
    tags: ["tools", "games"],
    icon: "/tools/games/icon-192.png",
    color: "from-red-500/10 to-orange-600/5",
    author: "QHub",
    authorType: "qhub",
    featured: true,
    sortOrder: 9,
  },
  {
    id: "file-converter",
    title: "QHub Smart File Converter",
    description:
      "Умный помощник для файлов: HEIC, MP4, PDF, XLSX, EPUB — всё локально в браузере.",
    longDescription:
      "Загрузите файл — сервис определит тип и предложит лучшие действия. Конвертация изображений, видео, аудио, PDF, таблиц и книг без загрузки на сервер. Встроенный генератор PWA-иконок.",
    href: "/tools/file-converter",
    tags: ["tools", "productivity"],
    icon: "🔄",
    color: "from-indigo-500/10 to-violet-600/5",
    author: "QHub",
    authorType: "qhub",
    featured: true,
    sortOrder: 3,
  },
  {
    id: "pdf-pages",
    title: "PDF Pages",
    description:
      "Удаляйте, переставляйте, поворачивайте, объединяйте и разделяйте PDF прямо в браузере.",
    longDescription:
      "Онлайн-редактор страниц PDF: удаление лишних листов, drag-and-drop сортировка, поворот сканов, объединение нескольких файлов и разделение на части. Вся обработка в браузере — файлы не загружаются на сервер.",
    href: "/tools/pdf-pages",
    tags: ["tools", "editor"],
    icon: "📄",
    color: "from-rose-500/10 to-rose-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 5,
  },
  {
    id: "random-picker",
    title: "Генератор случайных чисел",
    description:
      "Случайный выбор участников, жеребьёвка, колесо, группы и генератор чисел — локально в браузере.",
    longDescription:
      "Универсальный сервис QHub для жеребьёвок, случайного выбора, перемешивания списков и распределения по группам. Проверяемый результат с SHA-256, PDF-протокол и PWA.",
    href: "/tools/random-picker",
    tags: ["tools", "productivity"],
    icon: "/tools/random-picker/icon-192.png",
    color: "from-blue-500/10 to-blue-600/5",
    author: "QHub",
    authorType: "qhub",
    featured: true,
    sortOrder: 3,
  },
  {
    id: "document-scanner",
    title: "Сканер документов",
  description:
    "Сканируйте с камеры или файла: автообрезка, фильтры, распознавание текста в Word и многостраничный PDF — локально в браузере.",
  longDescription:
    "Превратите фото документов в качественный PDF формата A4. Автоопределение границ, коррекция, OCR на русском, казахском и английском с экспортом в Word, печать и сохранение PDF. Вся обработка на устройстве — без сервера.",
    href: "/tools/document-scanner",
    tags: ["tools", "documents"],
    icon: "/tools/document-scanner/icon-192.png",
    color: "from-slate-500/10 to-slate-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 5,
  },
  {
    id: "code-scanner",
    title: "Сканер кодов",
    description:
      "Распознавание QR и штрих-кодов с камеры. Инвентаризация основных средств по базе 1С — отчёты по излишкам и недостачам. Коробки хранения — локально в браузере.",
    longDescription:
      "Сканируйте QR и штрих-коды с камеры или вводите вручную — мгновенное распознавание без сервера. Режим инвентаризации ОС: загрузите выгрузку из 1С, отсканируйте метки основных средств и получите ведомость с отчётами по излишкам и недостачам, экспортом .qhub-inventory и CSV. Также режим коробок QHub для учёта хранения.",
    href: "/tools/code-scanner",
    tags: ["tools", "inventoryOs", "qrBarcodeScan"],
    icon: "/tools/code-scanner/icon-192.png",
    color: "from-cyan-500/10 to-slate-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 4,
  },
  {
    id: "qr-generator",
    title: "QR-генератор",
    description:
      "Метки ОС с QR и штрихкодом — одна или массовая печать из базы 1С. Визитки, Wi-Fi, реквизиты и ссылки — локально в браузере.",
    longDescription:
      "Формирование этикеток основных средств: QR или штрихкод, одна метка вручную или загрузка выгрузки из 1С с печатью PDF. Универсальный генератор — визитки vCard, Wi-Fi, платёжные реквизиты, геопозиция, события календаря и обычные QR-ссылки. Настройка цветов, экспорт PNG/SVG — всё локально в браузере и PWA.",
    href: "/tools/qr-generator",
    tags: ["tools", "osLabels", "vcard", "qrBarcode"],
    icon: "/tools/qr-generator/icon-192.png",
    color: "from-gray-500/10 to-gray-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 4,
  },
  {
    id: "tax-calculator",
    title: "Налоговый калькулятор ИП",
    description: "Узнайте, сколько налогов заплатите и сколько останется на руки — за 30 секунд.",
    longDescription:
      "Расчёт ИПН, соцплатежей и чистого дохода для ИП Казахстана. 4 налоговых режима, льготы для пенсионеров и инвалидов, сравнение упрощёнки и ОУР. Актуально на 2026 год.",
    href: "/apps/tax-calculator",
    tags: ["taxes", "business", "finance"],
    icon: "🧾",
    color: "from-purple-500/10 to-purple-600/5",
    author: "QHub",
    authorType: "qhub",
    beta: true,
    sortOrder: 4,
  },
  {
    id: "messenger",
    title: "Мессенджер",
    description: "Закрытый зашифрованный чат для приглашённых пользователей.",
    longDescription:
      "End-to-end шифрование сообщений. История не сохраняется на сервере. Личные чаты и временные комнаты.",
    href: "/tools/messenger",
    tags: ["tools", "productivity"],
    icon: "💬",
    color: "from-sky-500/10 to-sky-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 50,
  },
  {
    id: "family",
    title: "Семья",
    description: "Геолокация детей и SOS: режим родителя и участника.",
    longDescription:
      "Родитель создаёт семью и сканирует QR с устройства ребёнка. Участник передаёт геолокацию и может отправить SOS. Координаты на сервере не дольше 24 часов.",
    href: "/tools/family",
    tags: ["lifestyle", "tools"],
    icon: "👨‍👩‍👧",
    color: "from-rose-500/10 to-rose-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 51,
  },
  {
    id: "split",
    title: SPLIT_PRODUCT_NAME,
    description: SPLIT_PRODUCT_DESCRIPTION,
    longDescription:
      "Комната для поездки, семьи или компании. Каждый вносит траты — сервис считает, кто кому должен. Погашения фиксируются без переводов денег в приложении.",
    href: "/tools/split",
    tags: ["finance", "tools", "lifestyle"],
    icon: "÷",
    color: "from-teal-500/10 to-teal-600/5",
    author: "QHub",
    authorType: "qhub",
    beta: true,
    sortOrder: 52,
  },
  {
    id: "kz-maps",
    title: "KZ Maps",
    description: "Карты Казахстана, треки GPX, маршруты и каталог красивых мест.",
    longDescription:
      "Онлайн и офлайн карты, запись походов, личные точки и мини-репозиторий достопримечательностей. Маршруты по дорогам и тропам, скачивание регионов как в Organic Maps.",
    href: "/tools/kz-maps",
    tags: ["lifestyle", "tools"],
    icon: "🗺️",
    color: "from-emerald-500/10 to-emerald-600/5",
    author: "QHub",
    authorType: "qhub",
    beta: true,
    sortOrder: 53,
  },
  {
    id: "deposit-calculator",
    title: "Калькулятор депозита",
    description: "Считайте доходность депозитов с учётом ГФСС и капитализации.",
    longDescription:
      "Калькулятор для сравнения депозитных предложений банков Казахстана с учётом государственного страхования вкладов.",
    href: "/apps/deposit-calculator",
    tags: ["finance"],
    icon: "🏦",
    color: "from-emerald-500/10 to-emerald-600/5",
    author: "QHub",
    authorType: "qhub",
    comingSoon: true,
    sortOrder: 100,
  },
  {
    id: "currency-converter",
    title: "Конвертер валют",
    description: "Актуальные курсы Нацбанка РК. Быстро и без рекламы.",
    longDescription:
      "Конвертер валют с курсами Национального банка Казахстана, историей курсов и удобным интерфейсом.",
    href: "/apps/currency-converter",
    tags: ["finance", "tools"],
    icon: "💱",
    color: "from-amber-500/10 to-amber-600/5",
    author: "QHub",
    authorType: "qhub",
    comingSoon: true,
    sortOrder: 101,
  },
];

/** Сортировка: запущенные по дате ввода, «Скоро» — в конце */
export function sortApps(list: App[]): App[] {
  return [...list].sort((a, b) => {
    if (a.comingSoon !== b.comingSoon) return a.comingSoon ? 1 : -1;
    return a.sortOrder - b.sortOrder;
  });
}

export const sortedApps = sortApps(apps);
export const featuredApp = apps.find((a) => a.featured);
export const allApps = sortedApps;
