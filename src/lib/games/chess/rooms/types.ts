import type { ChessAction, ChessColor, ChessColorPref, ChessState, ChessTimeControl } from "../types";

export interface ChessRoomSeat {
  id: string;
  name: string;
  color: ChessColor | null;
  joinToken: string;
  connected: boolean;
  lastSeenAt: number;
}

export interface ChessRoomRecord {
  roomCode: string;
  hostSecret: string;
  hostPlayerId: string;
  hostColorPref: ChessColorPref;
  timeControl: ChessTimeControl;
  status: "open" | "playing" | "finished";
  seats: ChessRoomSeat[];
  state: ChessState;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChessRoomPublic {
  roomCode: string;
  status: ChessRoomRecord["status"];
  hostPlayerId: string;
  hostColorPref: ChessColorPref;
  timeControl: ChessTimeControl;
  seats: Omit<ChessRoomSeat, "joinToken">[];
  state: ChessState;
  version: number;
  updatedAt: number;
}

export interface ChessRoomJoinResult {
  roomCode: string;
  playerId: string;
  joinToken: string;
  hostSecret?: string;
  room: ChessRoomPublic;
}

export interface ChessDispatchPayload {
  playerId: string;
  joinToken: string;
  action: ChessAction;
}
