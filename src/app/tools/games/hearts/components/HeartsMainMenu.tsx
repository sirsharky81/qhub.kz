export function HeartsMainMenu({
  onQuickOffline,
  onQuickOnline,
  onCreateRoom,
  onJoinByCode,
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
}: {
  onQuickOffline: () => void;
  onQuickOnline: () => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  playerName: string;
  setPlayerName: (value: string) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Главное меню</h2>
      <div className="grid sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onQuickOffline}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-2"
        >
          Быстрая игра
        </button>
        <button
          type="button"
          onClick={onQuickOffline}
          className="rounded-lg bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 text-white text-sm font-medium px-3 py-2"
        >
          Новая игра против ИИ
        </button>
        <button
          type="button"
          onClick={onCreateRoom}
          className="rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2"
        >
          Создать комнату
        </button>
        <button
          type="button"
          onClick={onQuickOnline}
          className="rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2"
        >
          Быстрая онлайн-игра
        </button>
      </div>

      <div className="grid gap-2">
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Ваше имя (для онлайн-игры)"
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Код комнаты"
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onJoinByCode}
          className="rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2"
        >
          Присоединиться по коду
        </button>
      </div>
    </section>
  );
}
