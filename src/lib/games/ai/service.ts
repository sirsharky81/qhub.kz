import type { AiContext, AiStrategy } from "./types";

export class GameAiService<State, Action> {
  constructor(private readonly strategies: Record<string, AiStrategy<State, Action>>) {}

  public choose(level: string, ctx: AiContext<State, Action>): Action | null {
    const strategy = this.strategies[level] ?? this.strategies.medium ?? this.strategies.easy;
    if (!strategy) {
      return ctx.legalActions[0] ?? null;
    }
    return strategy.chooseAction(ctx);
  }
}
