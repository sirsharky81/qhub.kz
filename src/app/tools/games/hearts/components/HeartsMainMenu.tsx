export function HeartsMainMenu({
  onStartOffline,
  onCreateRoom,
  onJoinByCode,
  onCopyRoomCode,
  onLeaveRoom,
  onCloseRoom,
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
  onlineRoomCode,
  isRoomOwner,
}: {
  onStartOffline: () => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  onCopyRoomCode: () => void;
  onLeaveRoom: () => void;
  onCloseRoom: () => void;
  playerName: string;
  setPlayerName: (value: string) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
  onlineRoomCode: string | null;
  isRoomOwner: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Главное меню</h2>
      <section className="space-y-2 rounded-lg border border-violet-200/70 dark:border-violet-900/60 p-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Игра с ИИ</h3>
        <button
          type="button"
          onClick={onStartOffline}
          className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-2"
        >
          Новая игра против ИИ
        </button>
      </section>

      <section className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Онлайн-игра</h3>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Ваше имя"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm"
        />
        {onlineRoomCode ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
              Код комнаты: <span className="font-semibold tracking-wide">{onlineRoomCode}</span>
            </div>
            <button
              type="button"
              onClick={onCopyRoomCode}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2"
            >
              Скопировать код комнаты
            </button>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2"
            >
              Покинуть комнату
            </button>
            {isRoomOwner && (
              <button
                type="button"
                onClick={onCloseRoom}
                className="w-full rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm px-3 py-2"
              >
                Завершить онлайн-игру (закрыть комнату)
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onCreateRoom}
              className="w-full rounded-lg bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 text-white text-sm font-medium px-3 py-2"
            >
              Создать онлайн-игру
            </button>
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
                Присоединиться
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
