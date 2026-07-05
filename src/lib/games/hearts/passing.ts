import type { PlayingCard } from "@/lib/games/cards/types";
import type { HeartsPassDirection, HeartsPlayerState, HeartsState } from "./types";

export function getPassDirection(roundIndex: number): HeartsPassDirection {
  const cycle: readonly HeartsPassDirection[] = ["left", "right", "across", "none"];
  return cycle[roundIndex % cycle.length]!;
}

function cardKey(card: PlayingCard): string {
  return card.id;
}

function removeCards(hand: readonly PlayingCard[], ids: readonly string[]): PlayingCard[] {
  const idSet = new Set(ids);
  return hand.filter((card) => !idSet.has(card.id));
}

function sortHand(hand: PlayingCard[]): PlayingCard[] {
  const suitOrder: Record<PlayingCard["suit"], number> = {
    clubs: 0,
    diamonds: 1,
    spades: 2,
    hearts: 3,
  };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return a.rank - b.rank;
  });
}

export function applyPassingSelections(state: HeartsState): HeartsPlayerState[] {
  const direction = state.passDirection;
  if (direction === "none") {
    return state.players.map((p) => ({ ...p, hand: sortHand([...p.hand]) }));
  }
  const players = state.players.map((p) => ({ ...p, hand: [...p.hand] }));
  const outgoing: PlayingCard[][] = players.map((player) => {
    const selection = state.passSelections[player.id] ?? [];
    const selected = player.hand.filter((card) => selection.includes(cardKey(card)));
    return selected;
  });
  const stripped = players.map((player) => {
    const selection = state.passSelections[player.id] ?? [];
    return {
      ...player,
      hand: removeCards(player.hand, selection),
    };
  });
  return stripped.map((player, idx) => {
    const senderIndex = (() => {
      if (direction === "left") return (idx - 1 + players.length) % players.length;
      if (direction === "right") return (idx + 1) % players.length;
      return (idx + 2) % players.length;
    })();
    return {
      ...player,
      hand: sortHand([...player.hand, ...outgoing[senderIndex]!]),
    };
  });
}

export function allPlayersSelectedForPass(state: HeartsState): boolean {
  if (state.passDirection === "none") return true;
  return state.players.every((player) => (state.passSelections[player.id] ?? []).length === 3);
}

export function findTwoClubsOwner(players: readonly HeartsPlayerState[]): string {
  const owner = players.find((player) =>
    player.hand.some((card) => card.suit === "clubs" && card.rank === 2),
  );
  if (!owner) {
    throw new Error("Deck invalid: 2♣ owner not found");
  }
  return owner.id;
}
