import { describe, expect, it } from "vitest";
import { generateBarrierLanes, resetBarrierPattern } from "./barriers";
import {
  createInitialState,
  rowStepMs,
  scrollSpeed,
  spawnInterval,
  startGame,
  steer,
  tick,
  updateHighScore,
} from "./engine";
import { CAR_ROW, INITIAL_LIVES, LIFE_MILESTONES, MAX_SCORE } from "./constants";

describe("autoslalom engine", () => {
  it("starts with three lives and zero score", () => {
    const state = createInitialState();
    expect(state.lives).toBe(INITIAL_LIVES);
    expect(state.score).toBe(0);
    expect(state.carLane).toBe(1);
  });

  it("decreases row step interval with score and speed level", () => {
    const slow = rowStepMs(0, 1);
    const mid = rowStepMs(600, 8);
    const capped = rowStepMs(1500, 8);
    const atCap = rowStepMs(1200, 8);
    expect(mid).toBeLessThan(slow);
    expect(atCap).toBeLessThan(mid);
    expect(capped).toBeCloseTo(atCap, 0);
  });

  it("scrollSpeed alias increases with difficulty", () => {
    expect(scrollSpeed(600, 8)).toBeGreaterThan(scrollSpeed(0, 8));
  });

  it("spawnInterval alias scales with row steps", () => {
    expect(spawnInterval(0, 16)).toBeLessThan(spawnInterval(0, 1));
  });

  it("steers within three lanes", () => {
    let state = startGame(createInitialState());
    state = steer(state, "left", 1000);
    expect(state.carLane).toBe(0);
    state = steer(state, "left", 1100);
    expect(state.carLane).toBe(0);
    state = steer(state, "right", 1200);
    expect(state.carLane).toBe(1);
  });

  it("awards score when barrier passes in open lane (discrete rows)", () => {
    let state = startGame(createInitialState());
    const ms = rowStepMs(0, 8);
    state = {
      ...state,
      carLane: 1,
      rowTimer: ms - 1,
      rowsSinceSpawn: 99,
      barriers: [{ id: 1, row: CAR_ROW, lanes: [0, 2], scored: false }],
    };
    state = tick(state, 1);
    expect(state.score).toBe(1);
  });

  it("detects collision on car row", () => {
    let state = startGame(createInitialState());
    const ms = rowStepMs(0, 8);
    state = {
      ...state,
      carLane: 1,
      rowTimer: 10_000,
      barriers: [{ id: 1, row: CAR_ROW - 1, lanes: [1], scored: false }],
    };
    state = tick(state, ms);
    expect(state.phase).toBe("crash");
    expect(state.lives).toBe(2);
  });

  it("caps score at 2999", () => {
    let state = createInitialState();
    state = { ...state, score: MAX_SCORE, phase: "playing" };
    state = tick(state, 16);
    expect(state.score).toBeLessThanOrEqual(MAX_SCORE);
  });

  it("updates high score per mode", () => {
    const hs = updateHighScore({ A: 100, B: 50 }, "A", 150);
    expect(hs.A).toBe(150);
    expect(hs.B).toBe(50);
  });

  it("generates game A patterns with opposite or single lanes", () => {
    resetBarrierPattern(1);
    for (let i = 0; i < 50; i++) {
      const lanes = generateBarrierLanes("A");
      expect(lanes.length).toBeGreaterThanOrEqual(1);
      expect(lanes.length).toBeLessThanOrEqual(2);
      if (lanes.length === 2) {
        expect(lanes.sort().join(",")).toBe("0,2");
      }
    }
  });

  it("generates adjacent pairs in game B", () => {
    resetBarrierPattern(99);
    let foundAdjacent = false;
    for (let i = 0; i < 100; i++) {
      const lanes = generateBarrierLanes("B");
      if (lanes.length === 2 && Math.abs(lanes[0] - lanes[1]) === 1) {
        foundAdjacent = true;
        break;
      }
    }
    expect(foundAdjacent).toBe(true);
  });

  it("tracks life milestones constants", () => {
    expect(LIFE_MILESTONES).toContain(200);
    expect(LIFE_MILESTONES).toContain(2999);
  });
});
