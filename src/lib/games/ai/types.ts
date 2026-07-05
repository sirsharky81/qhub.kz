export interface AiContext<State, Action> {
  state: State;
  playerId: string;
  legalActions: Action[];
}

export interface AiStrategy<State, Action> {
  id: string;
  chooseAction: (ctx: AiContext<State, Action>) => Action | null;
}
