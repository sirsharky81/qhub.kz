import type {
  LottoGameStatus,
  LottoSettings,
  LottoWinAlert,
  LottoWinRules,
} from "@/lib/random-picker/lotto";
import type { LottoTicket, LottoWinType } from "@/lib/random-picker/lotto-tickets";

export interface LottoRoomPlayer {
  id: string;
  name: string;
  ticket: LottoTicket | null;
  wins: LottoWinType[];
  joinToken: string;
  joinCode: string;
  joined: boolean;
  left: boolean;
}

export interface LottoRoomSnapshot {
  roomCode: string;
  status: LottoGameStatus;
  settings: LottoSettings;
  winRules: LottoWinRules;
  drawn: number[];
  remaining: number[];
  current: number | null;
  countdownSec: number;
  cardsGenerated: boolean;
  activeWinAlert: LottoWinAlert | null;
  players: LottoRoomPlayer[];
  version: number;
  updatedAt: number;
}

export interface LottoRoomRecord extends LottoRoomSnapshot {
  hostSecret: string;
  createdAt: number;
}

export type LottoRoomPublicPlayer = Omit<LottoRoomPlayer, "joinToken">;

export interface LottoParticipantView {
  room: Omit<LottoRoomSnapshot, "players"> & { players: LottoRoomPublicPlayer[] };
  player: LottoRoomPublicPlayer;
}
