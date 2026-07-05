import { createStandardDeck52, dealEvenly, shuffleDeck } from "@/lib/games/cards/deck";
import type { PlayingCard } from "@/lib/games/cards/types";
import type { GameDefinition, GameValidationResult } from "@/lib/games/core/types";
import { findLowestScorePlayers, scoreHeartsRound } from "./scoring";
import {
  allPlayersSelectedForPass,
  applyPassingSelections,
  findTwoClubsOwner,
  getPassDirection,
} from "./passing";
import { isActionLegal, legalCardsForPlayer } from "./validators";
import type {
  HeartsAction,
  HeartsConfig,
  HeartsPlayerSeed,
  HeartsPlayerState,
  HeartsState,
} from "./types";

const DEFAULT_CONFIG: HeartsConfig = {
  targetScore: 100,
  turnTimeSec: 30,
  passTimeSec: 30,
};

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

function createRoundPlayers(prev: readonly HeartsPlayerState[]): HeartsPlayerState[] {
  const deck = shuffleDeck(createStandardDeck52());
  const hands = dealEvenly(deck, prev.length);
  return prev.map((player, index) => ({
    ...player,
    hand: sortHand(hands[index]!),
    takenCards: [],
  }));
}

function createInitialPlayers(input: readonly HeartsPlayerSeed[]): HeartsPlayerState[] {
  const players = input.map((player) => ({
    id: player.id,
    name: player.name,
    isBot: player.isBot ?? false,
    aiLevel: player.aiLevel ?? "medium",
    hand: [],
    takenCards: [],
    totalPenalty: 0,
  }));
  return createRoundPlayers(players);
}

function nextPlayerId(state: HeartsState, currentPlayerId: string): string {
  const index = state.players.findIndex((player) => player.id === currentPlayerId);
  if (index === -1) return state.players[0]!.id;
  return state.players[(index + 1) % state.players.length]!.id;
}

function firstPassAutoPick(hand: readonly PlayingCard[]): string[] {
  const sorted = [...hand].sort((a, b) => {
    const score = (c: PlayingCard) => {
      if (c.suit === "spades" && c.rank === 12) return 1000;
      if (c.suit === "hearts") return 500 + c.rank;
      return c.rank;
    };
    return score(b) - score(a);
  });
  return sorted.slice(0, 3).map((card) => card.id);
}

function collectTrick(state: HeartsState): HeartsState {
  const leadSuit = state.trick.leadSuit;
  if (!leadSuit || state.trick.cards.length !== state.players.length) {
    return state;
  }
  let winner = state.trick.cards[0]!;
  for (const played of state.trick.cards) {
    if (played.card.suit === leadSuit && played.card.rank > winner.card.rank) {
      winner = played;
    }
  }
  const players = state.players.map((player) => {
    if (player.id !== winner.playerId) return player;
    return {
      ...player,
      takenCards: [...player.takenCards, ...state.trick.cards.map((entry) => entry.card)],
    };
  });
  return {
    ...state,
    players,
    currentTurnId: winner.playerId,
    lastTrick: state.trick.cards,
    trick: {
      leaderId: winner.playerId,
      leadSuit: null,
      cards: [],
    },
  };
}

function shouldBreakHearts(state: HeartsState, card: PlayingCard, actorId: string): boolean {
  if (card.suit !== "hearts") return state.heartsBroken;
  if (state.heartsBroken) return true;
  const isLead = state.trick.cards.length === 0;
  if (isLead) return false;
  const leadSuit = state.trick.leadSuit;
  const actor = state.players.find((player) => player.id === actorId);
  if (!leadSuit || !actor) return false;
  const canFollow = actor.hand.some((c) => c.suit === leadSuit);
  if (canFollow) return false;
  return true;
}

function beginRoundWithExistingTotals(state: HeartsState): HeartsState {
  const nextRoundIndex = state.roundIndex + 1;
  const players = createRoundPlayers(state.players);
  const passDirection = getPassDirection(nextRoundIndex);
  const currentTurnId = findTwoClubsOwner(players);
  return {
    ...state,
    players,
    roundIndex: nextRoundIndex,
    passDirection,
    passSelections: {},
    heartsBroken: false,
    phase: passDirection === "none" ? "playing" : "passing",
    currentTurnId,
    trick: {
      leaderId: currentTurnId,
      leadSuit: null,
      cards: [],
    },
    lastTrick: [],
    winnerId: null,
  };
}

