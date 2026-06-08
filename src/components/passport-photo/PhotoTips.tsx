export default function PhotoTips({ compact = false }: { compact?: boolean }) {
  const tips = [
    {
      title: "Фон",
      text: "Однотонный светлый: белая, серая или светло-голубая стена. Без узоров, мебели и резких теней.",
    },
    {
      title: "Одежда",
      text: "Контрастная однотонная одежда — не сливайтесь с фоном. Избегайте белого/голубого на светлом фоне.",
    },
    {
      title: "Съёмка",
      text: "Ровное освещение на лицо, камера на уровне глаз, волосы не закрывают лицо.",
    },
  ];

  if (compact) {
    return (
      <p className="text-xs text-gray-600 leading-relaxed">
        Для точной замены фона ИИ: однотонный светлый фон, контрастная одежда, без теней и лишних предметов.
      </p>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left">
      <p className="text-sm font-semibold text-gray-900 mb-3">
        Советы для лучшего результата
      </p>
      <ul className="flex flex-col gap-2.5">
        {tips.map((tip) => (
          <li key={tip.title} className="text-xs text-gray-600 leading-relaxed">
            <span className="font-semibold text-gray-900">{tip.title}:</span> {tip.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-500 border-t border-gray-200 pt-3">
        Чем проще фон и контрастнее одежда — тем точнее ИИ заменит фон на белый или голубой.
      </p>
    </div>
  );
}
