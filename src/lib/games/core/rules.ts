import type { DispatchMeta, GameDefinition, GameValidationResult } from "./types";

export function validateWithDefinition<State, Action>(
  definition: GameDefinition<State, Action, unknown>,
  state: State,
  action: Action,
  meta: DispatchMeta,
): GameValidationResult {
  return definition.validateAction(state, action, meta);
}
