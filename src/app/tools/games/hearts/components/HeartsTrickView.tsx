import { CardSvg } from "@/components/games/CardSvg";
import type { HeartsState } from "@/lib/games/hearts/types";

export function HeartsTrickView({ state }: { state: HeartsState }) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Текущая взятка</h2>
        <span className="text-xs text-gray-500">
          {state.heartsBroken ? "♥ открыты" : "♥ закрыты"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {state.players.map((player) => {
          const played = state.trick.cards.find((card) => card.playerId === player.id);
          return (
            <div
              key={player.id}
              className="rounded-lg border border-gray-100 dark:border-gray-700 p-2 flex flex-col items-center gap-1"
            >
              <span className="text-[11px] text-gray-500">{player.name}</span>
              {played ? (
                <div className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 shadow-sm">
                  <CardSvg card={played.card} className="w-[62px] sm:w-[76px] lg:w-[86px] aspect-[223/312]" />
                </div>
              ) : (
                <div className="w-[62px] sm:w-[76px] lg:w-[86px] aspect-[223/312] rounded-md border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60" />
              )}
            </div>
          );
        })}
      </div>
      {state.lastTrick.length > 0 && (
        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
          Последняя взятка:{" "}
          {state.lastTrick.map((entry) => `${entry.card.id} (${entry.playerId})`).join(", ")}
        </div>
      )}
    </section>
  );
}
