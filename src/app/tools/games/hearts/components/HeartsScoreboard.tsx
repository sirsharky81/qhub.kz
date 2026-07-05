import type { HeartsState } from "@/lib/games/hearts/types";

export function HeartsScoreboard({ state }: { state: HeartsState }) {
  const lastRound = state.roundScores[state.roundScores.length - 1];
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Счёт</h2>
      <div className="mt-2 grid gap-2">
        {state.players.map((player) => (
          <div
            key={player.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5"
          >
            <div className="text-xs text-gray-700 dark:text-gray-200">
              {player.name}
              {state.winnerId === player.id ? " 🏆" : ""}
            </div>
            <div className="text-xs tabular-nums text-gray-600 dark:text-gray-300">
              {player.totalPenalty}
              {lastRound ? ` (+${lastRound.penalties[player.id] ?? 0})` : ""}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
