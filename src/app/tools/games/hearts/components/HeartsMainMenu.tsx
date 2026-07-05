export function HeartsMainMenu({
  onStartOffline,
  onCreateRoom,
  onJoinByCode,
  onCopyRoomCode,
  onLeaveRoom,
  onCloseRoom,
  onStartOnlineGame,
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
  onlineRoomCode,
  isRoomOwner,
  onlineStatus,
  onlinePlayersCount,
}: {
  onStartOffline: () => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  onCopyRoomCode: () => void;
  onLeaveRoom: () => void;
  onCloseRoom: () => void;
  onStartOnlineGame: () => void;
  playerName: string;
  setPlayerName: (value: string) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
  onlineRoomCode: string | null;
  isRoomOwner: boolean;
  onlineStatus: "open" | "playing" | "finished" | null;
  onlinePlayersCount: number;
}) {
  const keepInputVisible = (input: HTMLInputElement) => {
    const scrollContainer = input.closest('[data-hearts-scroll="true"]');
    const scrollToInput = () => {
      if (scrollContainer instanceof HTMLElement) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const topGap = inputRect.top - containerRect.top;
        const desiredTop = 88;
        scrollContainer.scrollTo({
          top: scrollContainer.scrollTop + topGap - desiredTop,
          behavior: "auto",
        });
        return;
      }
      input.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
    };
    requestAnimationFrame(scrollToInput);
    window.setTimeout(scrollToInput, 250);
    window.setTimeout(scrollToInput, 500);
  };

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3 md:max-w-3xl md:mx-auto md:p-3 md:space-y-2">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Главное меню</h2>
      <section className="space-y-2 rounded-lg border border-violet-200/70 dark:border-violet-900/60 p-3 md:p-2.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Игра с ИИ</h3>
        <button
          type="button"
          onClick={onStartOffline}
          className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-2 md:py-1.5"
        >
          Новая игра против ИИ
        </button>
      </section>

      <section className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 md:p-2.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Онлайн-игра</h3>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          onFocus={(e) => keepInputVisible(e.currentTarget)}
          placeholder="Ваше имя"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 md:py-1.5 text-base sm:text-sm"
        />
        {onlineRoomCode ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {isRoomOwner ? "Вы владелец комнаты" : "Вы участник комнаты"}
            </p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm">
              Код комнаты: <span className="font-semibold tracking-wide">{onlineRoomCode}</span>
            </div>
            {onlineStatus === "open" && (
              <div className="space-y-2">
                <p className="rounded-lg bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Ожидание игроков и начала игры создателем комнаты. Игроков в комнате: {onlinePlayersCount}/4.
                </p>
                {isRoomOwner && (
                  <button
                    type="button"
                    onClick={onStartOnlineGame}
                    className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-2 md:py-1.5 font-medium"
                  >
                    Начать онлайн-игру
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onCopyRoomCode}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2 md:py-1.5"
            >
              Скопировать код комнаты
            </button>
            <button
              type="button"
              onClick={onLeaveRoom}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2 md:py-1.5"
            >
              Покинуть комнату
            </button>
            {isRoomOwner && (
              <button
                type="button"
                onClick={onCloseRoom}
                className="w-full rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm px-3 py-2 md:py-1.5"
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
              className="w-full rounded-lg bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 text-white text-sm font-medium px-3 py-2 md:py-1.5"
            >
              Создать онлайн игру
            </button>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 md:p-2 space-y-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Присоединиться к игре</p>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onFocus={(e) => keepInputVisible(e.currentTarget)}
                placeholder="Код комнаты"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 md:py-1.5 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={onJoinByCode}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 text-sm px-3 py-2 md:py-1.5"
              >
                Присоединиться к игре
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
