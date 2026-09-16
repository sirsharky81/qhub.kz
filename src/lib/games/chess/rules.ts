import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { GameDefinition } from "@/lib/games/core/types";
import { applyClockTimeout, consumeTimeForMove, finishByReason } from "./clock";
import type {
  ChessAction,
  ChessColor,
  ChessEndReason,
  ChessMoveRecord,
  ChessPieceType,
  ChessPlayerSeed,
  ChessState,
  ChessTimeControl,
} from "./types";
import { oppositeColor, playerByColor, playerById } from "./types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function createChess(fen = START_FEN): Chess {
  return new Chess(fen);
}

export function isPromotionMove(from: string, to: string, fen: string): boolean {
  const chess = createChess(fen);
  return chess
    .moves({ verbose: true, square: from as Square })
    .some((move) => move.to === to && Boolean(move.promotion));
}

export function legalMovesFrom(fen: string, square?: string) {
  const chess = createChess(fen);
  return square
    ? chess.moves({ verbose: true, square: square as Square })
    : chess.moves({ verbose: true });
}

function endReasonFromChess(chess: Chess): ChessEndReason | null {
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isThreefoldRepetition()) return "threefold";
  if (chess.isInsufficientMaterial()) return "insufficient";
  if (chess.isDrawByFiftyMoves()) return "fifty_moves";
  if (chess.isDraw()) return "stalemate";
  return null;
}

function toMoveRecord(move: {
  from: string;
  to: string;
  san: string;
  promotion?: string;
  captured?: string;
  color: ChessColor;
}): ChessMoveRecord {
  return {
    from: move.from,
    to: move.to,
    san: move.san,
    promotion: move.promotion as ChessPieceType | undefined,
    captured: move.captured as ChessPieceType | undefined,
    color: move.color,
  };
}

export function capturedPieces(fen: string): { w: ChessPieceType[]; b: ChessPieceType[] } {
  const start: Record<ChessPieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const whiteLeft: Record<ChessPieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const blackLeft: Record<ChessPieceType, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const chess = createChess(fen);
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.color === "w") whiteLeft[cell.type] += 1;
      else blackLeft[cell.type] += 1;
    }
  }
  const missing = (left: Record<ChessPieceType, number>) => {
    const out: ChessPieceType[] = [];
    (Object.keys(start) as ChessPieceType[]).forEach((type) => {
      const count = Math.max(0, start[type] - left[type]);
      for (let i = 0; i < count; i += 1) out.push(type);
    });
    return out;
  };
  return { w: missing(whiteLeft), b: missing(blackLeft) };
}

export function createInitialChessState(params: {
  gameId?: string;
  players: readonly ChessPlayerSeed[];
  timeControl: ChessTimeControl;
  now?: number;
  phase?: ChessState["phase"];
}): ChessState {
  const now = params.now ?? Date.now();
  const chess = createChess();
  const baseMs = params.timeControl.baseSec * 1000;
  return {
    gameId: params.gameId ?? `chess-${now}`,
    phase: params.phase ?? "playing",
    fen: chess.fen(),
    pgn: "",
    players: params.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      isBot: Boolean(player.isBot),
    })),
    currentTurn: "w",
    lastMove: null,
    moves: [],
    whiteMs: baseMs,
    blackMs: baseMs,
    incrementMs: params.timeControl.incrementSec * 1000,
    lastMoveAt: now,
    clocksRunning: (params.phase ?? "playing") === "playing",
    inCheck: false,
    drawOfferedBy: null,
    winnerId: null,
    winnerColor: null,
    endReason: null,
    timeControl: params.timeControl,
  };
}

function finishFromPosition(state: ChessState, chess: Chess, now: number): ChessState {
  const reason = endReasonFromChess(chess);
  if (!reason) {
    return {
      ...state,
      fen: chess.fen(),
      pgn: chess.pgn(),
      currentTurn: chess.turn(),
      inCheck: chess.isCheck(),
    };
  }
  const isDecisive = reason === "checkmate";
  const winnerColor = isDecisive ? oppositeColor(chess.turn()) : null;
  const winner = winnerColor ? playerByColor(state, winnerColor) : null;
  return finishByReason(
    {
      ...state,
      fen: chess.fen(),
      pgn: chess.pgn(),
      currentTurn: chess.turn(),
      inCheck: chess.isCheck(),
    },
    now,
    {
      reason,
      winnerId: winner?.id ?? null,
      winnerColor: winner?.color ?? null,
    },
  );
}

