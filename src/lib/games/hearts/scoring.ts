import type { PlayingCard } from "@/lib/games/cards/types";
import type { HeartsPlayerState, HeartsRoundScore } from "./types";

export function cardPenalty(card: PlayingCard): number {
  if (card.suit === "hearts") return 1;
  if (card.suit === "spades" && card.rank === 12) return 13;
  return 0;
}

export function sumPenalty(cards: readonly PlayingCard[]): number {
  return cards.reduce((acc, card) => acc + cardPenalty(card), 0);
}

export function scoreHeartsRound(
  players: readonly HeartsPlayerState[],
  roundIndex: number,
): {
  players: HeartsPlayerState[];
  round: HeartsRoundScore;
} {
  const penalties = Object.fromEntries(players.map((p) => [p.id, sumPenalty(p.takenCards)]));
  const moonShooter = players.find((p) => penalties[p.id] === 26);

  const nextPlayers = players.map((player) => {
    const roundPenalty =
      moonShooter && moonShooter.id === player.id
        ? 0
        : moonShooter
          ? 26
          : penalties[player.id] ?? 0;

    return {
      ...player,
      takenCards: [],
      totalPenalty: player.totalPenalty + roundPenalty,
    };
  });

  return {
    players: nextPlayers,
    round: {
      roundIndex,
      penalties: Object.fromEntries(
        nextPlayers.map((player) => {
          const roundPenalty =
            moonShooter && moonShooter.id === player.id
              ? 0
              : moonShooter
                ? 26
                : penalties[player.id] ?? 0;
          return [player.id, roundPenalty];
        }),
      ),
      shootMoonBy: moonShooter?.id ?? null,
    },
  };
}

export function findLowestScorePlayers(players: readonly HeartsPlayerState[]): HeartsPlayerState[] {
  const min = Math.min(...players.map((player) => player.totalPenalty));
  return players.filter((player) => player.totalPenalty === min);
}
