import type { HeartsState } from "@/lib/games/hearts/types";

export function HeartsScoreboard({
  state,
  onlinePlayerIds,
}: {
  state: HeartsState;
  onlinePlayerIds?: Set<string>;
}) {
  const lastRound = state.roundScores[state.roundScores.length - 1];
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Счёт</h2>
      <div className="mt-2 grid gap-2">
        {state.players.map((player) => {
          const heartsTaken = player.takenCards.filter((card) => card.suit === "hearts").length;
          const queenSpadesTaken = player.takenCards.some((card) => card.suit === "spades" && card.rank === 12);
          return (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200">
                  {onlinePlayerIds?.has(player.id) && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
                      aria-label="Онлайн игрок"
                      title="Онлайн игрок"
                    />
                  )}
                  {player.name}
                  {state.winnerId === player.id ? " 🏆" : ""}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Взято: {player.takenCards.length} {heartsTaken > 0 ? `· ♥ ${heartsTaken}` : ""}{" "}
                  {queenSpadesTaken ? "· Q♠" : ""}
                </div>
              </div>
              <div className="text-xs tabular-nums text-gray-600 dark:text-gray-300">
                {player.totalPenalty}
                {lastRound ? ` (+${lastRound.penalties[player.id] ?? 0})` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
