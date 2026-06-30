"use client";

const OEM_GUIDES: Record<string, { title: string; steps: string[] }> = {
  xiaomi: {
    title: "Xiaomi / Redmi / POCO",
    steps: [
      "Настройки → Приложения → QHub → Автозапуск — включить",
      "Настройки → Батарея → QHub — «Без ограничений»",
    ],
  },
  huawei: {
    title: "Huawei / Honor",
    steps: ["Настройки → Батарея → Запуск приложений → QHub — вручную, все переключатели включены"],
  },
  oppo: {
    title: "Oppo / Realme",
    steps: ["Настройки → Батарея → QHub → разрешить работу в фоне"],
  },
  vivo: {
    title: "Vivo",
    steps: ["Настройки → Батарея → Фоновая активность → QHub — разрешить"],
  },
};

function detectOem(manufacturer: string): keyof typeof OEM_GUIDES | null {
  const m = manufacturer.toLowerCase();
  if (m.includes("xiaomi") || m.includes("redmi") || m.includes("poco")) return "xiaomi";
  if (m.includes("huawei") || m.includes("honor")) return "huawei";
  if (m.includes("oppo") || m.includes("realme")) return "oppo";
  if (m.includes("vivo")) return "vivo";
  return null;
}

export function OemBatteryGuide({ manufacturer }: { manufacturer?: string }) {
  if (!manufacturer) return null;
  const key = detectOem(manufacturer);
  if (!key) return null;
  const guide = OEM_GUIDES[key];

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
      <p className="font-semibold">Рекомендация для {guide.title}</p>
      <p className="text-xs text-amber-900/80">
        На этом устройстве фоновая геолокация может останавливаться системой. Проверьте настройки:
      </p>
      <ul className="list-disc pl-5 text-xs space-y-1">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </div>
  );
}
