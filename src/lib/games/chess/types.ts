export type ChessColor = "w" | "b";
export type ChessPieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type ChessPhase = "waiting" | "playing" | "finished";
export type ChessAiLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ChessColorPref = "w" | "b" | "random";

export type ChessEndReason =
  | "checkmate"
  | "stalemate"
  | "timeout"
  | "resign"
  | "draw_agreement"
  | "threefold"
  | "fifty_moves"
  | "insufficient"
  | "disconnect";

export interface ChessTimeControl {
  id: string;
  label: string;
  baseSec: number;
  incrementSec: number;
}

export const TIME_CONTROLS: readonly ChessTimeControl[] = [
  { id: "1+0", label: "Пуля 1+0", baseSec: 60, incrementSec: 0 },
  { id: "3+2", label: "Блиц 3+2", baseSec: 180, incrementSec: 2 },
  { id: "5+0", label: "Блиц 5+0", baseSec: 300, incrementSec: 0 },
  { id: "10+0", label: "Рапид 10+0", baseSec: 600, incrementSec: 0 },
  { id: "15+10", label: "Рапид 15+10", baseSec: 900, incrementSec: 10 },
];

export const DEFAULT_AI_TIME_CONTROL_ID = "10+0";
export const DEFAULT_ONLINE_TIME_CONTROL_ID = "5+0";

export function getTimeControl(id: string | undefined | null): ChessTimeControl {
  return TIME_CONTROLS.find((item) => item.id === id) ?? TIME_CONTROLS[3]!;
}

export interface ChessPlayerSeed {
  id: string;
  name: string;
  color: ChessColor;
  isBot?: boolean;
}

export interface ChessPlayerState {
  id: string;
  name: string;
  color: ChessColor;
  isBot: boolean;
}

export interface ChessMoveRecord {
  from: string;
  to: string;
  san: string;
  promotion?: ChessPieceType;
  captured?: ChessPieceType;
  color: ChessColor;
}

export interface ChessLastMove {
  from: string;
  to: string;
}

export interface ChessState {
  gameId: string;
  phase: ChessPhase;
  fen: string;
  pgn: string;
  players: ChessPlayerState[];
  currentTurn: ChessColor;
  lastMove: ChessLastMove | null;
  moves: ChessMoveRecord[];
  whiteMs: number;
  blackMs: number;
  incrementMs: number;
  lastMoveAt: number;
  clocksRunning: boolean;
  inCheck: boolean;
  drawOfferedBy: string | null;
  winnerId: string | null;
  winnerColor: ChessColor | null;
  endReason: ChessEndReason | null;
  timeControl: ChessTimeControl;
}

export type ChessAction =
  | { type: "move"; from: string; to: string; promotion?: ChessPieceType }
  | { type: "resign" }
  | { type: "offer_draw" }
  | { type: "accept_draw" }
  | { type: "decline_draw" };

export function oppositeColor(color: ChessColor): ChessColor {
  return color === "w" ? "b" : "w";
}

export function playerByColor(state: ChessState, color: ChessColor): ChessPlayerState | undefined {
  return state.players.find((player) => player.color === color);
}

export function playerById(state: ChessState, id: string): ChessPlayerState | undefined {
  return state.players.find((player) => player.id === id);
}
