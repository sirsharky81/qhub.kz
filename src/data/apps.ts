export type AppTag = "finance" | "productivity" | "tools" | "lifestyle" | "business" | "photo";

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
}

export const TAG_LABELS: Record<AppTag, string> = {
  finance: "Финансы",
  productivity: "Продуктивность",
  tools: "Инструменты",
  lifestyle: "Быт",
  business: "Бизнес",
  photo: "Фото",
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
  },
  {
    id: "tax-calculator",
    title: "Налоговый калькулятор ИП",
    description: "ИПН, СН, ОПВ, ОСМС — рассчитайте всё за 30 секунд.",
    longDescription:
      "Калькулятор налогов для индивидуальных предпринимателей Казахстана с учётом всех обязательных платежей.",
    href: "/apps/tax-calculator",
    tags: ["business", "finance"],
    icon: "🧾",
    color: "from-purple-500/10 to-purple-600/5",
    author: "QHub",
    authorType: "qhub",
    comingSoon: true,
  },
];

export const featuredApp = apps.find((a) => a.featured);
export const allApps = apps;
