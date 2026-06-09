export type AppTag = "finance" | "productivity" | "tools" | "lifestyle" | "business" | "photo" | "food";

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
    id: "music-editor",
    title: "Music Editor",
    description:
      "Подготовка музыки для фигурного катания, танцев и выступлений.",
    longDescription:
      "Браузерный редактор музыки: обрезка и склейка треков, fade in/out, crossfade, автоматическое сокращение до нужной длины и подготовка программ для фигурного катания. Экспорт MP3 и WAV. Вся обработка в браузере.",
    href: "/tools/music-editor",
    tags: ["tools", "lifestyle"],
    icon: "🎵",
    color: "from-indigo-500/10 to-indigo-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 6,
  },
  {
    id: "pdf-pages",
    title: "PDF Pages",
    description:
      "Удаляйте, переставляйте, поворачивайте, объединяйте и разделяйте PDF прямо в браузере.",
    longDescription:
      "Онлайн-редактор страниц PDF: удаление лишних листов, drag-and-drop сортировка, поворот сканов, объединение нескольких файлов и разделение на части. Вся обработка в браузере — файлы не загружаются на сервер.",
    href: "/tools/pdf-pages",
    tags: ["tools"],
    icon: "📄",
    color: "from-rose-500/10 to-rose-600/5",
    author: "QHub",
    authorType: "qhub",
    sortOrder: 5,
  },
  {
    id: "tax-calculator",
    title: "Налоговый калькулятор ИП",
    description: "Узнайте, сколько налогов заплатите и сколько останется на руки — за 30 секунд.",
    longDescription:
      "Расчёт ИПН, соцплатежей и чистого дохода для ИП Казахстана. 4 налоговых режима, льготы для пенсионеров и инвалидов, сравнение упрощёнки и ОУР. Актуально на 2026 год.",
    href: "/apps/tax-calculator",
    tags: ["business", "finance"],
    icon: "🧾",
    color: "from-purple-500/10 to-purple-600/5",
    author: "QHub",
    authorType: "qhub",
    beta: true,
    sortOrder: 4,
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