export function createHeartsDefinition(params: {
  gameId?: string;
  players: HeartsPlayerSeed[];
  config?: Partial<HeartsConfig>;
}): GameDefinition<HeartsState, HeartsAction> {
  const cfg = { ...DEFAULT_CONFIG, ...params.config };
  return {
    gameId: "hearts",
    initialState: () => {
      const players = createInitialPlayers(params.players);
      const passDirection = getPassDirection(0);
      const currentTurnId = findTwoClubsOwner(players);
      return {
        gameId: params.gameId ?? `hearts-${Date.now()}`,
        phase: passDirection === "none" ? "playing" : "passing",
        config: cfg,
        players,
        roundIndex: 0,
        passDirection,
        passSelections: {},
        currentTurnId,
        heartsBroken: false,
        trick: {
          leaderId: currentTurnId,
          leadSuit: null,
          cards: [],
        },
        lastTrick: [],
        roundScores: [],
        winnerId: null,
      };
    },
    validateAction: (state, action): GameValidationResult => {
      const legal = isActionLegal(state, action);
      return legal.ok ? { ok: true } : { ok: false, reason: legal.reason };
    },
    applyAction: (state, action): HeartsState => {
      if (action.type === "select_pass_cards") {
        const passSelections = { ...state.passSelections, [action.playerId]: [...action.cardIds] };
        const next = { ...state, passSelections };
        if (!allPlayersSelectedForPass(next)) {
          return next;
        }
        const players = applyPassingSelections(next);
        const currentTurnId = findTwoClubsOwner(players);
        return {
          ...next,
          players,
          phase: "playing",
          currentTurnId,
          trick: {
            leaderId: currentTurnId,
            leadSuit: null,
            cards: [],
          },
        };
      }

      if (action.type === "auto_fill_pass") {
        if (state.phase !== "passing") return state;
        const next = { ...state, passSelections: { ...state.passSelections } };
        for (const player of state.players) {
          const selected = next.passSelections[player.id] ?? [];
          if (selected.length === 3 || state.passDirection === "none") continue;
          next.passSelections[player.id] = firstPassAutoPick(player.hand);
        }
        if (!allPlayersSelectedForPass(next)) {
          return next;
        }
        const players = applyPassingSelections(next);
        const currentTurnId = findTwoClubsOwner(players);
        return {
          ...next,
          players,
          phase: "playing",
          currentTurnId,
          trick: {
            leaderId: currentTurnId,
            leadSuit: null,
            cards: [],
          },
        };
      }

      if (action.type === "play_card") {
        const actor = state.players.find((player) => player.id === action.playerId);
        if (!actor) return state;
        const card = actor.hand.find((c) => c.id === action.cardId);
        if (!card) return state;
        const players = state.players.map((player) => {
          if (player.id !== actor.id) return player;
          return {
            ...player,
            hand: player.hand.filter((item) => item.id !== card.id),
          };
        });
        const leadSuit =
          state.trick.cards.length === 0 ? card.suit : (state.trick.leadSuit ?? card.suit);
        let next: HeartsState = {
          ...state,
          players,
          heartsBroken: shouldBreakHearts(state, card, actor.id),
          trick: {
            ...state.trick,
            leadSuit,
            cards: [...state.trick.cards, { playerId: actor.id, card }],
          },
        };
        if (next.trick.cards.length < next.players.length) {
          next = {
            ...next,
            currentTurnId: nextPlayerId(next, actor.id),
          };
          return next;
        }
        return collectTrick(next);
      }

      return state;
    },
    getLegalActions: (state, actorId) => {
      if (state.phase === "passing") {
        const player = state.players.find((p) => p.id === actorId);
        if (!player) return [];
        return [
          {
            type: "select_pass_cards",
            playerId: actorId,
            cardIds: player.hand.slice(0, 3).map((card) => card.id),
          },
        ];
      }
      if (state.phase !== "playing") return [];
      return legalCardsForPlayer(state, actorId).map((card) => ({
        type: "play_card" as const,
        playerId: actorId,
        cardId: card.id,
      }));
    },
    isRoundFinished: (state) =>
      state.phase === "playing" &&
      state.players.every((player) => player.hand.length === 0) &&
      state.trick.cards.length === 0,
    scoreRound: (state) => {
      const roundResult = scoreHeartsRound(state.players, state.roundIndex);
      const roundScores = [...state.roundScores, roundResult.round];
      const anyoneReachedTarget = roundResult.players.some(
        (player) => player.totalPenalty >= state.config.targetScore,
      );

      if (!anyoneReachedTarget) {
        return beginRoundWithExistingTotals({
          ...state,
          players: roundResult.players,
          roundScores,
          phase: "round_end",
        });
      }

      const best = findLowestScorePlayers(roundResult.players);
      if (best.length !== 1) {
        return beginRoundWithExistingTotals({
          ...state,
          players: roundResult.players,
          roundScores,
          phase: "round_end",
        });
      }

      return {
        ...state,
        players: roundResult.players,
        roundScores,
        phase: "game_end",
        winnerId: best[0]!.id,
      };
    },
    isGameFinished: (state) => state.phase === "game_end",
  };
}
