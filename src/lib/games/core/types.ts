export interface GamePlayer {
  id: string;
  name: string;
  isBot: boolean;
}

export interface DispatchMeta {
  actorId: string;
  at: number;
}

export interface GameValidationResult {
  ok: boolean;
  reason?: string;
}

export interface GameDefinition<State, Action, Snapshot = State> {
  gameId: string;
  initialState: () => State;
  validateAction: (state: State, action: Action, meta: DispatchMeta) => GameValidationResult;
  applyAction: (state: State, action: Action, meta: DispatchMeta) => State;
  getLegalActions: (state: State, actorId: string) => Action[];
  isRoundFinished: (state: State) => boolean;
  scoreRound: (state: State) => State;
  isGameFinished: (state: State) => boolean;
  toSnapshot?: (state: State) => Snapshot;
}

export interface GameDispatchResult<State, Snapshot = State> {
  state: State;
  valid: boolean;
  reason?: string;
  snapshot: Snapshot;
}
