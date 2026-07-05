import { applyValidatedAction } from "./state-machine";
import { validateWithDefinition } from "./rules";
import type { DispatchMeta, GameDefinition, GameDispatchResult } from "./types";

export class GameEngine<State, Action, Snapshot = State> {
  private state: State;

  constructor(private readonly definition: GameDefinition<State, Action, Snapshot>) {
    this.state = this.definition.initialState();
  }

  public getState(): State {
    return this.state;
  }

  public getSnapshot(): Snapshot {
    if (this.definition.toSnapshot) {
      return this.definition.toSnapshot(this.state);
    }
    return this.state as unknown as Snapshot;
  }

  public dispatch(action: Action, meta: DispatchMeta): GameDispatchResult<State, Snapshot> {
    const validation = validateWithDefinition(this.definition, this.state, action, meta);
    if (!validation.ok) {
      return {
        state: this.state,
        valid: false,
        reason: validation.reason ?? "Action is not allowed",
        snapshot: this.getSnapshot(),
      };
    }
    this.state = applyValidatedAction(this.definition, this.state, action, meta);
    return {
      state: this.state,
      valid: true,
      snapshot: this.getSnapshot(),
    };
  }

  public replaceState(nextState: State): void {
    this.state = nextState;
  }
}