export function createChessDefinition(params: {
  gameId?: string;
  players: readonly ChessPlayerSeed[];
  timeControl: ChessTimeControl;
  now?: number;
}): GameDefinition<ChessState, ChessAction> {
  return {
    gameId: "chess",
    initialState: () =>
      createInitialChessState({
        gameId: params.gameId,
        players: params.players,
        timeControl: params.timeControl,
        now: params.now,
      }),
    validateAction: (state, action, meta) => {
      if (state.phase === "waiting") {
        return { ok: false, reason: "Игра ещё не началась" };
      }
      if (state.phase === "finished") {
        return { ok: false, reason: "Партия уже завершена" };
      }
      const actor = playerById(state, meta.actorId);
      if (!actor) {
        return { ok: false, reason: "Игрок не найден" };
      }
      if (action.type === "resign") {
        return { ok: true };
      }
      if (action.type === "offer_draw") {
        if (state.drawOfferedBy === actor.id) {
          return { ok: false, reason: "Ничья уже предложена" };
        }
        return { ok: true };
      }
      if (action.type === "accept_draw") {
        if (!state.drawOfferedBy || state.drawOfferedBy === actor.id) {
          return { ok: false, reason: "Нет предложения ничьей" };
        }
        return { ok: true };
      }
      if (action.type === "decline_draw") {
        if (!state.drawOfferedBy || state.drawOfferedBy === actor.id) {
          return { ok: false, reason: "Нет предложения ничьей" };
        }
        return { ok: true };
      }
      if (actor.color !== state.currentTurn) {
        return { ok: false, reason: "Сейчас ход соперника" };
      }
      const chess = createChess(state.fen);
      const legal = chess.moves({ verbose: true, square: action.from as Square });
      const match = legal.find(
        (move) =>
          move.to === action.to &&
          (move.promotion ?? undefined) === (action.promotion ?? undefined),
      );
      if (match) return { ok: true };
      if (legal.some((move) => move.to === action.to && move.promotion)) {
        return { ok: false, reason: "Выберите фигуру для превращения" };
      }
      return { ok: false, reason: "Недопустимый ход" };
    },
    applyAction: (state, action, meta) => {
      const now = meta.at;
      if (action.type === "resign") {
        const actor = playerById(state, meta.actorId);
        const winnerColor = actor ? oppositeColor(actor.color) : null;
        const winner = winnerColor ? playerByColor(state, winnerColor) : null;
        return finishByReason(state, now, {
          reason: "resign",
          winnerId: winner?.id ?? null,
          winnerColor,
        });
      }
      if (action.type === "offer_draw") {
        return { ...state, drawOfferedBy: meta.actorId };
      }
      if (action.type === "decline_draw") {
        return { ...state, drawOfferedBy: null };
      }
      if (action.type === "accept_draw") {
        return finishByReason(state, now, {
          reason: "draw_agreement",
          winnerId: null,
          winnerColor: null,
        });
      }

      const timed = consumeTimeForMove(state, now);
      if (timed.timedOut) return timed.state;

      const chess = createChess(timed.state.fen);
      const played = chess.move({
        from: action.from,
        to: action.to,
        promotion: action.promotion as PieceSymbol | undefined,
      });
      const next: ChessState = {
        ...timed.state,
        fen: chess.fen(),
        pgn: chess.pgn(),
        currentTurn: chess.turn(),
        lastMove: { from: played.from, to: played.to },
        moves: [...timed.state.moves, toMoveRecord(played)],
        inCheck: chess.isCheck(),
        drawOfferedBy: timed.state.drawOfferedBy === meta.actorId ? timed.state.drawOfferedBy : null,
      };
      return finishFromPosition(next, chess, now);
    },
    getLegalActions: (state, actorId) => {
      if (state.phase !== "playing") return [];
      const actor = playerById(state, actorId);
      if (!actor) return [];
      const actions: ChessAction[] = [{ type: "resign" }];
      if (state.drawOfferedBy && state.drawOfferedBy !== actor.id) {
        actions.push({ type: "accept_draw" }, { type: "decline_draw" });
      } else if (!state.drawOfferedBy) {
        actions.push({ type: "offer_draw" });
      }
      if (actor.color !== state.currentTurn) return actions;
      const chess = createChess(state.fen);
      for (const move of chess.moves({ verbose: true })) {
        actions.push({
          type: "move",
          from: move.from,
          to: move.to,
          promotion: move.promotion as ChessPieceType | undefined,
        });
      }
      return actions;
    },
    isRoundFinished: (state) => state.phase === "finished",
    scoreRound: (state) => state,
    isGameFinished: (state) => state.phase === "finished",
  };
}

export { applyClockTimeout };
