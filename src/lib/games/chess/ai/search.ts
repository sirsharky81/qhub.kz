import { Chess, type Move } from "chess.js";
import type { ChessAiLevel, ChessPieceType } from "../types";
import { evaluateBoard, pieceValue } from "./eval";

export interface ChessAiMove {
  from: string;
  to: string;
  promotion?: ChessPieceType;
}

interface LevelConfig {
  random?: boolean;
  captureBias?: number;
  maxDepth: number;
  timeMs: number;
  jitter: number;
  quiescence?: boolean;
}

const LEVELS: Record<number, LevelConfig> = {
  1: { random: true, captureBias: 0.15, maxDepth: 1, timeMs: 40, jitter: 1 },
  2: { random: true, captureBias: 0.4, maxDepth: 1, timeMs: 60, jitter: 1 },
  3: { maxDepth: 1, timeMs: 80, jitter: 0.45 },
  4: { maxDepth: 2, timeMs: 160, jitter: 0.28 },
  5: { maxDepth: 2, timeMs: 280, jitter: 0.12 },
  6: { maxDepth: 3, timeMs: 420, jitter: 0.06 },
  7: { maxDepth: 3, timeMs: 650, jitter: 0 },
  8: { maxDepth: 4, timeMs: 950, jitter: 0 },
  9: { maxDepth: 4, timeMs: 1400, jitter: 0, quiescence: true },
  10: { maxDepth: 5, timeMs: 2000, jitter: 0, quiescence: true },
};

const MATE = 100_000;
const INF = 1_000_000;

function toAiMove(move: Move): ChessAiMove {
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion as ChessPieceType | undefined,
  };
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const capA = a.captured ? pieceValue(a.captured as ChessPieceType) : 0;
    const capB = b.captured ? pieceValue(b.captured as ChessPieceType) : 0;
    const promoA = a.promotion ? 800 : 0;
    const promoB = b.promotion ? 800 : 0;
    return capB + promoB - (capA + promoA);
  });
}

function quiesce(chess: Chess, alpha: number, beta: number, deadline: number): number {
  if (Date.now() > deadline) return evaluateBoard(chess);
  let standPat = evaluateBoard(chess);
  if (chess.isCheckmate()) return -MATE;
  if (chess.isDraw()) return 0;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  const captures = chess.moves({ verbose: true }).filter((move) => move.captured || move.promotion);
  for (const move of orderMoves(captures)) {
    if (Date.now() > deadline) break;
    chess.move(move);
    const score = -quiesce(chess, -beta, -alpha, deadline);
    chess.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  deadline: number,
  ply: number,
  useQuiescence: boolean,
): number {
  if (Date.now() > deadline) return evaluateBoard(chess);
  if (chess.isCheckmate()) return -MATE + ply;
  if (chess.isDraw()) return 0;
  if (depth <= 0) {
    return useQuiescence ? quiesce(chess, alpha, beta, deadline) : evaluateBoard(chess);
  }
  const moves = orderMoves(chess.moves({ verbose: true }));
  if (moves.length === 0) return evaluateBoard(chess);
  let best = -INF;
  for (const move of moves) {
    if (Date.now() > deadline) break;
    chess.move(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, deadline, ply + 1, useQuiescence);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function searchRoot(chess: Chess, cfg: LevelConfig): { move: Move; score: number }[] {
  const deadline = Date.now() + cfg.timeMs;
  const moves = orderMoves(chess.moves({ verbose: true }));
  let scored = moves.map((move) => ({ move, score: -INF }));
  for (let depth = 1; depth <= cfg.maxDepth; depth += 1) {
    if (Date.now() > deadline) break;
    const next: { move: Move; score: number }[] = [];
    let alpha = -INF;
    for (const item of scored) {
      if (Date.now() > deadline) {
        next.push(item);
        continue;
      }
      chess.move(item.move);
      const score = -negamax(chess, depth - 1, -INF, -alpha, deadline, 1, Boolean(cfg.quiescence));
      chess.undo();
      next.push({ move: item.move, score });
      if (score > alpha) alpha = score;
    }
    next.sort((a, b) => b.score - a.score);
    scored = next;
  }
  return scored;
}

export function chooseAiMove(fen: string, level: ChessAiLevel | number): ChessAiMove | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;
  const cfg = LEVELS[Math.min(10, Math.max(1, Math.round(level)))] ?? LEVELS[5]!;
  if (cfg.random) {
    const captures = moves.filter((move) => move.captured);
    if (captures.length > 0 && Math.random() < (cfg.captureBias ?? 0)) {
      return toAiMove(pickRandom(captures));
    }
    return toAiMove(pickRandom(moves));
  }
  const scored = searchRoot(chess, cfg);
  const best = scored[0];
  if (!best) return toAiMove(pickRandom(moves));
  if (cfg.jitter <= 0) return toAiMove(best.move);
  const window = Math.max(40, Math.abs(best.score) * cfg.jitter);
  const pool = scored.filter((item) => best.score - item.score <= window);
  return toAiMove(pickRandom(pool).move);
}
