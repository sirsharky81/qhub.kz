import type { DispatchMeta, GameDefinition } from "./types";

export function applyValidatedAction<State, Action>(
  definition: GameDefinition<State, Action, unknown>,
  state: State,
  action: Action,
  meta: DispatchMeta,
): State {
  let next = definition.applyAction(state, action, meta);
  if (definition.isRoundFinished(next)) {
    next = definition.scoreRound(next);
  }
  return next;
}
